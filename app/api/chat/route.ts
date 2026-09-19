import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { resolveRole, roleHasChatAccess } from '@/lib/authorization/service'
import type { Role } from '@/lib/authorization/roles'
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
import { isRateLimited } from '@/lib/rate-limit'

const provider = new AnthropicProvider()

const GENERIC_ERROR_TEXT = 'Não foi possível processar sua mensagem. Tente novamente em alguns instantes.'
const CONVERSATION_TITLE_MAX_LENGTH = 40

function buildConversationTitle(userMessage: string): string {
  const trimmed = userMessage.trim()
  return trimmed.length > CONVERSATION_TITLE_MAX_LENGTH
    ? `${trimmed.slice(0, CONVERSATION_TITLE_MAX_LENGTH)}…`
    : trimmed
}

// O `conversationId` enviado pelo corpo da requisição é do cliente e nunca
// deve ser confiado sem checagem: confirma que a conversa existe e
// pertence ao usuário autenticado antes de reutilizá-la. Se não existir,
// não pertencer a ele, ou nenhum id tiver sido enviado, cria uma conversa
// nova silenciosamente (em vez de retornar erro) e já a nomeia com o
// início da primeira mensagem.
async function resolveConversationId(
  supabase: SupabaseClient,
  userId: string,
  role: Role,
  requestedConversationId: string | undefined,
  userMessage: string
): Promise<string> {
  if (requestedConversationId) {
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', requestedConversationId)
      .eq('user_id', userId)
      .maybeSingle()

    if (data) return requestedConversationId
  }

  return createConversation(supabase, userId, role, buildConversationTitle(userMessage))
}

// Clientes (role 'client') têm nome cadastrado em `profiles.name` — é isso
// que a tela de boas-vindas já usa para saudação. Equipe não tem uma coluna
// de nome própria ainda, então continua caindo no local-part do email.
async function resolveFirstName(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
  role: Role
): Promise<string> {
  const emailFallback = userEmail?.split('@')[0] ?? 'usuário'

  if (role !== 'client') {
    return emailFallback
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', userId)
    .maybeSingle()

  const firstNameFromProfile = (profile?.name as string | undefined)?.trim().split(' ')[0]
  return firstNameFromProfile || emailFallback
}

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

  if (isRateLimited(user.id)) {
    return new Response('Você está enviando mensagens muito rápido. Aguarde um instante.', {
      status: 429,
    })
  }

  try {
    const body = (await request.json()) as { message?: string; conversationId?: string }
    const userMessage = body.message?.trim()

    if (!userMessage) {
      return new Response('Mensagem vazia.', { status: 400 })
    }

    const conversationId = await resolveConversationId(
      supabase,
      user.id,
      role,
      body.conversationId,
      userMessage
    )

    const history = (await getConversationMessages(supabase, conversationId)).map((message) => ({
      role: message.role,
      text: messageContentToPlainText(message.content),
    }))

    await appendMessage(supabase, conversationId, 'user', { type: 'text', text: userMessage })

    const firstName = await resolveFirstName(supabase, user.id, user.email, role)
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
  } catch (error) {
    console.error('Falha ao processar requisição de chat', error)
    return new Response(GENERIC_ERROR_TEXT, { status: 500 })
  }
}
