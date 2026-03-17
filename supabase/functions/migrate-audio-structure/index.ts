// LexiCore: One-time migration - move old audio to all-lexicore-audio/{userId}/{wordId}-{word}/word.mp3
// Run manually: supabase functions invoke migrate-audio-structure

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

function sanitizeWord(word: string): string {
  return (word ?? "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "word"
}

/** Extract storage path from public URL. Returns null if invalid. */
function pathFromUrl(url: string): string | null {
  try {
    const match = url.match(/lexicore-audio\/(.+)$/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/** Check if URL uses old format (not under all-lexicore-audio) */
function isOldFormat(path: string): boolean {
  return !path.startsWith("all-lexicore-audio/")
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { data: rows, error } = await supabase
      .from("vocabulary")
      .select("id, user_id, word, audio_word")
      .not("audio_word", "is", null)

    if (error) throw error
    if (!rows?.length) {
      return new Response(
        JSON.stringify({ migrated: 0, message: "No vocabulary with audio_word" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    let migrated = 0
    let failed = 0

    for (const row of rows) {
      const url = row.audio_word as string
      if (!url) continue

      const oldPath = pathFromUrl(url)
      if (!oldPath || !isOldFormat(oldPath)) continue

      try {
        const { data: blob, error: downloadErr } = await supabase.storage
          .from("lexicore-audio")
          .download(oldPath)

        if (downloadErr || !blob) {
          console.warn("Skip (download failed):", row.id, oldPath, downloadErr)
          failed++
          continue
        }

        const buffer = await blob.arrayBuffer()
        const safe = sanitizeWord(row.word)
        const newPath = `all-lexicore-audio/${row.user_id}/${row.id}-${safe}/word.mp3`

        const { error: uploadErr } = await supabase.storage
          .from("lexicore-audio")
          .upload(newPath, buffer, { contentType: "audio/mpeg", upsert: true })

        if (uploadErr) {
          console.warn("Skip (upload failed):", row.id, uploadErr)
          failed++
          continue
        }

        const { data: urlData } = supabase.storage.from("lexicore-audio").getPublicUrl(newPath)

        const { error: updateErr } = await supabase
          .from("vocabulary")
          .update({ audio_word: urlData.publicUrl })
          .eq("id", row.id)
          .eq("user_id", row.user_id)

        if (updateErr) {
          console.warn("Skip (update failed):", row.id, updateErr)
          failed++
          continue
        }

        await supabase.storage.from("lexicore-audio").remove([oldPath])
        migrated++
      } catch (e) {
        console.warn("Skip (error):", row.id, e)
        failed++
      }
    }

    return new Response(
      JSON.stringify({ migrated, failed, total: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("migrate-audio-structure error:", msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
