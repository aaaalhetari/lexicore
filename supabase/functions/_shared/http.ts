import { corsHeaders } from "./cors.ts"

export function optionsOk() {
  return new Response("ok", { headers: corsHeaders })
}

export function jsonOk(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

export function jsonErr(error: unknown, status = 500) {
  const message = typeof error === "string"
    ? error
    : (error instanceof Error ? error.message : String(error))
  return jsonOk({ error: message }, status)
}

