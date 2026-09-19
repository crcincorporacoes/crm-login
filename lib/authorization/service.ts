import type { SupabaseClient } from '@supabase/supabase-js'
import { hasProfile } from '@/lib/supabase/profile'
import { ROLE_TOOL_ACCESS, type Role, type ToolName } from './roles'

export async function resolveRole(
  supabase: SupabaseClient,
  userId: string
): Promise<Role | null> {
  if (await hasProfile(supabase, userId)) {
    return 'client'
  }

  const { data } = await supabase
    .from('team_members')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  return (data?.role as Role | undefined) ?? null
}

export function canUseTool(role: Role, toolName: ToolName): boolean {
  return ROLE_TOOL_ACCESS[role].includes(toolName)
}

export function roleHasChatAccess(role: Role | null): role is Role {
  return role !== null && ROLE_TOOL_ACCESS[role].length > 0
}
