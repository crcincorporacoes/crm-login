import { z } from 'zod'
import type { ToolDefinition } from './registry'
import { getSiengeService } from '@/lib/sienge/config'
import { getSiengeCustomerId } from '@/lib/sienge/customer-id'
import type { MessageContent } from '@/lib/ai/message-content'

const NoInput = z.object({})

const NOT_FOUND: MessageContent = {
  type: 'notice',
  message: 'Não encontrei seu cadastro financeiro no sistema.',
}

export const financialTools: ToolDefinition[] = [
  {
    name: 'get_overdue_installments',
    description: 'Retorna as parcelas em atraso do cliente autenticado.',
    allowedRoles: ['client'],
    inputSchema: NoInput,
    handler: async (_input, ctx): Promise<MessageContent> => {
      const customerId = await getSiengeCustomerId(ctx.supabase, ctx.userId)
      if (!customerId) return NOT_FOUND

      const overdue = await getSiengeService().getOverdueInstallments(customerId)
      if (overdue.length === 0) {
        return { type: 'notice', message: 'Você não tem nenhuma parcela em atraso.' }
      }

      const installment = overdue[0]
      return {
        type: 'financial_installment',
        message: `Encontrei uma parcela em atraso, vencida em ${installment.dueDate}, no valor de R$ ${installment.amount.toFixed(2)}. Deseja gerar a segunda via?`,
        data: {
          description: installment.description,
          dueDate: installment.dueDate,
          amount: installment.amount,
          status: installment.status,
        },
        actions: [{ type: 'download', label: 'Gerar segunda via', payload: installment.id }],
      }
    },
  },
  {
    name: 'get_next_installment',
    description: 'Retorna a próxima parcela em aberto do cliente autenticado.',
    allowedRoles: ['client'],
    inputSchema: NoInput,
    handler: async (_input, ctx): Promise<MessageContent> => {
      const customerId = await getSiengeCustomerId(ctx.supabase, ctx.userId)
      if (!customerId) return NOT_FOUND

      const installments = await getSiengeService().getCustomerInstallments(customerId)
      const next = installments.find((installment) => installment.status === 'aberta')
      if (!next) {
        return { type: 'notice', message: 'Não encontrei nenhuma parcela em aberto.' }
      }

      return {
        type: 'financial_installment',
        message: `Sua próxima parcela vence em ${next.dueDate}, no valor de R$ ${next.amount.toFixed(2)}.`,
        data: {
          description: next.description,
          dueDate: next.dueDate,
          amount: next.amount,
          status: next.status,
        },
        actions: [{ type: 'download', label: 'Ver boleto', payload: next.id }],
      }
    },
  },
  {
    name: 'get_customer_installments',
    description: 'Lista as últimas parcelas (pagas e em aberto) do cliente autenticado.',
    allowedRoles: ['client'],
    inputSchema: NoInput,
    handler: async (_input, ctx): Promise<MessageContent> => {
      const customerId = await getSiengeCustomerId(ctx.supabase, ctx.userId)
      if (!customerId) return NOT_FOUND

      const installments = await getSiengeService().getCustomerInstallments(customerId)
      if (installments.length === 0) {
        return { type: 'notice', message: 'Não encontrei parcelas cadastradas.' }
      }

      const lines = installments
        .map((installment) => `${installment.dueDate} — R$ ${installment.amount.toFixed(2)} — ${installment.status}`)
        .join('\n')

      return { type: 'text', text: `Suas últimas parcelas:\n${lines}` }
    },
  },
  {
    name: 'get_payment_slip',
    description: 'Retorna o link do boleto (segunda via) de uma parcela pelo id.',
    allowedRoles: ['client'],
    inputSchema: z.object({ installmentId: z.string().describe('Id da parcela, obtido de uma consulta anterior') }),
    handler: async (input, ctx): Promise<MessageContent> => {
      const customerId = await getSiengeCustomerId(ctx.supabase, ctx.userId)
      if (!customerId) return NOT_FOUND

      const url = await getSiengeService().getPaymentSlip(input.installmentId)
      if (!url) {
        return { type: 'notice', message: 'Não encontrei esse boleto no sistema.' }
      }

      return { type: 'document', message: 'Aqui está a segunda via do seu boleto.', documentUrl: url, label: 'Boleto' }
    },
  },
]
