import type { SupabaseClient } from '@supabase/supabase-js'

export async function getSiengeCustomerId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('sienge_customer_id')
    .eq('id', userId)
    .maybeSingle()

  return (data?.sienge_customer_id as string | null | undefined) ?? null
}
