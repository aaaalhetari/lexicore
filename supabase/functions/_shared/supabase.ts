import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { requiredEnv } from "./env.ts"

export function createServiceClient() {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  )
}

export function functionsBaseUrl() {
  return `${requiredEnv("SUPABASE_URL")}/functions/v1`
}

export function serviceRoleToken() {
  return requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
}

