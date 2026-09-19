'use client'

import { useRouter } from 'next/navigation'
import { useChat, type ChatMessageItem } from './use-chat'
import { ChatWelcome } from './chat-welcome'
import { ChatMessages } from './chat-messages'
import { ChatInput } from './chat-input'
import { ConversationSidebar } from './conversation-sidebar'
import type { ConversationSummary } from '@/lib/conversations/service'
import styles from './chat-experience.module.css'

export function ChatExperience({
  role,
  firstName,
  conversations,
  initialConversationId,
  initialMessages,
}: {
  role: 'client' | 'corretor'
  firstName: string
  conversations: ConversationSummary[]
  initialConversationId?: string
  initialMessages: ChatMessageItem[]
}) {
  const router = useRouter()
  const { messages, isStreaming, sendMessage } = useChat({
    conversationId: initialConversationId,
    messages: initialMessages,
  })

  const handleSelectConversation = (conversationId: string) => {
    router.push(`?conversation=${conversationId}`)
  }

  return (
    <div className={styles.page}>
      <ConversationSidebar
        conversations={conversations}
        activeConversationId={initialConversationId}
        onSelect={handleSelectConversation}
      />
      <div className={styles.main}>
        {messages.length > 0 ? (
          <>
            <ChatMessages messages={messages} />
            <div className={styles.inputWrap}>
              <ChatInput onSend={sendMessage} disabled={isStreaming} />
            </div>
          </>
        ) : (
          <div className={styles.welcomeWrap}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <ChatWelcome firstName={firstName} role={role} onSelectSuggestion={sendMessage} />
              <div className={styles.welcomeInputWrap}>
                <ChatInput onSend={sendMessage} disabled={isStreaming} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
