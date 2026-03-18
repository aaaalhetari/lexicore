// LexiCore: Migrate audio to flat structure all-lexicore-audio/{word}/
// Moves from: {userId}/{wordId}-{word}/, {userId}/{word}/, and deletes tts/

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

/** Extract word from folder name: "12345-advice" -> "advice", "advice" -> "advice" */
function extractWordFromFolder(folderName: string): string | null {
  if (!folderName) return null
  const parts = folderName.split("-")
  if (parts.length === 1) return sanitizeWord(parts[0])
  const first = parts[0]
  if (/^\d+$/.test(first)) return parts.slice(1).join("-") ? sanitizeWord(parts.slice(1).join("-")) : null
  return sanitizeWord(folderName)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const bucket = "lexicore-audio"
    const prefix = "all-lexicore-audio"

    let totalMoved = 0
    let totalDeleted = 0
    const updatedWords = new Set<string>()

    // 1. Delete tts folder files (hash-based, can't map to words)
    const { data: ttsFiles } = await supabase.storage.from(bucket).list(`${prefix}/tts`, { limit: 1000 })
    if (ttsFiles?.length) {
      const toDelete = ttsFiles.filter((f) => f.name && !f.name.endsWith("/")).map((f) => `${prefix}/tts/${f.name}`)
      if (toDelete.length) {
        const { error: delErr } = await supabase.storage.from(bucket).remove(toDelete)
        if (!delErr) totalDeleted = toDelete.length
      }
    }

    // 2. List top-level under all-lexicore-audio
    const { data: topLevel, error: topErr } = await supabase.storage.from(bucket).list(prefix, { limit: 500 })
    if (topErr || !topLevel?.length) {
      return new Response(
        JSON.stringify({ migrated: totalMoved, tts_deleted: totalDeleted, vocabulary_updated: updatedWords.size }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 3. For each item that looks like userId (UUID), list subfolders
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const item of topLevel) {
      if (!item.name || item.name === "tts") continue
      if (!uuidRegex.test(item.name)) continue

      const userId = item.name
      const { data: subFolders } = await supabase.storage.from(bucket).list(`${prefix}/${userId}`, { limit: 500 })
      if (!subFolders?.length) continue

      // Delete userId/tts/ files (hash-based, can't map to words)
      const ttsSub = subFolders.find((f) => f.name === "tts")
      if (ttsSub) {
        const { data: userTtsFiles } = await supabase.storage.from(bucket).list(`${prefix}/${userId}/tts`, { limit: 1000 })
        const toDel = (userTtsFiles ?? []).filter((f) => f.name && !f.name.endsWith("/")).map((f) => `${prefix}/${userId}/tts/${f.name}`)
        if (toDel.length) await supabase.storage.from(bucket).remove(toDel)
        totalDeleted += toDel.length
      }

      for (const sub of subFolders) {
        if (sub.name === "tts") continue
        if (!sub.name) continue
        const word = extractWordFromFolder(sub.name)
        if (!word) continue

        const oldFolderPath = `${prefix}/${userId}/${sub.name}`
        const newFolderPath = `${prefix}/${word}`

        const { data: fileList } = await supabase.storage.from(bucket).list(oldFolderPath, { limit: 100 })
        if (!fileList?.length) continue

        const toMove = fileList.filter((f) => f.name && !f.name.endsWith("/"))
        for (const file of toMove) {
          const oldPath = `${oldFolderPath}/${file.name}`
          const newPath = `${newFolderPath}/${file.name}`

          const { error: moveErr } = await supabase.storage.from(bucket).move(oldPath, newPath)
          if (!moveErr) {
            totalMoved++
            updatedWords.add(word)
          }
        }
      }
    }

    // 4. Update vocabulary: all rows where sanitizeWord(word) matches
    const { data: allVocab } = await supabase
      .from("vocabulary")
      .select("id, user_id, word, stage1_definitions, stage2_sentences, stage3_correct, stage3_incorrect")

    for (const row of allVocab ?? []) {
      const safe = sanitizeWord(row.word ?? "")
      if (!updatedWords.has(safe)) continue

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(`${prefix}/${safe}/word.mp3`)
      const baseUrl = urlData.publicUrl.replace(/\/word\.mp3$/, "")

      const defs = (row.stage1_definitions ?? []) as unknown[]
      const sents = (row.stage2_sentences ?? []) as unknown[]
      const correct = (row.stage3_correct ?? []) as string[]
      const incorrect = (row.stage3_incorrect ?? []) as string[]

      const audioStage1 = defs.map((_, i) => `${baseUrl}/stage1_${i}.mp3`)
      const audioStage2 = sents.map((_, i) => `${baseUrl}/stage2_${i}.mp3`)
      const audioStage3Correct = correct.map((_, i) => `${baseUrl}/stage3_correct_${i}.mp3`)
      const audioStage3Incorrect = incorrect.map((_, i) => `${baseUrl}/stage3_incorrect_${i}.mp3`)

      await supabase
        .from("vocabulary")
        .update({
          audio_word: `${baseUrl}/word.mp3`,
          audio_stage1_definitions: audioStage1,
          audio_stage2_sentences: audioStage2,
          audio_stage3_correct: audioStage3Correct,
          audio_stage3_incorrect: audioStage3Incorrect,
        })
        .eq("id", row.id)
        .eq("user_id", row.user_id)
    }

    const vocabUpdated = (allVocab ?? []).filter((r) => updatedWords.has(sanitizeWord(r.word ?? ""))).length

    return new Response(
      JSON.stringify({
        migrated: totalMoved,
        tts_deleted: totalDeleted,
        vocabulary_updated: vocabUpdated,
      }),
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
