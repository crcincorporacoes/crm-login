import type {
  SiengeContract,
  SiengeCustomer,
  SiengeDocument,
  SiengeInstallment,
  SiengeProject,
  SiengeUnit,
} from './types'

export interface UnitFilters {
  bedrooms?: number
  tower?: string
}

export interface SiengeService {
  getCustomer(customerId: string): Promise<SiengeCustomer | null>
  getCustomerContracts(customerId: string): Promise<SiengeContract[]>
  getCustomerInstallments(customerId: string): Promise<SiengeInstallment[]>
  getOverdueInstallments(customerId: string): Promise<SiengeInstallment[]>
  getPaymentSlip(customerId: string, installmentId: string): Promise<string | null>
  getProject(projectId: string): Promise<SiengeProject | null>
  getDeliveryForecast(projectId: string): Promise<string | null>
  getCustomerDocuments(customerId: string): Promise<SiengeDocument[]>
  getAvailableUnits(projectId: string, filters?: UnitFilters): Promise<SiengeUnit[]>
  getPriceTable(projectId: string): Promise<SiengeUnit[]>
  getUnitInformation(unitCode: string): Promise<SiengeUnit | null>
}
