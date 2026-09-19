'use client'

import type { ConversationSummary } from '@/lib/conversations/service'
import styles from './conversation-sidebar.module.css'

export function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelect,
}: {
  conversations: ConversationSummary[]
  activeConversationId?: string
  onSelect: (conversationId: string) => void
}) {
  return (
    <aside className={styles.sidebar}>
      {conversations.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--brand-ink-soft)' }}>Nenhuma conversa ainda.</p>
      ) : (
        conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            className={styles.item}
            data-active={conversation.id === activeConversationId}
            onClick={() => onSelect(conversation.id)}
          >
            {conversation.title ?? 'Conversa sem título'}
          </button>
        ))
      )}
    </aside>
  )
}
