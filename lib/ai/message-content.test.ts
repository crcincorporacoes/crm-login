import { describe, expect, it } from 'vitest'
import { messageContentToPlainText, type MessageContent } from './message-content'

describe('messageContentToPlainText', () => {
  it('retorna o texto puro pra conteúdo do tipo text', () => {
    const content: MessageContent = { type: 'text', text: 'olá' }
    expect(messageContentToPlainText(content)).toBe('olá')
  })

  it('retorna a mensagem pra conteúdo do tipo notice', () => {
    const content: MessageContent = { type: 'notice', message: 'aviso' }
    expect(messageContentToPlainText(content)).toBe('aviso')
  })

  it('retorna a mensagem pra conteúdo do tipo document', () => {
    const content: MessageContent = {
      type: 'document',
      message: 'aqui está',
      documentUrl: 'https://example.com/x.pdf',
      label: 'Contrato',
    }
    expect(messageContentToPlainText(content)).toBe('aqui está')
  })
})
