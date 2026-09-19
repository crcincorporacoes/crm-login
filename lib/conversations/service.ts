import type { SupabaseClient } from '@supabase/supabase-js'
import type { Role } from '@/lib/authorization/roles'
import type { MessageContent } from '@/lib/ai/message-content'

export interface ConversationSummary {
  id: string
  title: string | null
  updatedAt: string
}

export interface StoredMessage {
  id: string
  role: 'user' | 'assistant'
  content: MessageContent
  createdAt: string
}

export async function createConversation(
  supabase: SupabaseClient,
  userId: string,
  role: Role
): Promise<string> {
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, role_at_time: role })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Não foi possível criar a conversa: ${error?.message}`)
  }

  return data.id as string
}

export async function appendMessage(
  supabase: SupabaseClient,
  conversationId: string,
  role: 'user' | 'assistant',
  content: MessageContent
): Promise<string> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, role, content })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Não foi possível salvar a mensagem: ${error?.message}`)
  }

  const { error: updateError } = await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)

  if (updateError) {
    console.error('Não foi possível atualizar updated_at da conversa:', updateError.message)
  }

  return data.id as string
}

export async function listConversations(
  supabase: SupabaseClient,
  userId: string
): Promise<ConversationSummary[]> {
  const { data } = await supabase
    .from('conversations')
    .select('id, title, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50)

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string | null,
    updatedAt: row.updated_at as string,
  }))
}

export async function getConversationMessages(
  supabase: SupabaseClient,
  conversationId: string
): Promise<StoredMessage[]> {
  const { data } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  return (data ?? []).map((row) => ({
    id: row.id as string,
    role: row.role as 'user' | 'assistant',
    content: row.content as MessageContent,
    createdAt: row.created_at as string,
  }))
}
