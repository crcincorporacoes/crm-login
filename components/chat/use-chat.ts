'use client'

import { useCallback, useRef, useState } from 'react'
import type { MessageContent } from '@/lib/ai/message-content'

export interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: MessageContent
}

export function useChat(initial?: { conversationId?: string; messages?: ChatMessageItem[] }) {
  const [messages, setMessages] = useState<ChatMessageItem[]>(initial?.messages ?? [])
  const [isStreaming, setIsStreaming] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>(initial?.conversationId)
  const conversationIdRef = useRef<string | undefined>(initial?.conversationId)

  const sendMessage = useCallback(async (text: string) => {
    const userId = crypto.randomUUID()
    setMessages((prev) => [...prev, { id: userId, role: 'user', content: { type: 'text', text } }])

    const assistantId = crypto.randomUUID()
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: { type: 'text', text: '' } }])
    setIsStreaming(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId: conversationIdRef.current }),
      })

      const responseConversationId = response.headers.get('X-Conversation-Id')
      if (responseConversationId) {
        conversationIdRef.current = responseConversationId
        setConversationId(responseConversationId)
      }

      if (!response.ok || !response.body) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? { ...message, content: { type: 'notice', message: 'Não consegui responder agora. Tente novamente em alguns instantes.' } as MessageContent }
              : message
          )
        )
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, content: { type: 'text', text: accumulated } } : message
          )
        )
      }
    } catch {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: { type: 'notice', message: 'Não consegui responder agora. Tente novamente em alguns instantes.' } as MessageContent }
            : message
        )
      )
    } finally {
      setIsStreaming(false)
    }
  }, [])

  return { messages, isStreaming, sendMessage, conversationId }
}
