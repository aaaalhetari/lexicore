// LexiCore: Generate TTS for definition/sentence and save to vocabulary
// Updates audio_stage1_definitions, audio_stage2_sentences, audio_stage3_correct, audio_stage3_incorrect

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")

interface TTSForContentRequest {
  user_id: string
  word_id: number
  word: string
  text: string
  stage: 1 | 2 | 3
  index: number
  sub_type?: "correct" | "incorrect" // for stage 3 only
}

function sanitizeWord(word: string): string {
  return (word ?? "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "word"
}

async function generateTTS(text: string): Promise<ArrayBuffer> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set")

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "tts-1-hd",
      input: text,
      voice: "alloy",
    }),
  })
  if (!res.ok) throw new Error(`OpenAI TTS error: ${await res.text()}`)
  return res.arrayBuffer()
}

function getStoragePath(
  userId: string,
  wordId: number,
  word: string,
  stage: number,
  index: number,
  subType?: string
): string {
  const safe = sanitizeWord(word)
  const suffix = subType ? `_${subType}_${index}` : `_${index}`
  return `all-lexicore-audio/${userId}/${wordId}-${safe}/stage${stage}${suffix}.mp3`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY not set in Supabase Edge Function secrets" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  try {
    let body: TTSForContentRequest
    try {
      body = (await req.json()) as TTSForContentRequest
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }
    const { user_id, word_id, word, text, stage, index, sub_type } = body
    const cleanText = (text ?? "").trim()
    if (!user_id || !word_id || !word || !cleanText || stage < 1 || stage > 3 || index < 0) {
      return new Response(
        JSON.stringify({
          error: "user_id, word_id, word, text, stage (1-3), index required",
          received: { user_id: !!user_id, word_id: !!word_id, word: !!word, text: !!cleanText, stage, index },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const audioBuffer = await generateTTS(cleanText)
    const subType = stage === 3 ? (sub_type ?? "correct") : undefined
    const path = getStoragePath(user_id, word_id, word, stage, index, subType)

    const { error: uploadErr } = await supabase.storage.from("lexicore-audio").upload(path, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: true,
    })
    if (uploadErr) throw uploadErr

    const { data: urlData } = supabase.storage.from("lexicore-audio").getPublicUrl(path)
    const finalUrl = urlData.publicUrl

    const { data: vocab } = await supabase
      .from("vocabulary")
      .select("stage1_definitions, stage2_sentences, audio_stage1_definitions, audio_stage2_sentences, audio_stage3_correct, audio_stage3_incorrect")
      .eq("id", word_id)
      .eq("user_id", user_id)
      .single()

    if (!vocab) throw new Error("Word not found")

    if (stage === 1) {
      const defs = (vocab.stage1_definitions ?? []) as unknown[]
      if (defs[index]) {
        const arr = Array.isArray(vocab.audio_stage1_definitions) ? [...(vocab.audio_stage1_definitions as string[])] : []
        while (arr.length <= index) arr.push("")
        arr[index] = finalUrl
        await supabase
          .from("vocabulary")
          .update({ audio_stage1_definitions: arr })
          .eq("id", word_id)
          .eq("user_id", user_id)
      }
    } else if (stage === 2) {
      const sents = (vocab.stage2_sentences ?? []) as unknown[]
      if (sents[index]) {
        const arr = Array.isArray(vocab.audio_stage2_sentences) ? [...(vocab.audio_stage2_sentences as string[])] : []
        while (arr.length <= index) arr.push("")
        arr[index] = finalUrl
        await supabase
          .from("vocabulary")
          .update({ audio_stage2_sentences: arr })
          .eq("id", word_id)
          .eq("user_id", user_id)
      }
    } else if (stage === 3) {
      const key = sub_type === "incorrect" ? "audio_stage3_incorrect" : "audio_stage3_correct"
      const arr = Array.isArray(vocab[key]) ? [...(vocab[key] as string[])] : []
      while (arr.length <= index) arr.push("")
      arr[index] = finalUrl
      await supabase
        .from("vocabulary")
        .update({ [key]: arr })
        .eq("id", word_id)
        .eq("user_id", user_id)
    }

    return new Response(JSON.stringify({ url: finalUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("generate-tts-for-content error:", msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
