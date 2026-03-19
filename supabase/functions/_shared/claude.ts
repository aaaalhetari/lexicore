// Shared Claude (Anthropic) client for all Edge Functions.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const MODEL = "claude-sonnet-4-20250514"

function getApiKey(): string {
  const key = Deno.env.get("ANTHROPIC_API_KEY")
  if (!key) throw new Error("ANTHROPIC_API_KEY not set")
  return key
}

export async function callClaude(
  prompt: string,
  system: string,
  maxTokens = 1024,
): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  })

  if (!res.ok) throw new Error(`Claude API error: ${await res.text()}`)
  const data = await res.json()
  return data.content?.[0]?.text ?? ""
}

export function extractJsonArray(text: string): unknown[] {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error("No JSON array found in Claude response")
  return JSON.parse(match[0])
}

export function extractJsonObject(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("No JSON object found in Claude response")
  return JSON.parse(match[0])
}
