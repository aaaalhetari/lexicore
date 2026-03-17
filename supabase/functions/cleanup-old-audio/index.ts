// LexiCore: Delete all files in lexicore-audio EXCEPT all-lexicore-audio/
// Keeps only the new organized structure

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

const BUCKET = "lexicore-audio"

async function listAllPaths(
  supabase: ReturnType<typeof createClient>,
  prefix: string,
  paths: string[]
): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 })
  if (error) throw error
  if (!data?.length) return

  for (const item of data) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name
    if (item.id === null) {
      await listAllPaths(supabase, fullPath, paths)
    } else {
      paths.push(fullPath)
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { data: rootItems, error: listErr } = await supabase.storage.from(BUCKET).list("", { limit: 1000 })
    if (listErr) throw listErr

    const toDelete: string[] = []
    for (const item of rootItems ?? []) {
      if (item.name === "all-lexicore-audio") continue
      await listAllPaths(supabase, item.name, toDelete)
    }

    if (toDelete.length === 0) {
      return new Response(
        JSON.stringify({ deleted: 0, message: "No old files to delete" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const BATCH = 1000
    let deleted = 0
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const batch = toDelete.slice(i, i + BATCH)
      const { error: removeErr } = await supabase.storage.from(BUCKET).remove(batch)
      if (removeErr) {
        console.warn("Remove batch failed:", removeErr)
      } else {
        deleted += batch.length
      }
    }

    return new Response(
      JSON.stringify({ deleted, total: toDelete.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("cleanup-old-audio error:", msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
