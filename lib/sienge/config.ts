import type { SiengeService } from './service'
import { MockSiengeService } from './mock-service'

let cachedService: SiengeService | null = null

export function getSiengeService(): SiengeService {
  if (cachedService) return cachedService

  const apiUrl = process.env.SIENGE_API_URL
  const apiToken = process.env.SIENGE_API_TOKEN

  if (!apiUrl || !apiToken) {
    cachedService = new MockSiengeService()
    return cachedService
  }

  throw new Error(
    'SIENGE_API_URL e SIENGE_API_TOKEN configurados, mas a integração real do Sienge ainda não foi implementada nesta etapa.'
  )
}
