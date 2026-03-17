// LexiCore: Neural TTS - Generate audio for target word only
// Uses OpenAI TTS or ElevenLabs (configurable)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!

interface AudioRequest {
  user_id: string
  word_id: number
  word: string
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

function sanitizeWord(word: string): string {
  return (word ?? "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "word"
}

async function uploadToStorage(
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
  userId: string,
  wordId: number,
  word: string,
  audioBuffer: ArrayBuffer
): Promise<string> {
  const safe = sanitizeWord(word)
  const path = `all-lexicore-audio/${userId}/${wordId}-${safe}/word.mp3`
  const { error } = await supabase.storage.from("lexicore-audio").upload(path, audioBuffer, {
    contentType: "audio/mpeg",
    upsert: true,
  })
  if (error) throw error
  const { data } = supabase.storage.from("lexicore-audio").getPublicUrl(path)
  return data.publicUrl
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    let body: AudioRequest
    try {
      body = (await req.json()) as AudioRequest
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }
    const { user_id, word_id, word } = body

    if (!user_id || !word_id || !word) {
      return new Response(
        JSON.stringify({ error: "user_id, word_id, word required", received: { user_id: !!user_id, word_id: !!word_id, word: !!word } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const audioBuffer = await generateTTS(word)
    const audioUrl = await uploadToStorage(supabase, user_id, word_id, word, audioBuffer)

    await supabase
      .from("vocabulary")
      .update({ audio_word: audioUrl })
      .eq("id", word_id)
      .eq("user_id", user_id)

    return new Response(
      JSON.stringify({ audio_word: audioUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("generate-audio error:", msg)
    return new Response(
      JSON.stringify({ error: msg, hint: "Check OPENAI_API_KEY in Supabase Dashboard > Edge Functions > Secrets" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
