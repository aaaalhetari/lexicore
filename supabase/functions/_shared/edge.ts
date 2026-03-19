import { functionsBaseUrl, serviceRoleToken } from "./supabase.ts"

export async function invokeEdgeFunction(name: string, body: unknown) {
  const res = await fetch(`${functionsBaseUrl()}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleToken()}`,
    },
    body: JSON.stringify(body ?? {}),
  })

  if (!res.ok) {
    throw new Error(`Function ${name} error: ${await res.text()}`)
  }

  return await res.json().catch(() => ({}))
}

