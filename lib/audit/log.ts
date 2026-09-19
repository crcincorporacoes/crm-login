import { createAdminClient } from '@/lib/supabase/admin'

export interface ToolCallRecord {
  name: string
  input: unknown
  output: unknown
  success: boolean
  error?: string
}

export async function logAudit(userId: string, action: string, metadata: Record<string, unknown> = {}) {
  const admin = createAdminClient()
  await admin.from('audit_logs').insert({ user_id: userId, action, metadata })
}

export async function logToolExecutions(messageId: string, toolCalls: ToolCallRecord[]) {
  if (toolCalls.length === 0) return

  const admin = createAdminClient()
  await admin.from('tool_executions').insert(
    toolCalls.map((call) => ({
      message_id: messageId,
      tool_name: call.name,
      input: call.input,
      output: call.output,
      success: call.success,
      error: call.error ?? null,
    }))
  )
}
