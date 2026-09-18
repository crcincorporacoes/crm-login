# CRM Conversacional (Etapa 2) — Plano de Implementação

> **Para executores automatizados:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para rastreamento.

**Goal:** Transformar `/portal` (cliente) e `/dashboard` (equipe) numa experiência conversacional com IA (Claude), com tool-calling autorizado por papel, dados mockados do Sienge, histórico persistido e auditoria básica.

**Architecture:** Camadas desacopladas — `lib/authorization` (papéis/permissões), `lib/sienge` (interface + mock, isolando toda integração externa), `lib/knowledge-base` (conteúdo institucional mock), `lib/ai` (provider Claude + tool registry + tipos de mensagem rica), `lib/conversations`/`lib/audit` (persistência), um único endpoint `app/api/chat/route.ts` com streaming, e componentes de chat em `components/chat/` reaproveitando os tokens de marca já existentes.

**Tech Stack:** Next.js 16 (App Router) + TypeScript + Supabase (Postgres/RLS) + `@anthropic-ai/sdk` (Claude Opus, tool runner) + `zod` (schemas de tool) + `vitest` (testes unitários das camadas puras).

**Spec:** `docs/superpowers/specs/2026-09-18-chat-conversacional-design.md`

## Global Constraints

- Nenhuma chamada ao Sienge fora de `lib/sienge/` — tudo passa por `SiengeService`.
- `userId` e papel sempre resolvidos no servidor a partir da sessão Supabase — nunca aceitos do corpo da requisição.
- IA nunca inventa dado financeiro/contratual: sem retorno da tool, resposta é "não encontrei essa informação no sistema".
- Ações sensíveis (segunda via, proposta) exigem confirmação explícita antes de executar — nesta etapa isso significa: a tool nunca executa a ação por si, só oferece o botão de ação (o clique é o "confirmar").
- Erros técnicos nunca aparecem ao usuário final — sempre mensagem genérica amigável; detalhe técnico só em log de servidor.
- `profiles` (tabela existente) não é alterada estruturalmente além de uma nova coluna nullable — nenhuma política de RLS existente é removida ou enfraquecida.
- Todo texto de interface é em português (pt-BR), seguindo o padrão visual já estabelecido (`--brand-yellow`, `--brand-ink`, `--brand-paper`, Big Shoulders para headings).
- Políticas de RLS novas usam `(select auth.uid())` (não `auth.uid()` solto) e toda coluna usada em política de RLS tem índice — recomendação do guia de boas práticas Postgres do Supabase.
- Sem suíte de testes automatizados para UI/integração (mesma decisão dos planos anteriores deste projeto) — mas as camadas puras (`lib/authorization`, `lib/sienge/mock-service`, `lib/ai/message-content`, `lib/ai/tools`) ganham testes unitários com `vitest`, por lidarem com controle de acesso e dados financeiros.

---

### Tarefa 1: Dependências e tooling de teste

**Arquivos:**
- Modificar: `package.json`
- Criar: `vitest.config.ts`

**Interfaces:**
- Consome: nada.
- Produz: `npm run test` disponível para as próximas tarefas; `@anthropic-ai/sdk`, `zod` instalados.

- [ ] **Passo 1: Instalar dependências de produção e dev**

```bash
npm install @anthropic-ai/sdk zod
npm install --save-dev vitest
```

- [ ] **Passo 2: Criar `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
  },
})
```

- [ ] **Passo 3: Adicionar script de teste em `package.json`**

No bloco `"scripts"`, adicionar:

```json
"test": "vitest run"
```

- [ ] **Passo 4: Verificação manual — rodar o comando sem nenhum teste ainda**

```bash
npm run test
```

Esperado: `vitest` executa e reporta "No test files found" (ainda não criamos nenhum `.test.ts`) — sem erro de configuração.

- [ ] **Passo 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest and Claude/zod dependencies"
```

---

### Tarefa 2: Migrations — papéis, conversas, auditoria

**Arquivos:**
- Criar: `supabase/migrations/0002_team_members.sql`
- Criar: `supabase/migrations/0003_conversations_messages.sql`
- Criar: `supabase/migrations/0004_tool_executions_audit_logs.sql`
- Criar: `supabase/migrations/0005_profiles_sienge_customer_id.sql`

**Interfaces:**
- Consome: nada.
- Produz: tabelas `team_members`, `conversations`, `messages`, `tool_executions`, `audit_logs` e a coluna `profiles.sienge_customer_id` no Supabase real do projeto — usadas por todas as tarefas seguintes.

- [ ] **Passo 1: Criar `supabase/migrations/0002_team_members.sql`**

```sql
create table team_members (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (
    role in (
      'corretor',
      'gerente_comercial',
      'administrador',
      'financeiro',
      'pos_venda',
      'diretor',
      'engenharia'
    )
  ),
  created_at timestamptz not null default now()
);

alter table team_members enable row level security;

create policy "Usuários veem apenas seu próprio papel"
  on team_members for select
  to authenticated
  using ((select auth.uid()) = id);
```

Sem política de insert/update para `authenticated` — atribuição de papel é feita só pelo service role (script `scripts/assign-role.ts`, Tarefa 3), de propósito, já que não existe painel admin ainda.

- [ ] **Passo 2: Criar `supabase/migrations/0003_conversations_messages.sql`**

```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_at_time text not null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_id_idx on conversations (user_id);

alter table conversations enable row level security;

create policy "Usuários veem apenas suas conversas"
  on conversations for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Usuários criam apenas suas conversas"
  on conversations for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Usuários atualizam apenas suas conversas"
  on conversations for update
  to authenticated
  using ((select auth.uid()) = user_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on messages (conversation_id);

alter table messages enable row level security;

create policy "Usuários veem mensagens das próprias conversas"
  on messages for select
  to authenticated
  using (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = (select auth.uid())
    )
  );

create policy "Usuários criam mensagens nas próprias conversas"
  on messages for insert
  to authenticated
  with check (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = (select auth.uid())
    )
  );
```

- [ ] **Passo 3: Criar `supabase/migrations/0004_tool_executions_audit_logs.sql`**

```sql
create table tool_executions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  tool_name text not null,
  input jsonb not null,
  output jsonb,
  success boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create index tool_executions_message_id_idx on tool_executions (message_id);

alter table tool_executions enable row level security;

create policy "Usuários veem execuções de tool das próprias mensagens"
  on tool_executions for select
  to authenticated
  using (
    exists (
      select 1 from messages
      join conversations on conversations.id = messages.conversation_id
      where messages.id = tool_executions.message_id
        and conversations.user_id = (select auth.uid())
    )
  );

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_user_id_idx on audit_logs (user_id);

alter table audit_logs enable row level security;

create policy "Usuários veem apenas seus próprios logs de auditoria"
  on audit_logs for select
  to authenticated
  using ((select auth.uid()) = user_id);
```

Sem política de insert para `authenticated` em nenhuma das duas — escrita sempre via client administrativo no servidor (mesmo padrão já usado em `app/signup/actions.ts` para inserir `profiles`).

- [ ] **Passo 4: Criar `supabase/migrations/0005_profiles_sienge_customer_id.sql`**

```sql
alter table profiles add column sienge_customer_id text;
```

- [ ] **Passo 5: Ação manual do usuário — rodar as 4 migrações no Supabase**

Peça para o usuário: painel do projeto em supabase.com → **SQL Editor** → **New query** → colar o conteúdo de `0002_team_members.sql` → **Run** → repetir para `0003`, `0004`, `0005`, nessa ordem (há dependência: `messages` referencia `conversations`, `tool_executions` referencia `messages`).

Se você é o agente executando esta tarefa e não tem como pedir isso ao usuário diretamente, pare aqui e reporte BLOCKED.

- [ ] **Passo 6: Verificação manual — confirmar que as tabelas existem**

```bash
set -a; source .env.local; set +a
for t in team_members conversations messages tool_executions audit_logs; do
  echo "$t:"; curl -s -o /dev/null -w "%{http_code}\n" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/$t?select=id&limit=1" \
    -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
done
```

Esperado: `200` para todas (RLS bloqueia linhas, não o endpoint).

- [ ] **Passo 7: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add team_members, conversations, messages, tool_executions and audit_logs tables"
```

---

### Tarefa 3: Script de atribuição de papel

**Arquivos:**
- Criar: `scripts/assign-role.ts`

