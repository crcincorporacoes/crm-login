import { describe, expect, it } from 'vitest'
import { getToolsForRole } from './index'

describe('getToolsForRole', () => {
  it('cliente só recebe ferramentas financeiras/de projeto do cliente', () => {
    const names = getToolsForRole('client').map((tool) => tool.name)
    expect(names).toContain('get_overdue_installments')
    expect(names).not.toContain('get_available_units')
  })

  it('corretor só recebe ferramentas de disponibilidade/preço', () => {
    const names = getToolsForRole('corretor').map((tool) => tool.name)
    expect(names).toContain('get_available_units')
    expect(names).not.toContain('get_overdue_installments')
  })

  it('papel sem ferramentas retorna lista vazia', () => {
    expect(getToolsForRole('administrador')).toEqual([])
  })
})
