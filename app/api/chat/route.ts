import { createClient } from '@/lib/supabase/server'
import { resolveRole, roleHasChatAccess } from '@/lib/authorization/service'
import { getToolsForRole } from '@/lib/ai/tools'
import { buildSystemPrompt } from '@/lib/ai/system-prompt'
import { AnthropicProvider } from '@/lib/ai/anthropic-provider'
import {
  appendMessage,
  createConversation,
  getConversationMessages,
} from '@/lib/conversations/service'
import { logAudit, logToolExecutions } from '@/lib/audit/log'
import { messageContentToPlainText } from '@/lib/ai/message-content'

const provider = new AnthropicProvider()

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Não autenticado.', { status: 401 })
  }

  const role = await resolveRole(supabase, user.id)
  if (!roleHasChatAccess(role)) {
    return new Response('Seu acesso ao assistente ainda não foi liberado.', { status: 403 })
  }

  const body = (await request.json()) as { message?: string; conversationId?: string }
  const userMessage = body.message?.trim()

  if (!userMessage) {
    return new Response('Mensagem vazia.', { status: 400 })
  }

  const conversationId = body.conversationId ?? (await createConversation(supabase, user.id, role))

  const history = (await getConversationMessages(supabase, conversationId)).map((message) => ({
    role: message.role,
    text: messageContentToPlainText(message.content),
  }))

  await appendMessage(supabase, conversationId, 'user', { type: 'text', text: userMessage })

  const firstName = user.email?.split('@')[0] ?? 'usuário'
  const tools = getToolsForRole(role)

  const { stream, done } = provider.streamChat({
    systemPrompt: buildSystemPrompt(role, firstName),
    history,
    userMessage,
    tools,
    toolContext: { userId: user.id, role, supabase },
  })

  done
    .then(async ({ finalText, toolCalls }) => {
      const messageId = await appendMessage(supabase, conversationId, 'assistant', {
        type: 'text',
        text: finalText,
      })
      await logToolExecutions(messageId, toolCalls)
      await logAudit(user.id, 'chat_message', { conversationId, toolCalls: toolCalls.map((c) => c.name) })
    })
    .catch((error) => {
      console.error('Falha ao persistir mensagem/auditoria do chat', error)
    })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Conversation-Id': conversationId,
    },
  })
}