**Interfaces:**
- Consome: tabela `team_members` (Tarefa 2).
- Produz: forma de atribuir papel a uma conta de equipe existente, usada na verificação manual das Tarefas 11 e 12.

- [ ] **Passo 1: Criar `scripts/assign-role.ts`**

```ts
import { createClient } from '@supabase/supabase-js'

const VALID_ROLES = [
  'corretor',
  'gerente_comercial',
  'administrador',
  'financeiro',
  'pos_venda',
  'diretor',
  'engenharia',
]

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}

const [, , email, role] = process.argv

if (!email || !role) {
  console.error('Uso: npx tsx scripts/assign-role.ts <email> <papel>')
  console.error(`Papéis válidos: ${VALID_ROLES.join(', ')}`)
  process.exit(1)
}

if (!VALID_ROLES.includes(role)) {
  console.error(`Papel inválido "${role}". Papéis válidos: ${VALID_ROLES.join(', ')}`)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function main() {
  const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers()

  if (listError) {
    console.error('Erro ao buscar usuário:', listError.message)
    process.exit(1)
  }

  const user = usersPage.users.find((candidate) => candidate.email === email)

  if (!user) {
    console.error(`Usuário com email ${email} não encontrado`)
    process.exit(1)
  }

  const { error: upsertError } = await supabase
    .from('team_members')
    .upsert({ id: user.id, role })

  if (upsertError) {
    console.error('Erro ao atribuir papel:', upsertError.message)
    process.exit(1)
  }

  console.log(`Papel "${role}" atribuído a ${email}`)
}

main()
```

- [ ] **Passo 2: Verificação manual**

```bash
npx tsx --env-file=.env.local scripts/assign-role.ts teste@example.com corretor
```

Esperado: `Papel "corretor" atribuído a teste@example.com`.

- [ ] **Passo 3: Commit**

```bash
git add scripts/assign-role.ts
git commit -m "feat: add CLI script to assign a role to a team account"
```

---

### Tarefa 4: Autorização (papéis e permissões)

**Arquivos:**
- Criar: `lib/authorization/roles.ts`
- Criar: `lib/authorization/service.ts`
- Test: `lib/authorization/service.test.ts`

**Interfaces:**
- Consome: `hasProfile` de `lib/supabase/profile.ts` (já existe).
- Produz: `Role`, `ToolName`, `ROLE_TOOL_ACCESS` (usados pelas Tarefas 6–9); `resolveRole(supabase, userId)`, `canUseTool(role, toolName)`, `roleHasChatAccess(role)` (usados pelas Tarefas 9 e 11).

- [ ] **Passo 1: Criar `lib/authorization/roles.ts`**

```ts
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
```

- [ ] **Passo 2: Criar `lib/authorization/service.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasProfile } from '@/lib/supabase/profile'
import { ROLE_TOOL_ACCESS, type Role, type ToolName } from './roles'

export async function resolveRole(
  supabase: SupabaseClient,
  userId: string
): Promise<Role | null> {
  if (await hasProfile(supabase, userId)) {
    return 'client'
  }

  const { data } = await supabase
    .from('team_members')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  return (data?.role as Role | undefined) ?? null
}

export function canUseTool(role: Role, toolName: ToolName): boolean {
  return ROLE_TOOL_ACCESS[role].includes(toolName)
}

export function roleHasChatAccess(role: Role | null): role is Role {
  return role !== null && ROLE_TOOL_ACCESS[role].length > 0
}
```

- [ ] **Passo 3: Escrever `lib/authorization/service.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveRole, canUseTool, roleHasChatAccess } from './service'

function fakeSupabase(tableResponses: Record<string, unknown>): SupabaseClient {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: tableResponses[table] ?? null }),
              }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient
}

describe('resolveRole', () => {
  it('retorna "client" quando existe linha em profiles', async () => {
    const supabase = fakeSupabase({ profiles: { id: 'user-1' } })
    expect(await resolveRole(supabase, 'user-1')).toBe('client')
  })

  it('retorna o papel de team_members quando não há profile', async () => {
    const supabase = fakeSupabase({ profiles: null, team_members: { role: 'corretor' } })
    expect(await resolveRole(supabase, 'user-2')).toBe('corretor')
  })

  it('retorna null quando não há profile nem team_members', async () => {
    const supabase = fakeSupabase({ profiles: null, team_members: null })
    expect(await resolveRole(supabase, 'user-3')).toBeNull()
  })
})

describe('canUseTool', () => {
  it('permite tool listada para o papel', () => {
    expect(canUseTool('client', 'get_overdue_installments')).toBe(true)
  })

  it('bloqueia tool não listada para o papel', () => {
    expect(canUseTool('client', 'get_available_units')).toBe(false)
  })
})

describe('roleHasChatAccess', () => {
  it('true para papéis com ferramentas', () => {
    expect(roleHasChatAccess('client')).toBe(true)
    expect(roleHasChatAccess('corretor')).toBe(true)
  })

  it('false para papel sem ferramentas ou null', () => {
    expect(roleHasChatAccess('administrador')).toBe(false)
    expect(roleHasChatAccess(null)).toBe(false)
  })
})
```

- [ ] **Passo 4: Rodar os testes**

```bash
npm run test -- lib/authorization
```

Esperado: todos os testes passam.

- [ ] **Passo 5: Commit**

```bash
git add lib/authorization
git commit -m "feat: add role resolution and tool authorization service"
```

---

### Tarefa 5: Camada Sienge (interface + mock)

**Arquivos:**
- Criar: `lib/sienge/types.ts`
- Criar: `lib/sienge/service.ts`
- Criar: `lib/sienge/mock-service.ts`
- Criar: `lib/sienge/config.ts`
- Criar: `lib/sienge/customer-id.ts`
- Test: `lib/sienge/mock-service.test.ts`

**Interfaces:**
- Consome: nada (mock autocontido); `customer-id.ts` consome uma instância de `SupabaseClient`.
- Produz: `SiengeService`, `getSiengeService()`, `getSiengeCustomerId(supabase, userId)` — usados pelas Tarefas 7 (tools).

- [ ] **Passo 1: Criar `lib/sienge/types.ts`**

```ts
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
```

- [ ] **Passo 2: Criar `lib/sienge/service.ts`**

```ts
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
  getPaymentSlip(installmentId: string): Promise<string | null>
  getProject(projectId: string): Promise<SiengeProject | null>
  getDeliveryForecast(projectId: string): Promise<string | null>
  getCustomerDocuments(customerId: string): Promise<SiengeDocument[]>
  getAvailableUnits(projectId: string, filters?: UnitFilters): Promise<SiengeUnit[]>
  getPriceTable(projectId: string): Promise<SiengeUnit[]>
  getUnitInformation(unitCode: string): Promise<SiengeUnit | null>
}
```

- [ ] **Passo 3: Criar `lib/sienge/mock-service.ts`**

```ts
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
  async getCustomer(): Promise<SiengeCustomer | null> {
    return MOCK_CUSTOMER
  }

  async getCustomerContracts(): Promise<SiengeContract[]> {
    return [MOCK_CONTRACT]
  }

  async getCustomerInstallments(): Promise<SiengeInstallment[]> {
    return MOCK_INSTALLMENTS
  }

  async getOverdueInstallments(): Promise<SiengeInstallment[]> {
    return MOCK_INSTALLMENTS.filter((installment) => installment.status === 'atrasada')
  }

  async getPaymentSlip(installmentId: string): Promise<string | null> {
    return MOCK_INSTALLMENTS.find((installment) => installment.id === installmentId)?.paymentSlipUrl ?? null
  }

  async getProject(): Promise<SiengeProject | null> {
    return MOCK_PROJECT
  }

  async getDeliveryForecast(): Promise<string | null> {
    return MOCK_PROJECT.deliveryForecast
  }

  async getCustomerDocuments(): Promise<SiengeDocument[]> {
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

  async getPriceTable(): Promise<SiengeUnit[]> {
    return MOCK_UNITS
  }

  async getUnitInformation(unitCode: string): Promise<SiengeUnit | null> {
    return MOCK_UNITS.find((unit) => unit.code.toLowerCase() === unitCode.toLowerCase()) ?? null
  }
}
```

- [ ] **Passo 4: Criar `lib/sienge/config.ts`**

```ts
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
```

- [ ] **Passo 5: Criar `lib/sienge/customer-id.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getSiengeCustomerId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('sienge_customer_id')
    .eq('id', userId)
    .maybeSingle()

  return (data?.sienge_customer_id as string | null | undefined) ?? null
}
```

