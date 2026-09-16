import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv, getSupabaseServiceRoleKey } from './env'

export function createAdminClient() {
  const { url } = getSupabaseEnv()
  const serviceRoleKey = getSupabaseServiceRoleKey()

  return createClient(url, serviceRoleKey)
}
