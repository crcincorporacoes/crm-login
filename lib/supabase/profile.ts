import type { SupabaseClient } from '@supabase/supabase-js'

export async function hasProfile(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  return data !== null
}