- [ ] **Passo 6: Escrever `lib/sienge/mock-service.test.ts`**

```ts
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
```

- [ ] **Passo 7: Rodar os testes**

```bash
npm run test -- lib/sienge
```

Esperado: todos os testes passam.

- [ ] **Passo 8: Commit**

```bash
git add lib/sienge
git commit -m "feat: add Sienge service interface and mock implementation"
```

---

### Tarefa 6: Base de conhecimento (mock) e mensagens ricas

**Arquivos:**
- Criar: `lib/knowledge-base/service.ts`
- Criar: `lib/knowledge-base/mock-service.ts`
- Criar: `lib/ai/message-content.ts`
- Test: `lib/ai/message-content.test.ts`

**Interfaces:**
- Consome: nada.
- Produz: `getKnowledgeBaseService()`, `MessageContent` (usados pela Tarefa 7 e pelos componentes de chat na Tarefa 10).

- [ ] **Passo 1: Criar `lib/knowledge-base/service.ts`**

```ts
export interface ProjectFeatures {
  projectId: string
  highlights: string[]
}

export interface KnowledgeBaseService {
  getProjectFeatures(projectId: string): Promise<ProjectFeatures | null>
}
```

- [ ] **Passo 2: Criar `lib/knowledge-base/mock-service.ts`**

```ts
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
```

- [ ] **Passo 3: Criar `lib/ai/message-content.ts`**

```ts
export interface MessageAction {
  type: 'download' | 'suggestion'
  label: string
  payload?: string
}

export type MessageContent =
  | { type: 'text'; text: string }
  | {
      type: 'financial_installment'
      message: string
      data: { description: string; dueDate: string; amount: number; status: string }
      actions?: MessageAction[]
    }
  | {
      type: 'unit_list'
      message: string
      units: Array<{ code: string; tower: string; floor: number; areaM2: number; price: number }>
      actions?: MessageAction[]
    }
  | { type: 'document'; message: string; documentUrl: string; label: string }
  | { type: 'notice'; message: string }

export function messageContentToPlainText(content: MessageContent): string {
  return content.type === 'text' ? content.text : content.message
}
```

- [ ] **Passo 4: Escrever `lib/ai/message-content.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { messageContentToPlainText, type MessageContent } from './message-content'

describe('messageContentToPlainText', () => {
  it('retorna o texto puro pra conteúdo do tipo text', () => {
    const content: MessageContent = { type: 'text', text: 'olá' }
    expect(messageContentToPlainText(content)).toBe('olá')
  })

  it('retorna a mensagem pra conteúdo do tipo notice', () => {
    const content: MessageContent = { type: 'notice', message: 'aviso' }
    expect(messageContentToPlainText(content)).toBe('aviso')
  })

  it('retorna a mensagem pra conteúdo do tipo document', () => {
    const content: MessageContent = {
      type: 'document',
      message: 'aqui está',
      documentUrl: 'https://example.com/x.pdf',
      label: 'Contrato',
    }
    expect(messageContentToPlainText(content)).toBe('aqui está')
  })
})
```

- [ ] **Passo 5: Rodar os testes**

```bash
npm run test -- lib/knowledge-base lib/ai/message-content
```

Esperado: todos os testes passam.

- [ ] **Passo 6: Commit**

```bash
git add lib/knowledge-base lib/ai/message-content.ts lib/ai/message-content.test.ts
git commit -m "feat: add knowledge base mock service and rich message content types"
```

---

### Tarefa 7: Tool Registry e ferramentas

**Arquivos:**
- Criar: `lib/ai/tools/registry.ts`
- Criar: `lib/ai/tools/financial.ts`
- Criar: `lib/ai/tools/project.ts`
- Criar: `lib/ai/tools/broker.ts`
- Criar: `lib/ai/tools/index.ts`
- Test: `lib/ai/tools/index.test.ts`

**Interfaces:**
- Consome: `Role`/`ToolName` (Tarefa 4), `SiengeService`/`getSiengeCustomerId` (Tarefa 5), `KnowledgeBaseService` (Tarefa 6), `MessageContent` (Tarefa 6).
- Produz: `getToolsForRole(role)` — usado pela Tarefa 9 (endpoint de chat).

- [ ] **Passo 1: Criar `lib/ai/tools/registry.ts`**

```ts
import type { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Role, ToolName } from '@/lib/authorization/roles'

export interface ToolContext {
  userId: string
  role: Role
  supabase: SupabaseClient
}

// `any` é intencional aqui: o registro guarda ferramentas com schemas de
// entrada heterogêneos. Cada ferramenta individual é escrita com um tipo
// de entrada concreto (ver financial.ts/project.ts/broker.ts); só o
// agregado (`ToolDefinition<any>[]`) precisa ser genérico.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolDefinition<TInput = any> {
  name: ToolName
  description: string
  allowedRoles: Role[]
  inputSchema: z.ZodType<TInput>
  handler: (input: TInput, ctx: ToolContext) => Promise<unknown>
}
```

- [ ] **Passo 2: Criar `lib/ai/tools/financial.ts`**

```ts
import { z } from 'zod'
import type { ToolDefinition } from './registry'
import { getSiengeService } from '@/lib/sienge/config'
import { getSiengeCustomerId } from '@/lib/sienge/customer-id'
import type { MessageContent } from '@/lib/ai/message-content'

const NoInput = z.object({})

const NOT_FOUND: MessageContent = {
  type: 'notice',
  message: 'Não encontrei seu cadastro financeiro no sistema.',
}

export const financialTools: ToolDefinition[] = [
  {
    name: 'get_overdue_installments',
    description: 'Retorna as parcelas em atraso do cliente autenticado.',
    allowedRoles: ['client'],
    inputSchema: NoInput,
    handler: async (_input, ctx): Promise<MessageContent> => {
      const customerId = await getSiengeCustomerId(ctx.supabase, ctx.userId)
      if (!customerId) return NOT_FOUND

      const overdue = await getSiengeService().getOverdueInstallments(customerId)
      if (overdue.length === 0) {
        return { type: 'notice', message: 'Você não tem nenhuma parcela em atraso.' }
      }

      const installment = overdue[0]
      return {
        type: 'financial_installment',
        message: `Encontrei uma parcela em atraso, vencida em ${installment.dueDate}, no valor de R$ ${installment.amount.toFixed(2)}. Deseja gerar a segunda via?`,
        data: {
          description: installment.description,
          dueDate: installment.dueDate,
          amount: installment.amount,
          status: installment.status,
        },
        actions: [{ type: 'download', label: 'Gerar segunda via', payload: installment.id }],
      }
    },
  },
  {
    name: 'get_next_installment',
    description: 'Retorna a próxima parcela em aberto do cliente autenticado.',
    allowedRoles: ['client'],
    inputSchema: NoInput,
    handler: async (_input, ctx): Promise<MessageContent> => {
      const customerId = await getSiengeCustomerId(ctx.supabase, ctx.userId)
      if (!customerId) return NOT_FOUND

      const installments = await getSiengeService().getCustomerInstallments(customerId)
      const next = installments.find((installment) => installment.status === 'aberta')
      if (!next) {
        return { type: 'notice', message: 'Não encontrei nenhuma parcela em aberto.' }
      }

      return {
        type: 'financial_installment',
        message: `Sua próxima parcela vence em ${next.dueDate}, no valor de R$ ${next.amount.toFixed(2)}.`,
        data: {
          description: next.description,
          dueDate: next.dueDate,
          amount: next.amount,
          status: next.status,
        },
        actions: [{ type: 'download', label: 'Ver boleto', payload: next.id }],
      }
    },
  },
  {
    name: 'get_customer_installments',
    description: 'Lista as últimas parcelas (pagas e em aberto) do cliente autenticado.',
    allowedRoles: ['client'],
    inputSchema: NoInput,
    handler: async (_input, ctx): Promise<MessageContent> => {
      const customerId = await getSiengeCustomerId(ctx.supabase, ctx.userId)
      if (!customerId) return NOT_FOUND

      const installments = await getSiengeService().getCustomerInstallments(customerId)
      if (installments.length === 0) {
        return { type: 'notice', message: 'Não encontrei parcelas cadastradas.' }
      }

      const lines = installments
        .map((installment) => `${installment.dueDate} — R$ ${installment.amount.toFixed(2)} — ${installment.status}`)
        .join('\n')

      return { type: 'text', text: `Suas últimas parcelas:\n${lines}` }
    },
  },
  {
    name: 'get_payment_slip',
    description: 'Retorna o link do boleto (segunda via) de uma parcela pelo id.',
    allowedRoles: ['client'],
    inputSchema: z.object({ installmentId: z.string().describe('Id da parcela, obtido de uma consulta anterior') }),
    handler: async (input, ctx): Promise<MessageContent> => {
      const customerId = await getSiengeCustomerId(ctx.supabase, ctx.userId)
      if (!customerId) return NOT_FOUND

      const url = await getSiengeService().getPaymentSlip(input.installmentId)
      if (!url) {
        return { type: 'notice', message: 'Não encontrei esse boleto no sistema.' }
      }

      return { type: 'document', message: 'Aqui está a segunda via do seu boleto.', documentUrl: url, label: 'Boleto' }
    },
  },
]
```

