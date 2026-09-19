import { z } from 'zod'
import type { ToolDefinition } from './registry'
import { getSiengeService } from '@/lib/sienge/config'
import { getSiengeCustomerId } from '@/lib/sienge/customer-id'
import { DEFAULT_MOCK_PROJECT_ID } from '@/lib/sienge/mock-service'
import type { MessageContent } from '@/lib/ai/message-content'

const NoInput = z.object({})

async function resolveCustomerProjectId(): Promise<string> {
  // Nesta etapa (mock), todo cliente pertence ao mesmo empreendimento
  // fictício. Quando a integração real existir, isso vem do contrato do
  // cliente (getCustomerContracts), não de um valor fixo.
  return DEFAULT_MOCK_PROJECT_ID
}

export const projectTools: ToolDefinition[] = [
  {
    name: 'get_project_information',
    description: 'Retorna informações gerais do empreendimento do cliente (endereço, nome).',
    allowedRoles: ['client', 'corretor'],
    inputSchema: NoInput,
    handler: async (): Promise<MessageContent> => {
      const project = await getSiengeService().getProject(await resolveCustomerProjectId())
      if (!project) {
        return { type: 'notice', message: 'Não encontrei informações desse empreendimento.' }
      }
      return { type: 'text', text: `${project.name} — ${project.address}.` }
    },
  },
  {
    name: 'get_delivery_forecast',
    description: 'Retorna a previsão de entrega do empreendimento do cliente.',
    allowedRoles: ['client'],
    inputSchema: NoInput,
    handler: async (): Promise<MessageContent> => {
      const forecast = await getSiengeService().getDeliveryForecast(await resolveCustomerProjectId())
      if (!forecast) {
        return { type: 'notice', message: 'Não encontrei a previsão de entrega no sistema.' }
      }
      return { type: 'text', text: `A previsão de entrega cadastrada é ${forecast}.` }
    },
  },
  {
    name: 'get_customer_documents',
    description: 'Lista os documentos disponíveis do cliente autenticado (ex: contrato).',
    allowedRoles: ['client'],
    inputSchema: NoInput,
    handler: async (_input, ctx): Promise<MessageContent> => {
      const customerId = await getSiengeCustomerId(ctx.supabase, ctx.userId)
      if (!customerId) {
        return { type: 'notice', message: 'Não encontrei documentos associados à sua conta.' }
      }

      const documents = await getSiengeService().getCustomerDocuments(customerId)
      if (documents.length === 0) {
        return { type: 'notice', message: 'Não encontrei nenhum documento disponível.' }
      }

      const [first] = documents
      return { type: 'document', message: `Aqui está: ${first.label}.`, documentUrl: first.url, label: first.label }
    },
  },
]
