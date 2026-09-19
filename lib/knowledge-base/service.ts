export interface ProjectFeatures {
  projectId: string
  highlights: string[]
}

export interface KnowledgeBaseService {
  getProjectFeatures(projectId: string): Promise<ProjectFeatures | null>
}