- [ ] **Passo 3: Criar `lib/ai/tools/project.ts`**

```ts
import { z } from 'zod'
import type { ToolDefinition } from './registry'
import { getSiengeService } from '@/lib/sienge/config'
import { getSiengeCustomerId } from '@/lib/sienge/customer-id'
import { DEFAULT_MOCK_PROJECT_ID } from '@/lib/sienge/mock-service'
import type { MessageContent } from '@/lib/ai/message-content'

const NoInput = z.object({})

async function resolveCustomerProjectId(): Promise<string> {
  // Nesta etapa (mock), todo cliente pertence ao mesmo empreendimento
  // fictício. Quando a integração real existir, isso vem do contrato do
  // cliente (getCustomerContracts), não de um valor fixo.
  return DEFAULT_MOCK_PROJECT_ID
}

export const projectTools: ToolDefinition[] = [
  {
    name: 'get_project_information',
    description: 'Retorna informações gerais do empreendimento do cliente (endereço, nome).',
    allowedRoles: ['client', 'corretor'],
    inputSchema: NoInput,
    handler: async (): Promise<MessageContent> => {
      const project = await getSiengeService().getProject(await resolveCustomerProjectId())
      if (!project) {
        return { type: 'notice', message: 'Não encontrei informações desse empreendimento.' }
      }
      return { type: 'text', text: `${project.name} — ${project.address}.` }
    },
  },
  {
    name: 'get_delivery_forecast',
    description: 'Retorna a previsão de entrega do empreendimento do cliente.',
    allowedRoles: ['client'],
    inputSchema: NoInput,
    handler: async (): Promise<MessageContent> => {
      const forecast = await getSiengeService().getDeliveryForecast(await resolveCustomerProjectId())
      if (!forecast) {
        return { type: 'notice', message: 'Não encontrei a previsão de entrega no sistema.' }
      }
      return { type: 'text', text: `A previsão de entrega cadastrada é ${forecast}.` }
    },
  },
  {
    name: 'get_customer_documents',
    description: 'Lista os documentos disponíveis do cliente autenticado (ex: contrato).',
    allowedRoles: ['client'],
    inputSchema: NoInput,
    handler: async (_input, ctx): Promise<MessageContent> => {
      const customerId = await getSiengeCustomerId(ctx.supabase, ctx.userId)
      if (!customerId) {
        return { type: 'notice', message: 'Não encontrei documentos associados à sua conta.' }
      }

      const documents = await getSiengeService().getCustomerDocuments(customerId)
      if (documents.length === 0) {
        return { type: 'notice', message: 'Não encontrei nenhum documento disponível.' }
      }

      const [first] = documents
      return { type: 'document', message: `Aqui está: ${first.label}.`, documentUrl: first.url, label: first.label }
    },
  },
]
```

- [ ] **Passo 4: Criar `lib/ai/tools/broker.ts`**

```ts
import { z } from 'zod'
import type { ToolDefinition } from './registry'
import { getSiengeService } from '@/lib/sienge/config'
import { DEFAULT_MOCK_PROJECT_ID } from '@/lib/sienge/mock-service'
import { getKnowledgeBaseService } from '@/lib/knowledge-base/mock-service'
import type { MessageContent } from '@/lib/ai/message-content'

const NoInput = z.object({})

export const brokerTools: ToolDefinition[] = [
  {
    name: 'get_available_units',
    description: 'Lista unidades disponíveis, opcionalmente filtradas por número de quartos e/ou torre.',
    allowedRoles: ['corretor'],
    inputSchema: z.object({
      bedrooms: z.number().int().optional().describe('Número de quartos, se o corretor especificar'),
      tower: z.string().optional().describe('Torre, se o corretor especificar'),
    }),
    handler: async (input): Promise<MessageContent> => {
      const units = await getSiengeService().getAvailableUnits(DEFAULT_MOCK_PROJECT_ID, input)
      if (units.length === 0) {
        return { type: 'notice', message: 'Não encontrei unidades disponíveis com esse filtro.' }
      }
      return {
        type: 'unit_list',
        message: `Encontrei ${units.length} unidade(s) disponível(is).`,
        units: units.map((unit) => ({
          code: unit.code,
          tower: unit.tower,
          floor: unit.floor,
          areaM2: unit.areaM2,
          price: unit.price,
        })),
        actions: [{ type: 'suggestion', label: 'Ver tabela de preços completa' }],
      }
    },
  },
  {
    name: 'get_price_table',
    description: 'Retorna a tabela de preços completa do empreendimento.',
    allowedRoles: ['corretor'],
    inputSchema: NoInput,
    handler: async (): Promise<MessageContent> => {
      const units = await getSiengeService().getPriceTable(DEFAULT_MOCK_PROJECT_ID)
      return {
        type: 'unit_list',
        message: 'Tabela de preços atual.',
        units: units.map((unit) => ({
          code: unit.code,
          tower: unit.tower,
          floor: unit.floor,
          areaM2: unit.areaM2,
          price: unit.price,
        })),
      }
    },
  },
  {
    name: 'get_unit_information',
    description: 'Retorna informações detalhadas de uma unidade específica pelo código (ex: A-504).',
    allowedRoles: ['corretor'],
    inputSchema: z.object({ unitCode: z.string().describe('Código da unidade, ex: A-504') }),
    handler: async (input): Promise<MessageContent> => {
      const unit = await getSiengeService().getUnitInformation(input.unitCode)
      if (!unit) {
        return { type: 'notice', message: `Não encontrei a unidade ${input.unitCode}.` }
      }
      return {
        type: 'text',
        text: `${unit.code} — ${unit.bedrooms} quartos, ${unit.areaM2}m², torre ${unit.tower}, ${unit.floor}º andar, R$ ${unit.price.toFixed(2)}, status: ${unit.status}.`,
      }
    },
  },
  {
    name: 'get_project_features',
    description: 'Retorna os diferenciais e características institucionais do empreendimento.',
    allowedRoles: ['corretor'],
    inputSchema: NoInput,
    handler: async (): Promise<MessageContent> => {
      const features = await getKnowledgeBaseService().getProjectFeatures(DEFAULT_MOCK_PROJECT_ID)
      if (!features) {
        return { type: 'notice', message: 'Não encontrei diferenciais cadastrados para esse empreendimento.' }
      }
      return { type: 'text', text: `Diferenciais: ${features.highlights.join(', ')}.` }
    },
  },
]
```

- [ ] **Passo 5: Criar `lib/ai/tools/index.ts`**

```ts
import type { ToolDefinition } from './registry'
import type { Role } from '@/lib/authorization/roles'
import { financialTools } from './financial'
import { projectTools } from './project'
import { brokerTools } from './broker'

const ALL_TOOLS: ToolDefinition[] = [...financialTools, ...projectTools, ...brokerTools]

export function getToolsForRole(role: Role): ToolDefinition[] {
  return ALL_TOOLS.filter((tool) => tool.allowedRoles.includes(role))
}
```

- [ ] **Passo 6: Escrever `lib/ai/tools/index.test.ts`**

```ts
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
```

- [ ] **Passo 7: Rodar os testes**

```bash
npm run test -- lib/ai/tools
```

Esperado: todos os testes passam.

- [ ] **Passo 8: `tsc --noEmit` de sanidade**

```bash
npx tsc --noEmit
```

Esperado: sem erros. Se houver erro de tipo nas tools (ex: incompatibilidade de `inputSchema`/`handler`), ajuste os tipos aqui antes de prosseguir — as tarefas seguintes dependem dessa camada compilar limpa.

