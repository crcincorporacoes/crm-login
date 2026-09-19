import { z } from 'zod'
import type { ToolDefinition } from './registry'
import { getSiengeService } from '@/lib/sienge/config'
import { DEFAULT_MOCK_PROJECT_ID } from '@/lib/sienge/mock-service'
import { getKnowledgeBaseService } from '@/lib/knowledge-base/mock-service'
import type { MessageContent } from '@/lib/ai/message-content'

const NoInput = z.object({})

export const brokerTools: ToolDefinition[] = [
  {
    name: 'get_available_units',
    description: 'Lista unidades disponíveis, opcionalmente filtradas por número de quartos e/ou torre.',
    allowedRoles: ['corretor'],
    inputSchema: z.object({
      bedrooms: z.number().int().optional().describe('Número de quartos, se o corretor especificar'),
      tower: z.string().optional().describe('Torre, se o corretor especificar'),
    }),
    handler: async (input): Promise<MessageContent> => {
      const units = await getSiengeService().getAvailableUnits(DEFAULT_MOCK_PROJECT_ID, input)
      if (units.length === 0) {
        return { type: 'notice', message: 'Não encontrei unidades disponíveis com esse filtro.' }
      }
      return {
        type: 'unit_list',
        message: `Encontrei ${units.length} unidade(s) disponível(is).`,
        units: units.map((unit) => ({
          code: unit.code,
          tower: unit.tower,
          floor: unit.floor,
          areaM2: unit.areaM2,
          price: unit.price,
        })),
        actions: [{ type: 'suggestion', label: 'Ver tabela de preços completa' }],
      }
    },
  },
  {
    name: 'get_price_table',
    description: 'Retorna a tabela de preços completa do empreendimento.',
    allowedRoles: ['corretor'],
    inputSchema: NoInput,
    handler: async (): Promise<MessageContent> => {
      const units = await getSiengeService().getPriceTable(DEFAULT_MOCK_PROJECT_ID)
      return {
        type: 'unit_list',
        message: 'Tabela de preços atual.',
        units: units.map((unit) => ({
          code: unit.code,
          tower: unit.tower,
          floor: unit.floor,
          areaM2: unit.areaM2,
          price: unit.price,
        })),
      }
    },
  },
  {
    name: 'get_unit_information',
    description: 'Retorna informações detalhadas de uma unidade específica pelo código (ex: A-504).',
    allowedRoles: ['corretor'],
    inputSchema: z.object({ unitCode: z.string().describe('Código da unidade, ex: A-504') }),
    handler: async (input): Promise<MessageContent> => {
      const unit = await getSiengeService().getUnitInformation(input.unitCode)
      if (!unit) {
        return { type: 'notice', message: `Não encontrei a unidade ${input.unitCode}.` }
      }
      return {
        type: 'text',
        text: `${unit.code} — ${unit.bedrooms} quartos, ${unit.areaM2}m², torre ${unit.tower}, ${unit.floor}º andar, R$ ${unit.price.toFixed(2)}, status: ${unit.status}.`,
      }
    },
  },
  {
    name: 'get_project_features',
    description: 'Retorna os diferenciais e características institucionais do empreendimento.',
    allowedRoles: ['corretor'],
    inputSchema: NoInput,
    handler: async (): Promise<MessageContent> => {
      const features = await getKnowledgeBaseService().getProjectFeatures(DEFAULT_MOCK_PROJECT_ID)
      if (!features) {
        return { type: 'notice', message: 'Não encontrei diferenciais cadastrados para esse empreendimento.' }
      }
      return { type: 'text', text: `Diferenciais: ${features.highlights.join(', ')}.` }
    },
  },
]
