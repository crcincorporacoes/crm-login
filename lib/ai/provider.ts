import type { ToolContext, ToolDefinition } from './tools/registry'
import type { ToolCallRecord } from '@/lib/audit/log'

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface StreamChatParams {
  systemPrompt: string
  history: ChatTurn[]
  userMessage: string
  tools: ToolDefinition[]
  toolContext: ToolContext
}

export interface StreamChatResult {
  stream: ReadableStream<Uint8Array>
  done: Promise<{ finalText: string; toolCalls: ToolCallRecord[] }>
}

export interface AIProvider {
  streamChat(params: StreamChatParams): StreamChatResult
}
