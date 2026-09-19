import type { KnowledgeBaseService, ProjectFeatures } from './service'
import { DEFAULT_MOCK_PROJECT_ID } from '@/lib/sienge/mock-service'

// MOCK — conteúdo institucional fictício para desenvolvimento.
const MOCK_FEATURES: ProjectFeatures = {
  projectId: DEFAULT_MOCK_PROJECT_ID,
  highlights: [
    'Piscina com raia de 25 metros',
    'Academia equipada 24h',
    'Salão de festas com espaço gourmet',
    'Portaria com controle de acesso biométrico',
  ],
}

class MockKnowledgeBaseService implements KnowledgeBaseService {
  async getProjectFeatures(projectId: string): Promise<ProjectFeatures | null> {
    return projectId === MOCK_FEATURES.projectId ? MOCK_FEATURES : null
  }
}

export function getKnowledgeBaseService(): KnowledgeBaseService {
  return new MockKnowledgeBaseService()
}
