import type { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Role, ToolName } from '@/lib/authorization/roles'

export interface ToolContext {
  userId: string
  role: Role
  supabase: SupabaseClient
}

// `any` é intencional aqui: o registro guarda ferramentas com schemas de
// entrada heterogêneos. Cada ferramenta individual é escrita com um tipo
// de entrada concreto (ver financial.ts/project.ts/broker.ts); só o
// agregado (`ToolDefinition<any>[]`) precisa ser genérico.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolDefinition<TInput = any> {
  name: ToolName
  description: string
  allowedRoles: Role[]
  inputSchema: z.ZodType<TInput>
  handler: (input: TInput, ctx: ToolContext) => Promise<unknown>
}
