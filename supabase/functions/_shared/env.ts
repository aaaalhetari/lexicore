export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is required`)
  return value
}

