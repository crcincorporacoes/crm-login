import type { ChatMessageItem } from './use-chat'
import { ChatMessage } from './chat-message'
import { LoadingMessage } from './loading-message'

function isEmptyAssistantText(message: ChatMessageItem): boolean {
  return message.role === 'assistant' && message.content.type === 'text' && message.content.text === ''
}

export function ChatMessages({
  messages,
  isStreaming,
}: {
  messages: ChatMessageItem[]
  isStreaming: boolean
}) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '24px 16px' }}>
      {messages.map((message, index) => {
        const isLastMessage = index === messages.length - 1
        if (isLastMessage && isStreaming && isEmptyAssistantText(message)) {
          return <LoadingMessage key={message.id} />
        }
        return <ChatMessage key={message.id} role={message.role} content={message.content} />
      })}
    </div>
  )
}
