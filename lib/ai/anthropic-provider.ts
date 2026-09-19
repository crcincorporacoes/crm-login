import Anthropic from '@anthropic-ai/sdk'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { AIProvider, StreamChatParams, StreamChatResult } from './provider'
import type { ToolContext, ToolDefinition } from './tools/registry'
import type { ToolCallRecord } from '@/lib/audit/log'

const GENERIC_ERROR_TEXT = 'Não consegui responder agora. Tente novamente em alguns instantes.'

function toRunnerTool(
  tool: ToolDefinition,
  ctx: ToolContext,
  record: (call: ToolCallRecord) => void
) {
  return {
    ...betaZodTool({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      run: async (input: unknown) => {
        try {
          const output = await tool.handler(input, ctx)
          record({ name: tool.name, input, output, success: true })
          return JSON.stringify(output)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'erro desconhecido'
          record({ name: tool.name, input, output: null, success: false, error: message })
          return JSON.stringify({ type: 'notice', message: GENERIC_ERROR_TEXT })
        }
      },
    }),
    eager_input_streaming: true,
  }
}

export class AnthropicProvider implements AIProvider {
  private client = new Anthropic()

  streamChat({ systemPrompt, history, userMessage, tools, toolContext }: StreamChatParams): StreamChatResult {
    const toolCalls: ToolCallRecord[] = []
    const runnerTools = tools.map((tool) => toRunnerTool(tool, toolContext, (call) => toolCalls.push(call)))

    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...history.map((turn) => ({ role: turn.role, content: turn.text })),
      { role: 'user' as const, content: userMessage },
    ]

    let finalText = ''
    let resolveDone!: (value: { finalText: string; toolCalls: ToolCallRecord[] }) => void
    const done = new Promise<{ finalText: string; toolCalls: ToolCallRecord[] }>((resolve) => {
      resolveDone = resolve
    })

    const client = this.client

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder()

        try {
          const runner = client.beta.messages.toolRunner({
            model: 'claude-opus-5',
            max_tokens: 4096,
            system: systemPrompt,
            tools: runnerTools,
            messages,
            stream: true,
          })

          for await (const messageStream of runner) {
            for await (const event of messageStream) {
              if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                finalText += event.delta.text
                controller.enqueue(encoder.encode(event.delta.text))
              }
            }
            await messageStream.finalMessage()
          }
        } catch {
          if (finalText.length === 0) {
            finalText = GENERIC_ERROR_TEXT
            controller.enqueue(encoder.encode(GENERIC_ERROR_TEXT))
          }
        } finally {
          controller.close()
          resolveDone({ finalText, toolCalls })
        }
      },
    })

    return { stream, done }
  }
}
