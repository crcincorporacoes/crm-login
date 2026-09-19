import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasProfile } from '@/lib/supabase/profile'
import { resolveRole, roleHasChatAccess } from '@/lib/authorization/service'
import { AppShell } from '@/components/app-shell'
import { ChatExperience } from '@/components/chat/chat-experience'
import { listConversations, getConversationMessages } from '@/lib/conversations/service'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>
}) {
  const { conversation: conversationId } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  if (await hasProfile(supabase, user.id)) {
    redirect('/portal')
  }

  const role = await resolveRole(supabase, user.id)

  if (!roleHasChatAccess(role)) {
    return (
      <AppShell heading="Acesso ainda não liberado">
        <p>Sua conta ainda não tem um papel atribuído no sistema. Contate o administrador.</p>
      </AppShell>
    )
  }

  const firstName = user.email?.split('@')[0] ?? 'usuário'
  const conversations = await listConversations(supabase, user.id)
  const initialMessages = conversationId
    ? (await getConversationMessages(supabase, conversationId)).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
      }))
    : []

  return (
    <AppShell heading="">
      <ChatExperience
        role={role === 'corretor' ? 'corretor' : 'client'}
        firstName={firstName}
        conversations={conversations}
        initialConversationId={conversationId}
        initialMessages={initialMessages}
      />
    </AppShell>
  )
}
