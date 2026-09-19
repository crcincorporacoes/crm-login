import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveRole, canUseTool, roleHasChatAccess } from './service'

function fakeSupabase(tableResponses: Record<string, unknown>): SupabaseClient {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: tableResponses[table] ?? null }),
              }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient
}

describe('resolveRole', () => {
  it('retorna "client" quando existe linha em profiles', async () => {
    const supabase = fakeSupabase({ profiles: { id: 'user-1' } })
    expect(await resolveRole(supabase, 'user-1')).toBe('client')
  })

  it('retorna o papel de team_members quando não há profile', async () => {
    const supabase = fakeSupabase({ profiles: null, team_members: { role: 'corretor' } })
    expect(await resolveRole(supabase, 'user-2')).toBe('corretor')
  })

  it('retorna null quando não há profile nem team_members', async () => {
    const supabase = fakeSupabase({ profiles: null, team_members: null })
    expect(await resolveRole(supabase, 'user-3')).toBeNull()
  })
})

describe('canUseTool', () => {
  it('permite tool listada para o papel', () => {
    expect(canUseTool('client', 'get_overdue_installments')).toBe(true)
  })

  it('bloqueia tool não listada para o papel', () => {
    expect(canUseTool('client', 'get_available_units')).toBe(false)
  })
})

describe('roleHasChatAccess', () => {
  it('true para papéis com ferramentas', () => {
    expect(roleHasChatAccess('client')).toBe(true)
    expect(roleHasChatAccess('corretor')).toBe(true)
  })

  it('false para papel sem ferramentas ou null', () => {
    expect(roleHasChatAccess('administrador')).toBe(false)
    expect(roleHasChatAccess(null)).toBe(false)
  })
})