- [ ] **Passo 9: Commit**

```bash
git add lib/ai/tools
git commit -m "feat: add tool registry with financial, project and broker tools"
```

---

### Tarefa 8: Persistência de conversas e auditoria

**Arquivos:**
- Criar: `lib/conversations/service.ts`
- Criar: `lib/audit/log.ts`

**Interfaces:**
- Consome: `MessageContent` (Tarefa 6), client Supabase (do request, já autenticado) e `createAdminClient` (existente, `lib/supabase/admin.ts`).
- Produz: `createConversation`, `appendMessage`, `listConversations`, `getConversationMessages` (usados pela Tarefa 9 e pelo componente `ConversationSidebar` na Tarefa 10); `logAudit`, `logToolExecutions` (usados pela Tarefa 9).

- [ ] **Passo 1: Criar `lib/conversations/service.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Role } from '@/lib/authorization/roles'
import type { MessageContent } from '@/lib/ai/message-content'

export interface ConversationSummary {
  id: string
  title: string | null
  updatedAt: string
}

export interface StoredMessage {
  id: string
  role: 'user' | 'assistant'
  content: MessageContent
  createdAt: string
}

export async function createConversation(
  supabase: SupabaseClient,
  userId: string,
  role: Role
): Promise<string> {
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, role_at_time: role })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Não foi possível criar a conversa: ${error?.message}`)
  }

  return data.id as string
}

export async function appendMessage(
  supabase: SupabaseClient,
  conversationId: string,
  role: 'user' | 'assistant',
  content: MessageContent
): Promise<string> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, role, content })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Não foi possível salvar a mensagem: ${error?.message}`)
  }

  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)

  return data.id as string
}

export async function listConversations(
  supabase: SupabaseClient,
  userId: string
): Promise<ConversationSummary[]> {
  const { data } = await supabase
    .from('conversations')
    .select('id, title, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50)

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string | null,
    updatedAt: row.updated_at as string,
  }))
}

export async function getConversationMessages(
  supabase: SupabaseClient,
  conversationId: string
): Promise<StoredMessage[]> {
  const { data } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  return (data ?? []).map((row) => ({
    id: row.id as string,
    role: row.role as 'user' | 'assistant',
    content: row.content as MessageContent,
    createdAt: row.created_at as string,
  }))
}
```

- [ ] **Passo 2: Criar `lib/audit/log.ts`**

```ts
import { createAdminClient } from '@/lib/supabase/admin'

export interface ToolCallRecord {
  name: string
  input: unknown
  output: unknown
  success: boolean
  error?: string
}

export async function logAudit(userId: string, action: string, metadata: Record<string, unknown> = {}) {
  const admin = createAdminClient()
  await admin.from('audit_logs').insert({ user_id: userId, action, metadata })
}

export async function logToolExecutions(messageId: string, toolCalls: ToolCallRecord[]) {
  if (toolCalls.length === 0) return

  const admin = createAdminClient()
  await admin.from('tool_executions').insert(
    toolCalls.map((call) => ({
      message_id: messageId,
      tool_name: call.name,
      input: call.input,
      output: call.output,
      success: call.success,
      error: call.error ?? null,
    }))
  )
}
```

- [ ] **Passo 3: Verificação manual — `tsc --noEmit`**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Passo 4: Commit**

```bash
git add lib/conversations lib/audit
git commit -m "feat: add conversation persistence and audit logging helpers"
```

---

### Tarefa 9: Camada de IA (Claude) e endpoint de chat

**Arquivos:**
- Criar: `lib/ai/provider.ts`
- Criar: `lib/ai/anthropic-provider.ts`
- Criar: `lib/ai/system-prompt.ts`
- Criar: `app/api/chat/route.ts`

**Interfaces:**
- Consome: `ToolDefinition`/`ToolContext` (Tarefa 7), `resolveRole`/`canUseTool` (Tarefa 4), `createConversation`/`appendMessage`/`getConversationMessages` (Tarefa 8), `logAudit`/`logToolExecutions` (Tarefa 8), `createClient` (`lib/supabase/server.ts`, existente).
- Produz: `POST /api/chat` — usado pelo hook `useChat` da Tarefa 10.

- [ ] **Passo 1: Criar `lib/ai/system-prompt.ts`**

```ts
import type { Role } from '@/lib/authorization/roles'

function greetingForNow(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function buildSystemPrompt(role: Role, firstName: string): string {
  const greeting = greetingForNow()
  const persona =
    role === 'client'
      ? 'Você é o assistente virtual da CRC Incorporações, conversando com um cliente sobre o apartamento dele.'
      : 'Você é o assistente virtual da CRC Incorporações, conversando com um corretor sobre unidades e vendas.'

  return [
    persona,
    `Trate o usuário como ${firstName}. Comece a primeira mensagem com "${greeting}, ${firstName}!" se fizer sentido no contexto.`,
    'Regra crítica: nunca invente valores, datas, documentos ou status. Toda informação específica do usuário deve vir de uma chamada de ferramenta.',
    'Se uma ferramenta não retornar a informação pedida, responda que não encontrou essa informação no sistema — nunca estime ou presuma.',
    'Tom: profissional, simples, direto, educado, humano. Nunca robótico ou técnico.',
    'Nunca mencione nomes de ferramentas, APIs, bancos de dados ou detalhes de implementação ao usuário.',
    'Ações que alterem algo (gerar proposta, por exemplo) devem ser oferecidas como um botão para o usuário confirmar, nunca executadas automaticamente por causa de uma frase ambígua.',
  ].join('\n')
}
```

- [ ] **Passo 2: Criar `lib/ai/provider.ts`**

```ts
import type { ToolContext, ToolDefinition } from './tools/registry'
import type { ToolCallRecord } from '@/lib/audit/log'

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface StreamChatParams {
  systemPrompt: string
  history: ChatTurn[]
  userMessage: string
  tools: ToolDefinition[]
  toolContext: ToolContext
}

export interface StreamChatResult {
  stream: ReadableStream<Uint8Array>
  done: Promise<{ finalText: string; toolCalls: ToolCallRecord[] }>
}

export interface AIProvider {
  streamChat(params: StreamChatParams): StreamChatResult
}
```

- [ ] **Passo 3: Criar `lib/ai/anthropic-provider.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { AIProvider, StreamChatParams, StreamChatResult } from './provider'
import type { ToolContext, ToolDefinition } from './tools/registry'
import type { ToolCallRecord } from '@/lib/audit/log'

const GENERIC_ERROR_TEXT = 'Não consegui responder agora. Tente novamente em alguns instantes.'

function toRunnerTool(
  tool: ToolDefinition,
  ctx: ToolContext,
  record: (call: ToolCallRecord) => void
) {
  return {
    ...betaZodTool({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      run: async (input: unknown) => {
        try {
          const output = await tool.handler(input, ctx)
          record({ name: tool.name, input, output, success: true })
          return JSON.stringify(output)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'erro desconhecido'
          record({ name: tool.name, input, output: null, success: false, error: message })
          return JSON.stringify({ type: 'notice', message: GENERIC_ERROR_TEXT })
        }
      },
    }),
    eager_input_streaming: true,
  }
}

export class AnthropicProvider implements AIProvider {
  private client = new Anthropic()

  streamChat({ systemPrompt, history, userMessage, tools, toolContext }: StreamChatParams): StreamChatResult {
    const toolCalls: ToolCallRecord[] = []
    const runnerTools = tools.map((tool) => toRunnerTool(tool, toolContext, (call) => toolCalls.push(call)))

    const messages: Anthropic.MessageParam[] = [
      ...history.map((turn) => ({ role: turn.role, content: turn.text })),
      { role: 'user' as const, content: userMessage },
    ]

    let finalText = ''
    let resolveDone!: (value: { finalText: string; toolCalls: ToolCallRecord[] }) => void
    const done = new Promise<{ finalText: string; toolCalls: ToolCallRecord[] }>((resolve) => {
      resolveDone = resolve
    })

    const client = this.client

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder()

        try {
          const runner = client.beta.messages.toolRunner({
            model: 'claude-opus-5',
            max_tokens: 4096,
            system: systemPrompt,
            tools: runnerTools,
            messages,
            stream: true,
          })

          for await (const messageStream of runner) {
            for await (const event of messageStream) {
              if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                finalText += event.delta.text
                controller.enqueue(encoder.encode(event.delta.text))
              }
            }
            await messageStream.finalMessage()
          }
        } catch {
          if (finalText.length === 0) {
            finalText = GENERIC_ERROR_TEXT
            controller.enqueue(encoder.encode(GENERIC_ERROR_TEXT))
          }
        } finally {
          controller.close()
          resolveDone({ finalText, toolCalls })
        }
      },
    })

    return { stream, done }
  }
}
```

