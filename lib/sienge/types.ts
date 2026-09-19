export interface SiengeCustomer {
  id: string
  name: string
}

export interface SiengeInstallment {
  id: string
  description: string
  dueDate: string
  amount: number
  status: 'paga' | 'aberta' | 'atrasada'
  paidAt: string | null
  paymentSlipUrl: string | null
}

export interface SiengeUnit {
  id: string
  code: string
  tower: string
  floor: number
  areaM2: number
  bedrooms: number
  price: number
  status: 'disponivel' | 'reservada' | 'vendida'
}

export interface SiengeProject {
  id: string
  name: string
  address: string
  deliveryForecast: string
}

export interface SiengeContract {
  id: string
  projectId: string
  unitId: string
  signedAt: string
  totalValue: number
  remainingBalance: number
}

export interface SiengeDocument {
  id: string
  label: string
  url: string
}
