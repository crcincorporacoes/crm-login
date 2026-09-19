import type { ChatMessageItem } from './use-chat'
import { ChatMessage } from './chat-message'

export function ChatMessages({ messages }: { messages: ChatMessageItem[] }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
      {messages.map((message) => (
        <ChatMessage key={message.id} role={message.role} content={message.content} />
      ))}
    </div>
  )
}