- [ ] **Passo 4: Criar `app/api/chat/route.ts`**

```ts
import { createClient } from '@/lib/supabase/server'
import { resolveRole, roleHasChatAccess } from '@/lib/authorization/service'
import { getToolsForRole } from '@/lib/ai/tools'
import { buildSystemPrompt } from '@/lib/ai/system-prompt'
import { AnthropicProvider } from '@/lib/ai/anthropic-provider'
import {
  appendMessage,
  createConversation,
  getConversationMessages,
} from '@/lib/conversations/service'
import { logAudit, logToolExecutions } from '@/lib/audit/log'
import { messageContentToPlainText } from '@/lib/ai/message-content'

const provider = new AnthropicProvider()

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Não autenticado.', { status: 401 })
  }

  const role = await resolveRole(supabase, user.id)
  if (!roleHasChatAccess(role)) {
    return new Response('Seu acesso ao assistente ainda não foi liberado.', { status: 403 })
  }

  const body = (await request.json()) as { message?: string; conversationId?: string }
  const userMessage = body.message?.trim()

  if (!userMessage) {
    return new Response('Mensagem vazia.', { status: 400 })
  }

  const conversationId = body.conversationId ?? (await createConversation(supabase, user.id, role))

  const history = (await getConversationMessages(supabase, conversationId)).map((message) => ({
    role: message.role,
    text: messageContentToPlainText(message.content),
  }))

  await appendMessage(supabase, conversationId, 'user', { type: 'text', text: userMessage })

  const firstName = user.email?.split('@')[0] ?? 'usuário'
  const tools = getToolsForRole(role)

  const { stream, done } = provider.streamChat({
    systemPrompt: buildSystemPrompt(role, firstName),
    history,
    userMessage,
    tools,
    toolContext: { userId: user.id, role, supabase },
  })

  done
    .then(async ({ finalText, toolCalls }) => {
      const messageId = await appendMessage(supabase, conversationId, 'assistant', {
        type: 'text',
        text: finalText,
      })
      await logToolExecutions(messageId, toolCalls)
      await logAudit(user.id, 'chat_message', { conversationId, toolCalls: toolCalls.map((c) => c.name) })
    })
    .catch((error) => {
      console.error('Falha ao persistir mensagem/auditoria do chat', error)
    })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Conversation-Id': conversationId,
    },
  })
}
```

- [ ] **Passo 5: Verificação manual — `tsc --noEmit` e `eslint`**

```bash
npx tsc --noEmit
npx eslint .
```

Esperado: sem erros em nenhum dos dois.

- [ ] **Passo 6: Commit**

```bash
git add lib/ai/provider.ts lib/ai/anthropic-provider.ts lib/ai/system-prompt.ts app/api/chat
git commit -m "feat: add Claude AI provider and streaming chat API route"
```

---

### Tarefa 10: Componentes de chat (frontend)

**Arquivos:**
- Criar: `components/chat/chat-experience.tsx`
- Criar: `components/chat/chat-experience.module.css`
- Criar: `components/chat/chat-welcome.tsx`
- Criar: `components/chat/suggested-questions.tsx`
- Criar: `components/chat/chat-messages.tsx`
- Criar: `components/chat/chat-message.tsx`
- Criar: `components/chat/chat-message.module.css`
- Criar: `components/chat/chat-input.tsx`
- Criar: `components/chat/chat-input.module.css`
- Criar: `components/chat/conversation-sidebar.tsx`
- Criar: `components/chat/conversation-sidebar.module.css`
- Criar: `components/chat/use-chat.ts`

**Interfaces:**
- Consome: `MessageContent` (Tarefa 6), `Role` (Tarefa 4), `ConversationSummary`/`StoredMessage` (Tarefa 8), `POST /api/chat` (Tarefa 9), tokens de marca de `app/globals.css` (existente).
- Produz: `<ChatExperience role={role} firstName={firstName} conversations={conversations} initialConversationId={id} initialMessages={messages} />` — usado pela Tarefa 11 em `/portal` e `/dashboard`.

- [ ] **Passo 1: Criar `components/chat/use-chat.ts`**

```ts
'use client'

import { useCallback, useRef, useState } from 'react'
import type { MessageContent } from '@/lib/ai/message-content'

export interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: MessageContent
}

export function useChat(initial?: { conversationId?: string; messages?: ChatMessageItem[] }) {
  const [messages, setMessages] = useState<ChatMessageItem[]>(initial?.messages ?? [])
  const [isStreaming, setIsStreaming] = useState(false)
  const conversationIdRef = useRef<string | undefined>(initial?.conversationId)

  const sendMessage = useCallback(async (text: string) => {
    const userId = crypto.randomUUID()
    setMessages((prev) => [...prev, { id: userId, role: 'user', content: { type: 'text', text } }])

    const assistantId = crypto.randomUUID()
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: { type: 'text', text: '' } }])
    setIsStreaming(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId: conversationIdRef.current }),
      })

      const conversationId = response.headers.get('X-Conversation-Id')
      if (conversationId) conversationIdRef.current = conversationId

      if (!response.ok || !response.body) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? { ...message, content: { type: 'notice', text: 'Não consegui responder agora. Tente novamente em alguns instantes.' } as MessageContent }
              : message
          )
        )
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, content: { type: 'text', text: accumulated } } : message
          )
        )
      }
    } finally {
      setIsStreaming(false)
    }
  }, [])

  return { messages, isStreaming, sendMessage, conversationId: conversationIdRef.current }
}
```

- [ ] **Passo 2: Criar `components/chat/chat-input.module.css`**

```css
.form {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.textarea {
  flex: 1;
  resize: none;
  padding: 14px 16px;
  font-size: 16px;
  font-family: inherit;
  color: var(--brand-ink);
  background: #fff;
  border: 1px solid var(--brand-line);
  border-radius: 0;
  min-height: 52px;
  max-height: 160px;
}

.textarea:focus {
  outline: 2px solid var(--brand-yellow);
  outline-offset: -2px;
  border-color: var(--brand-ink);
}

.button {
  padding: 14px 22px;
  font-size: 16px;
  font-weight: 700;
  font-family: inherit;
  color: var(--brand-yellow);
  background: var(--brand-ink);
  border: none;
  cursor: pointer;
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Passo 3: Criar `components/chat/chat-input.tsx`**

```tsx
'use client'

import { useState, type FormEvent, type KeyboardEvent } from 'react'
import styles from './chat-input.module.css'

