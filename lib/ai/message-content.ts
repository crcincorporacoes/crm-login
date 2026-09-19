export interface MessageAction {
  type: 'download' | 'suggestion'
  label: string
  payload?: string
}

export type MessageContent =
  | { type: 'text'; text: string }
  | {
      type: 'financial_installment'
      message: string
      data: { description: string; dueDate: string; amount: number; status: string }
      actions?: MessageAction[]
    }
  | {
      type: 'unit_list'
      message: string
      units: Array<{ code: string; tower: string; floor: number; areaM2: number; price: number }>
      actions?: MessageAction[]
    }
  | { type: 'document'; message: string; documentUrl: string; label: string }
  | { type: 'notice'; message: string }

export function messageContentToPlainText(content: MessageContent): string {
  return content.type === 'text' ? content.text : content.message
}
