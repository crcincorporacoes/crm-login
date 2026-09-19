import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_MOCK_CUSTOMER_ID } from './mock-service'

export async function getSiengeCustomerId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('sienge_customer_id')
    .eq('id', userId)
    .maybeSingle()

  const customerId = (data?.sienge_customer_id as string | null | undefined) ?? null
  if (customerId) return customerId

  // FALLBACK TEMPORÁRIO: `profiles.sienge_customer_id` nunca é preenchido
  // hoje — ainda não existe integração real com o Sienge nem um caminho de
  // backfill para essa coluna. Sem este fallback, em modo mock (sem
  // SIENGE_API_URL/SIENGE_API_TOKEN) nenhuma tool financeira/de projeto
  // jamais retornaria dado nenhum: todas checam `if (!customerId) return
  // NOT_FOUND` antes de chamar o serviço, e o MockSiengeService ignora o
  // id recebido e sempre devolve o mesmo cliente fictício (ver
  // MOCK_CUSTOMER em mock-service.ts). Em modo real, não há fallback — um
  // valor ausente continua null. Remover este fallback assim que existir
  // um caminho real de backfill para `sienge_customer_id`.
  const isMockMode = !process.env.SIENGE_API_URL || !process.env.SIENGE_API_TOKEN
  return isMockMode ? DEFAULT_MOCK_CUSTOMER_ID : null
}
