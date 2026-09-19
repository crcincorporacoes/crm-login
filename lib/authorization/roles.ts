export type StaffRole =
  | 'corretor'
  | 'gerente_comercial'
  | 'administrador'
  | 'financeiro'
  | 'pos_venda'
  | 'diretor'
  | 'engenharia'

export type Role = 'client' | StaffRole

export type ToolName =
  | 'get_overdue_installments'
  | 'get_next_installment'
  | 'get_customer_installments'
  | 'get_payment_slip'
  | 'get_project_information'
  | 'get_delivery_forecast'
  | 'get_customer_documents'
  | 'get_available_units'
  | 'get_price_table'
  | 'get_unit_information'
  | 'get_project_features'

// Fonte de verdade duplicada de propósito: cada ToolDefinition (Tarefa 7)
// também declara seu próprio `allowedRoles`, e é essa lista por-tool que o
// tool registry usa de fato para filtrar (`getToolsForRole`). Este mapa
// serve só para `roleHasChatAccess` decidir, antes de qualquer tool
// existir, se um papel tem alguma ferramenta — não pode importar o tool
// registry (inverteria a dependência: autorização é a camada mais baixa).
// Se as duas listas divergirem, o pior caso é `roleHasChatAccess` mentir
// sobre um papel ter acesso a UMA ferramenta a mais/menos do que o
// registry realmente expõe — não é um bypass de autorização real, porque
// o registry (não este mapa) é quem decide o que a IA pode chamar.
export const ROLE_TOOL_ACCESS: Record<Role, ToolName[]> = {
  client: [
    'get_overdue_installments',
    'get_next_installment',
    'get_customer_installments',
    'get_payment_slip',
    'get_project_information',
    'get_delivery_forecast',
    'get_customer_documents',
  ],
  corretor: [
    'get_available_units',
    'get_price_table',
    'get_unit_information',
    'get_project_features',
    'get_project_information',
  ],
  gerente_comercial: [],
  administrador: [],
  financeiro: [],
  pos_venda: [],
  diretor: [],
  engenharia: [],
}
