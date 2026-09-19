import type { ToolDefinition } from './registry'
import type { Role } from '@/lib/authorization/roles'
import { financialTools } from './financial'
import { projectTools } from './project'
import { brokerTools } from './broker'

const ALL_TOOLS: ToolDefinition[] = [...financialTools, ...projectTools, ...brokerTools]

export function getToolsForRole(role: Role): ToolDefinition[] {
  return ALL_TOOLS.filter((tool) => tool.allowedRoles.includes(role))
}
