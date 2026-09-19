import type { SiengeService, UnitFilters } from './service'
import type {
  SiengeContract,
  SiengeCustomer,
  SiengeDocument,
  SiengeInstallment,
  SiengeProject,
  SiengeUnit,
} from './types'

// MOCK — dados fictícios só para desenvolvimento. Nunca usar em produção
// real; substituir por uma implementação real de SiengeService quando a
// documentação da API estiver disponível (ver config.ts).

export const DEFAULT_MOCK_PROJECT_ID = 'proj-1'

const MOCK_PROJECT: SiengeProject = {
  id: DEFAULT_MOCK_PROJECT_ID,
  name: 'Residencial Exemplo',
  address: 'Rua Fictícia, 123 — Bairro Exemplo',
  deliveryForecast: '2029-09-30',
}

const MOCK_UNITS: SiengeUnit[] = [
  { id: 'unit-a304', code: 'A-304', tower: 'A', floor: 3, areaM2: 70, bedrooms: 3, price: 620000, status: 'disponivel' },
  { id: 'unit-a504', code: 'A-504', tower: 'A', floor: 5, areaM2: 70, bedrooms: 3, price: 650000, status: 'vendida' },
  { id: 'unit-a704', code: 'A-704', tower: 'A', floor: 7, areaM2: 72, bedrooms: 3, price: 680000, status: 'disponivel' },
  { id: 'unit-b603', code: 'B-603', tower: 'B', floor: 6, areaM2: 55, bedrooms: 2, price: 480000, status: 'disponivel' },
]

const MOCK_CUSTOMER: SiengeCustomer = { id: 'mock-customer', name: 'Felipe' }

const MOCK_CONTRACT: SiengeContract = {
  id: 'contract-1',
  projectId: DEFAULT_MOCK_PROJECT_ID,
  unitId: 'unit-a504',
  signedAt: '2026-01-15',
  totalValue: 650000,
  remainingBalance: 500000,
}

const MOCK_INSTALLMENTS: SiengeInstallment[] = [
  {
    id: 'inst-1',
    description: 'Parcela 10/36',
    dueDate: '2026-09-10',
    amount: 1250,
    status: 'atrasada',
    paidAt: null,
    paymentSlipUrl: 'https://example.com/mock/boleto-inst-1.pdf',
  },
  {
    id: 'inst-2',
    description: 'Parcela 11/36',
    dueDate: '2026-10-10',
    amount: 1250,
    status: 'aberta',
    paidAt: null,
    paymentSlipUrl: 'https://example.com/mock/boleto-inst-2.pdf',
  },
]

const MOCK_DOCUMENTS: SiengeDocument[] = [
  { id: 'doc-1', label: 'Contrato de compra e venda', url: 'https://example.com/mock/contrato.pdf' },
]

export class MockSiengeService implements SiengeService {
  async getCustomer(_customerId: string): Promise<SiengeCustomer | null> {
    return MOCK_CUSTOMER
  }

  async getCustomerContracts(_customerId: string): Promise<SiengeContract[]> {
    return [MOCK_CONTRACT]
  }

  async getCustomerInstallments(_customerId: string): Promise<SiengeInstallment[]> {
    return MOCK_INSTALLMENTS
  }

  async getOverdueInstallments(_customerId: string): Promise<SiengeInstallment[]> {
    return MOCK_INSTALLMENTS.filter((installment) => installment.status === 'atrasada')
  }

  async getPaymentSlip(installmentId: string): Promise<string | null> {
    return MOCK_INSTALLMENTS.find((installment) => installment.id === installmentId)?.paymentSlipUrl ?? null
  }

  async getProject(_projectId: string): Promise<SiengeProject | null> {
    return MOCK_PROJECT
  }

  async getDeliveryForecast(_projectId: string): Promise<string | null> {
    return MOCK_PROJECT.deliveryForecast
  }

  async getCustomerDocuments(_customerId: string): Promise<SiengeDocument[]> {
    return MOCK_DOCUMENTS
  }

  async getAvailableUnits(_projectId: string, filters?: UnitFilters): Promise<SiengeUnit[]> {
    return MOCK_UNITS.filter((unit) => {
      if (unit.status !== 'disponivel') return false
      if (filters?.bedrooms !== undefined && unit.bedrooms !== filters.bedrooms) return false
      if (filters?.tower !== undefined && unit.tower !== filters.tower) return false
      return true
    })
  }

  async getPriceTable(_projectId: string): Promise<SiengeUnit[]> {
    return MOCK_UNITS
  }

  async getUnitInformation(unitCode: string): Promise<SiengeUnit | null> {
    return MOCK_UNITS.find((unit) => unit.code.toLowerCase() === unitCode.toLowerCase()) ?? null
  }
}
