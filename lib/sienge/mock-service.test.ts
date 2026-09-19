import { describe, expect, it } from 'vitest'
import { MockSiengeService } from './mock-service'

describe('MockSiengeService', () => {
  const service = new MockSiengeService()

  it('getOverdueInstallments retorna só as atrasadas', async () => {
    const overdue = await service.getOverdueInstallments('any')
    expect(overdue).toHaveLength(1)
    expect(overdue[0].status).toBe('atrasada')
  })

  it('getAvailableUnits filtra por quartos e exclui vendidas', async () => {
    const units = await service.getAvailableUnits('proj-1', { bedrooms: 3 })
    expect(units.map((u) => u.code).sort()).toEqual(['A-304', 'A-704'])
  })

  it('getAvailableUnits filtra por torre', async () => {
    const units = await service.getAvailableUnits('proj-1', { tower: 'B' })
    expect(units.map((u) => u.code)).toEqual(['B-603'])
  })

  it('getUnitInformation é case-insensitive e retorna null se não achar', async () => {
    expect((await service.getUnitInformation('a-504'))?.code).toBe('A-504')
    expect(await service.getUnitInformation('Z-999')).toBeNull()
  })

  it('getPaymentSlip retorna null para id desconhecido', async () => {
    expect(await service.getPaymentSlip('inexistente')).toBeNull()
  })
})
