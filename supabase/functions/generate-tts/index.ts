// LexiCore: AI TTS for any text (definitions, sentences)
// Uses OpenAI TTS, caches by text hash in storage

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")

interface TTSRequest {
  text: string
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40)
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY not set in Supabase Edge Function secrets" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  try {
    let body: TTSRequest
    try {
      body = (await req.json()) as TTSRequest
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }
    const text = (body.text ?? "").trim()
    if (!text) {
      return new Response(
        JSON.stringify({ error: "text required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const hash = await sha256(text)
    const path = `all-lexicore-audio/tts/${hash}.mp3`
    const { data } = supabase.storage.from("lexicore-audio").getPublicUrl(path)

    const headRes = await fetch(data.publicUrl, { method: "HEAD" })
    if (headRes.ok) {
      return new Response(JSON.stringify({ url: data.publicUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const audioBuffer = await generateTTS(text)
    const { error } = await supabase.storage.from("lexicore-audio").upload(path, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: true,
    })
    if (error) throw error

    return new Response(JSON.stringify({ url: data.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("generate-tts error:", msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