export function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void
  disabled: boolean
}) {
  const [value, setValue] = useState('')

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    submit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <textarea
        className={styles.textarea}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="O que você deseja saber?"
        rows={1}
        disabled={disabled}
      />
      <button type="submit" className={styles.button} disabled={disabled || value.trim().length === 0}>
        Enviar
      </button>
    </form>
  )
}
```

- [ ] **Passo 4: Criar `components/chat/suggested-questions.tsx`**

```tsx
export function SuggestedQuestions({
  questions,
  onSelect,
}: {
  questions: string[]
  onSelect: (question: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {questions.map((question) => (
        <button
          key={question}
          type="button"
          onClick={() => onSelect(question)}
          style={{
            padding: '8px 14px',
            fontSize: 14,
            fontFamily: 'inherit',
            color: 'var(--brand-ink)',
            background: '#fff',
            border: '1px solid var(--brand-line)',
            cursor: 'pointer',
          }}
        >
          {question}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Passo 5: Criar `components/chat/chat-welcome.tsx`**

```tsx
import { SuggestedQuestions } from './suggested-questions'

const CLIENT_SUGGESTIONS = [
  'Segunda via de boleto',
  'Minhas parcelas',
  'Previsão de entrega',
  'Meus documentos',
]

const CORRETOR_SUGGESTIONS = [
  'Unidades disponíveis',
  'Tabela de preços atual',
  'Diferenciais do empreendimento',
]

function greetingForNow(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function ChatWelcome({
  firstName,
  role,
  onSelectSuggestion,
}: {
  firstName: string
  role: 'client' | 'corretor'
  onSelectSuggestion: (question: string) => void
}) {
  const question = role === 'client' ? 'O que você deseja saber?' : 'Como posso ajudar na sua venda?'
  const suggestions = role === 'client' ? CLIENT_SUGGESTIONS : CORRETOR_SUGGESTIONS

  return (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-display), sans-serif', fontWeight: 800, fontSize: 32, margin: 0, color: 'var(--brand-ink)' }}>
        {greetingForNow()}, {firstName}.
        <br />
        {question}
      </h1>
      <SuggestedQuestions questions={suggestions} onSelect={onSelectSuggestion} />
    </div>
  )
}
```

- [ ] **Passo 6: Criar `components/chat/chat-message.module.css`**

```css
.row {
  display: flex;
  margin-bottom: 16px;
}

.rowUser {
  justify-content: flex-end;
}

.rowAssistant {
  justify-content: flex-start;
}

.bubble {
  max-width: 70%;
  padding: 12px 16px;
  font-size: 15px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.bubbleUser {
  background: var(--brand-ink);
  color: var(--brand-yellow);
}

.bubbleAssistant {
  background: #fff;
  color: var(--brand-ink);
  border: 1px solid var(--brand-line);
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.actionButton {
  padding: 8px 14px;
  font-size: 14px;
  font-family: inherit;
  color: var(--brand-ink);
  background: var(--brand-yellow);
  border: none;
  cursor: pointer;
}

.table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
  font-size: 14px;
}

.table th,
.table td {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid var(--brand-line);
}
```

- [ ] **Passo 7: Criar `components/chat/chat-message.tsx`**

```tsx
import type { MessageContent } from '@/lib/ai/message-content'
import styles from './chat-message.module.css'

function MessageBody({ content }: { content: MessageContent }) {
  switch (content.type) {
    case 'text':
      return <>{content.text}</>
    case 'notice':
      return <>{content.message}</>
    case 'financial_installment':
      return (
        <div>
          <p>{content.message}</p>
          {content.actions?.map((action) => (
            <div key={action.label} className={styles.actions}>
              <button type="button" className={styles.actionButton}>
                {action.label}
              </button>
            </div>
          ))}
        </div>
      )
    case 'unit_list':
      return (
        <div>
          <p>{content.message}</p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Unidade</th>
                <th>Andar</th>
                <th>Área</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {content.units.map((unit) => (
                <tr key={unit.code}>
                  <td>{unit.code}</td>
                  <td>{unit.floor}º</td>
                  <td>{unit.areaM2} m²</td>
                  <td>R$ {unit.price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'document':
      return (
        <div>
          <p>{content.message}</p>
          <a href={content.documentUrl} target="_blank" rel="noreferrer" className={styles.actionButton}>
            {content.label}
          </a>
        </div>
      )
  }
}

export function ChatMessage({ role, content }: { role: 'user' | 'assistant'; content: MessageContent }) {
  return (
    <div className={`${styles.row} ${role === 'user' ? styles.rowUser : styles.rowAssistant}`}>
      <div className={`${styles.bubble} ${role === 'user' ? styles.bubbleUser : styles.bubbleAssistant}`}>
        <MessageBody content={content} />
      </div>
    </div>
  )
}
```

- [ ] **Passo 8: Criar `components/chat/chat-messages.tsx`**

```tsx
import type { ChatMessageItem } from './use-chat'
import { ChatMessage } from './chat-message'

export function ChatMessages({ messages }: { messages: ChatMessageItem[] }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
      {messages.map((message) => (
        <ChatMessage key={message.id} role={message.role} content={message.content} />
      ))}
    </div>
  )
}
```

- [ ] **Passo 9: Criar `components/chat/conversation-sidebar.module.css`**

```css
.sidebar {
  width: 260px;
  border-right: 1px solid var(--brand-line);
  padding: 16px;
  overflow-y: auto;
  background: var(--brand-paper);
}

.item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  margin-bottom: 4px;
  font-size: 14px;
  font-family: inherit;
  color: var(--brand-ink);
  background: transparent;
  border: none;
  cursor: pointer;
}

.item:hover {
  background: #fff;
}

.item[data-active='true'] {
  background: #fff;
  font-weight: 700;
}

@media (max-width: 899px) {
  .sidebar {
    display: none;
  }
}
```

- [ ] **Passo 10: Criar `components/chat/conversation-sidebar.tsx`**

Recebe a lista já carregada pelo Server Component da página (Tarefa 11) — sem fetch próprio, mesmo padrão do resto do projeto (dados vêm de Server Components, não de um endpoint dedicado).

```tsx
'use client'

import type { ConversationSummary } from '@/lib/conversations/service'
import styles from './conversation-sidebar.module.css'

export function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelect,
}: {
  conversations: ConversationSummary[]
  activeConversationId?: string
  onSelect: (conversationId: string) => void
}) {
  return (
    <aside className={styles.sidebar}>
      {conversations.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--brand-ink-soft)' }}>Nenhuma conversa ainda.</p>
      ) : (
        conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            className={styles.item}
            data-active={conversation.id === activeConversationId}
            onClick={() => onSelect(conversation.id)}
          >
            {conversation.title ?? 'Conversa sem título'}
          </button>
        ))
      )}
    </aside>
  )
}
```

- [ ] **Passo 11: Criar `components/chat/chat-experience.module.css`**

```css
.page {
  display: flex;
  min-height: 100vh;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--brand-paper);
}

.welcomeWrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.inputWrap {
  padding: 16px;
  border-top: 1px solid var(--brand-line);
  background: var(--brand-paper);
}

.welcomeInputWrap {
  width: 100%;
  max-width: 640px;
  margin-top: 24px;
}
```

- [ ] **Passo 12: Criar `components/chat/chat-experience.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useChat, type ChatMessageItem } from './use-chat'
import { ChatWelcome } from './chat-welcome'
import { ChatMessages } from './chat-messages'
import { ChatInput } from './chat-input'
import { ConversationSidebar } from './conversation-sidebar'
import type { ConversationSummary } from '@/lib/conversations/service'
import styles from './chat-experience.module.css'

export function ChatExperience({
  role,
  firstName,
  conversations,
  initialConversationId,
  initialMessages,
}: {
  role: 'client' | 'corretor'
  firstName: string
  conversations: ConversationSummary[]
  initialConversationId?: string
  initialMessages: ChatMessageItem[]
}) {
  const router = useRouter()
  const { messages, isStreaming, sendMessage } = useChat({
    conversationId: initialConversationId,
    messages: initialMessages,
  })

  const handleSelectConversation = (conversationId: string) => {
    router.push(`?conversation=${conversationId}`)
  }

  return (
    <div className={styles.page}>
      <ConversationSidebar
        conversations={conversations}
        activeConversationId={initialConversationId}
        onSelect={handleSelectConversation}
      />
      <div className={styles.main}>
        {messages.length > 0 ? (
          <>
            <ChatMessages messages={messages} />
            <div className={styles.inputWrap}>
              <ChatInput onSend={sendMessage} disabled={isStreaming} />
            </div>
          </>
        ) : (
          <div className={styles.welcomeWrap}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <ChatWelcome firstName={firstName} role={role} onSelectSuggestion={sendMessage} />
              <div className={styles.welcomeInputWrap}>
                <ChatInput onSend={sendMessage} disabled={isStreaming} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Passo 13: Verificação manual — `tsc --noEmit` e `eslint`**

```bash
npx tsc --noEmit
npx eslint .
```

Esperado: sem erros.

- [ ] **Passo 14: Commit**

```bash
git add components/chat
git commit -m "feat: add chat UI components (welcome, messages, input, sidebar)"
```

---

### Tarefa 11: Integração nas páginas `/dashboard` e `/portal`

**Arquivos:**
- Modificar: `app/portal/page.tsx`
- Modificar: `app/dashboard/page.tsx`

**Interfaces:**
- Consome: `resolveRole`/`roleHasChatAccess` (Tarefa 4), `listConversations`/`getConversationMessages` (Tarefa 8), `<ChatExperience>` (Tarefa 10), `AppShell` (existente).
- Produz: nada (ponto final de integração).

- [ ] **Passo 1: Reescrever `app/portal/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasProfile } from '@/lib/supabase/profile'
import { AppShell } from '@/components/app-shell'
import { ChatExperience } from '@/components/chat/chat-experience'
import { listConversations, getConversationMessages } from '@/lib/conversations/service'

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>
}) {
  const { conversation: conversationId } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  if (!(await hasProfile(supabase, user.id))) {
    redirect('/dashboard')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  const firstName = (profile?.name as string | undefined)?.split(' ')[0] ?? 'cliente'
  const conversations = await listConversations(supabase, user.id)
  const initialMessages = conversationId
    ? (await getConversationMessages(supabase, conversationId)).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
      }))
    : []

  return (
    <AppShell heading="">
      <ChatExperience
        role="client"
        firstName={firstName}
        conversations={conversations}
        initialConversationId={conversationId}
        initialMessages={initialMessages}
      />
    </AppShell>
  )
}
```

- [ ] **Passo 2: Reescrever `app/dashboard/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasProfile } from '@/lib/supabase/profile'
import { resolveRole, roleHasChatAccess } from '@/lib/authorization/service'
import { AppShell } from '@/components/app-shell'
import { ChatExperience } from '@/components/chat/chat-experience'
import { listConversations, getConversationMessages } from '@/lib/conversations/service'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>
}) {
  const { conversation: conversationId } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  if (await hasProfile(supabase, user.id)) {
    redirect('/portal')
  }

  const role = await resolveRole(supabase, user.id)

  if (!roleHasChatAccess(role)) {
    return (
      <AppShell heading="Acesso ainda não liberado">
        <p>Sua conta ainda não tem um papel atribuído no sistema. Contate o administrador.</p>
      </AppShell>
    )
  }

  const firstName = user.email?.split('@')[0] ?? 'usuário'
  const conversations = await listConversations(supabase, user.id)
  const initialMessages = conversationId
    ? (await getConversationMessages(supabase, conversationId)).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
      }))
    : []

  return (
    <AppShell heading="">
      <ChatExperience
        role={role === 'corretor' ? 'corretor' : 'client'}
        firstName={firstName}
        conversations={conversations}
        initialConversationId={conversationId}
        initialMessages={initialMessages}
      />
    </AppShell>
  )
}
```

> Nota: `ChatExperience` aceita hoje só `'client' | 'corretor'` (papéis com ferramentas nesta etapa). Um papel diferente com `roleHasChatAccess` true no futuro (quando ganhar ferramentas) precisará estender essa união — deixado assim de propósito, para não modelar UI de papéis que ainda não existem (item 37 do briefing).

`AppShell` aceita `children?: React.ReactNode` e usa `heading` num `<h1>`; passar `heading=""` está correto porque a `ChatExperience` traz seu próprio título dentro da tela de boas-vindas — verifique em `components/app-shell.tsx` se `heading` vazio não quebra o layout (deve renderizar um `<h1>` vazio, inofensivo); se preferir, ajuste `AppShell` para aceitar `heading?: string` e omitir o `<h1>` quando ausente.

- [ ] **Passo 3: Ajustar `components/app-shell.tsx` para heading opcional**

Abrir `components/app-shell.tsx` e trocar a assinatura e o render do heading:

```tsx
export function AppShell({
  heading,
  children,
}: {
  heading?: string
  children?: React.ReactNode
}) {
```

E no JSX, trocar `<h1 className={styles.heading}>{heading}</h1>` por:

```tsx
{heading ? <h1 className={styles.heading}>{heading}</h1> : null}
```

- [ ] **Passo 4: Verificação manual — `tsc --noEmit`, `eslint`, `npm run build`**

```bash
npx tsc --noEmit
npx eslint .
npm run build
```

Esperado: os três limpos.

- [ ] **Passo 5: Verificação manual — fluxo completo no navegador**

Rodar `npm run dev` e, em ordem:
1. Atribuir papel de corretor a uma conta de equipe: `npx tsx --env-file=.env.local scripts/assign-role.ts <email-equipe> corretor`.
2. Login como cliente (conta com `profiles`) → `/portal` → deve aparecer a tela de boas-vindas com saudação + primeiro nome + sugestões de cliente.
3. Perguntar "Tenho alguma parcela atrasada?" → deve mudar pro layout de chat e responder citando a parcela mockada (vencimento 2026-09-10, R$ 1.250,00) com botão "Gerar segunda via".
4. Login como o corretor recém-atribuído → `/dashboard` → tela de boas-vindas com sugestões de corretor.
5. Perguntar "Quais apartamentos de 3 quartos estão disponíveis?" → deve listar A-304 e A-704 (não A-504, que está mockada como vendida) numa tabela.
6. Login como uma conta de equipe SEM papel atribuído → `/dashboard` → deve mostrar "Acesso ainda não liberado", sem chat.
7. Abrir o DevTools → Network durante uma pergunta → confirmar que a resposta de `/api/chat` chega em chunks (streaming), não de uma vez.
8. Testar no celular (ou DevTools em modo responsivo, ~390px) → layout não deve quebrar; a barra lateral de conversas deve sumir.

Esperado: todos os passos se comportam como descrito, sem erro no console do navegador ou do terminal.

- [ ] **Passo 6: Commit**

```bash
git add app/portal/page.tsx app/dashboard/page.tsx components/app-shell.tsx
git commit -m "feat: replace static dashboard/portal pages with the conversational chat experience"
```

---

### Tarefa 12: Documentação e verificação final

**Arquivos:**
- Modificar: `README.md`
- Modificar: `.env.example`

**Interfaces:**
- Consome: nada — tarefa final de documentação e verificação.
- Produz: nada.

- [ ] **Passo 1: Atualizar `.env.example`**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ANTHROPIC_API_KEY=
SIENGE_API_URL=
SIENGE_API_TOKEN=
```

- [ ] **Passo 2: Atualizar `README.md`**

Na seção "Rotas", observar que `/dashboard` e `/portal` agora são a experiência de chat (ajustar a descrição existente delas). Adicionar uma nova seção após "Dois tipos de conta":

```markdown
## Assistente conversacional (Etapa 2)

`/portal` (cliente) e `/dashboard` (equipe com papel atribuído) mostram um
assistente de IA (Claude) em vez de uma tela estática. O assistente consulta
dados através de um "tool registry" — nunca acessa banco de dados ou APIs
externas diretamente.

### Configuração

- `ANTHROPIC_API_KEY`: chave da API da Anthropic (console.anthropic.com).
- `SIENGE_API_URL` / `SIENGE_API_TOKEN`: deixe em branco por enquanto — sem
  eles, o sistema usa dados fictícios (`lib/sienge/mock-service.ts`),
  claramente isolados e fáceis de desativar quando a integração real
  existir (basta preencher essas duas variáveis e implementar
  `RealSiengeService` seguindo a interface em `lib/sienge/service.ts`).

### Papéis de equipe

Contas de equipe não têm nenhuma ferramenta liberada até receberem um papel:

```bash
npx tsx --env-file=.env.local scripts/assign-role.ts email@exemplo.com corretor
```

Papéis válidos: `corretor`, `gerente_comercial`, `administrador`,
`financeiro`, `pos_venda`, `diretor`, `engenharia`. Só `corretor` tem
ferramentas nesta etapa — os demais ficam com a tela de "acesso ainda não
liberado" até uma etapa futura.

### Testes automatizados

`npm run test` roda os testes unitários (`vitest`) de `lib/authorization`,
`lib/sienge`, `lib/ai/message-content` e `lib/ai/tools` — as camadas que
controlam acesso e dados financeiros. UI e integração continuam sendo
verificadas manualmente, como no restante do projeto.
```

- [ ] **Passo 3: Verificação manual final completa**

Repetir o checklist do Passo 5 da Tarefa 11 do zero, com o app buildado (`npm run build && npm start` em vez de `npm run dev`), e adicionar:

9. Perguntar algo fora do escopo das ferramentas (ex: cliente perguntando "quais unidades estão disponíveis?") → o assistente deve dizer que não encontrou essa informação, nunca inventar uma lista de unidades.
10. Derrubar a internet momentaneamente (ou remover `ANTHROPIC_API_KEY` temporariamente) e perguntar algo → deve aparecer a mensagem genérica de erro, nunca um stack trace ou erro técnico bruto.
11. Confirmar isolamento entre usuários: logar como cliente A, fazer uma pergunta, sair, logar como cliente B, confirmar que a conversa de A não aparece pra B (checar diretamente na tabela `conversations` no Supabase, filtrando por `user_id`, se necessário).

Esperado: todos os passos passam. Corrigir qualquer falha antes de considerar a etapa concluída.

- [ ] **Passo 4: Commit**

```bash
git add README.md .env.example
git commit -m "docs: document conversational assistant setup, roles and manual test checklist"
```
