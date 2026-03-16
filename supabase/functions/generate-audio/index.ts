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

async function uploadToStorage(
  supabase: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>,
  userId: string,
  wordId: number,
  audioBuffer: ArrayBuffer
): Promise<string> {
  const path = `${userId}/${wordId}.mp3`
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

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const body = (await req.json()) as AudioRequest
    const { user_id, word_id, word } = body

    if (!user_id || !word_id || !word) {
      return new Response(
        JSON.stringify({ error: "user_id, word_id, word required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const audioBuffer = await generateTTS(word)
    const audioUrl = await uploadToStorage(supabase, user_id, word_id, audioBuffer)

    await supabase
      .from("vocabulary")
      .update({ audio_url: audioUrl })
      .eq("id", word_id)
      .eq("user_id", user_id)

    return new Response(
      JSON.stringify({ audio_url: audioUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error(err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
