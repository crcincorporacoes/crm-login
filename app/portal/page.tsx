import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasProfile } from '@/lib/supabase/profile'
import { AppShell } from '@/components/app-shell'
import { ChatExperience } from '@/components/chat/chat-experience'
import { listConversations, getConversationMessages } from '@/lib/conversations/service'

export default async function PortalPage({
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

  if (!(await hasProfile(supabase, user.id))) {
    redirect('/dashboard')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  const firstName = (profile?.name as string | undefined)?.split(' ')[0] ?? 'cliente'
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
        role="client"
        firstName={firstName}
        conversations={conversations}
        initialConversationId={conversationId}
        initialMessages={initialMessages}
      />
    </AppShell>
  )
}
