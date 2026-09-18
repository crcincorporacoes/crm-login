# CRM Conversacional — Etapa 2 — Spec de Design

> **Para executores automatizados:** este documento é a especificação validada. A implementação segue via `superpowers:writing-plans` a partir daqui — não pular direto para código sem o plano.

## Objetivo

Transformar as áreas logadas do CRM (`/portal` para clientes, `/dashboard` para equipe) numa experiência conversacional: em vez de navegar por menus, o usuário pergunta o que quer e o assistente entende a intenção, consulta a fonte de dados correta (inicialmente o Sienge, hoje mockado) e responde — com ações contextuais quando aplicável.

**Princípio norteador:** o usuário não deve aprender a usar o CRM; o CRM deve entender o usuário.

## Escopo desta entrega

Implementa exatamente os itens A–J do briefing do usuário (ver histórico da conversa): tela conversacional para CLIENTE e CORRETOR, chat completo (histórico, input, loading, sugestões, responsivo), separação por perfil, backend de chat com streaming, tool registry, camada Sienge mockada, persistência de conversas, auditoria básica, isolamento entre usuários, e estrutura para rich messages.

**Fora de escopo nesta entrega** (arquitetura deve permitir depois, não implementar agora): geração definitiva de contrato, assinatura eletrônica, reserva definitiva de unidade, alteração financeira, integração de pagamento, biblioteca completa de imagens, RAG completo, simulador financeiro complexo.

## Estado atual do projeto (análise)

- **Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript. Sem framework de UI — CSS Modules com tokens de marca (`--brand-yellow #FCBD00`, `--brand-ink #1C1500`, `--brand-paper #FAF7F0`, fonte de destaque Big Shoulders) definidos em `app/globals.css`.
- **Auth:** Supabase Auth (`@supabase/ssr`), sessão via cookie. `middleware.ts` → `lib/supabase/middleware.ts` protege `/dashboard` e `/portal`, decidindo entre as duas por `hasProfile()`.
- **Dados:** Supabase Postgres. Única tabela própria: `profiles` (RLS ativa, `id` = `auth.users.id`) — presença de linha é o único sinal de "é cliente". Contas de equipe hoje não têm nenhum papel — são todas equivalentes.
- **Rotas existentes:** `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/dashboard`, `/portal`, `/auth/callback`. Nenhuma rota `/api`.
- **Componentes:** `AuthShell`/`auth-form` (telas de autenticação, split-screen) e `AppShell` (cabeçalho enxuto das telas logadas, usado por `/dashboard` e `/portal`).
- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`. Nada de IA ainda.

**Lacuna identificada:** não existe conceito de papel (role) para contas de equipe — é preciso introduzir isso sem quebrar a distinção binária cliente/equipe já usada pelo middleware.

## Arquitetura

### Visão geral do fluxo

```
Usuário → ChatInput (UI)
        → POST /api/chat (streaming)
        → resolve identidade + papel no servidor (nunca confia no cliente)
        → AuthorizationService: quais tools esse papel pode usar
        → AIProvider (Claude, tool calling) decide qual tool chamar
        → Tool chama SiengeService (mock) ou KnowledgeBaseService (mock)
        → resposta é interpretada e formatada (nunca inventada)
        → persiste mensagem + auditoria
        → stream de volta para o cliente
```

### Modelo de dados (novas tabelas, todas com RLS)

- **`team_members`**: `id uuid PK references auth.users(id)`, `role text not null check (role in ('corretor','gerente_comercial','administrador','financeiro','pos_venda','diretor','engenharia'))`, `created_at`. RLS: usuário só lê a própria linha; escrita só via service role (atribuição de papel manual, sem painel admin ainda).
- **`conversations`**: `id uuid PK`, `user_id uuid references auth.users(id)`, `role_at_time text`, `title text`, `created_at`, `updated_at`. RLS: só o dono lê/escreve.
- **`messages`**: `id uuid PK`, `conversation_id uuid references conversations(id) on delete cascade`, `role text check (role in ('user','assistant'))`, `content jsonb not null`, `created_at`. RLS via dono da conversa (subquery).
- **`tool_executions`**: `id uuid PK`, `message_id uuid references messages(id) on delete cascade`, `tool_name text`, `input jsonb`, `output jsonb`, `success boolean`, `error text`, `created_at`. RLS via dono da conversa/mensagem.
- **`audit_logs`**: `id uuid PK`, `user_id uuid references auth.users(id)`, `action text`, `metadata jsonb`, `created_at`. RLS: usuário só lê a própria linha; toda escrita via service role (server-side apenas).
- **Alteração em `profiles`**: nova coluna `sienge_customer_id text` (nullable) — elo entre o usuário autenticado e o cliente no Sienge, preenchido quando a integração real existir. Nunca vem do frontend.

Nenhuma tabela dinâmica de permissões: papéis e as ferramentas que cada um pode usar ficam num arquivo de configuração tipado (`lib/authorization/roles.ts`), não no banco — evita construir um painel admin (item 34) que não faz parte desta entrega, e pode migrar para o banco depois sem mudar a interface pública do `AuthorizationService`.

### Autorização

```
lib/authorization/
  roles.ts         # enum Role, ROLE_TOOL_ACCESS: Record<Role, ToolName[]>
  service.ts        # AuthorizationService: resolveRole(userId) -> Role | 'client' | null
                     #   canUseTool(role, toolName) -> boolean
```

- Cliente autenticado (linha em `profiles`) → papel `client`.
- Equipe com linha em `team_members` → o `role` dessa linha.
- Equipe sem linha em `team_members` → `null` (sem acesso ao chat — fail closed; a tela mostra aviso "acesso ainda não liberado", sem ferramentas nem IA).

### Identificação do cliente (regra crítica)

O `userId` sempre vem da sessão do Supabase no servidor (`supabase.auth.getUser()`), nunca de um parâmetro enviado pelo cliente. Toda tool que precisa de `sienge_customer_id` busca esse valor no banco a partir do `userId` da sessão — nunca aceita um id de cliente vindo do body da requisição.

### Camada de IA

```
lib/ai/
  provider.ts        # interface AIProvider { streamChat(...): ReadableStream }
  anthropic-provider.ts  # implementação com @anthropic-ai/sdk (Claude Opus, tool runner, streaming)
```

- Modelo: `claude-opus-5` via SDK oficial da Anthropic (`@anthropic-ai/sdk`), usando `client.beta.messages.toolRunner` com `stream: true`.
- A IA nunca acessa banco ou Sienge diretamente — só escolhe e recebe o resultado de tools.
- Prompt de sistema instrui explicitamente: nunca inventar valores, datas, documentos ou status; se a ferramenta não retornar a informação, dizer "não encontrei essa informação no sistema".
- Chave de API em `ANTHROPIC_API_KEY` (nova env var) — usuário ainda vai gerar essa chave.

### Tool Registry

```
lib/ai/tools/
  registry.ts        # ToolDefinition<TInput> { name, description, allowedRoles, inputSchema (zod), handler(input, ctx) }
  index.ts            # getToolsForRole(role): ToolDefinition[]
  financial.ts         # get_overdue_installments, get_next_installment, get_customer_installments, get_payment_slip
  project.ts            # get_project_information, get_delivery_forecast, get_customer_documents
  broker.ts              # get_available_units, get_price_table, get_unit_information, get_project_features
```

Cada handler recebe `ctx: { userId, role, supabase }` — nunca um id vindo do input da IA. Toda chamada de tool é registrada em `tool_executions` (item 13).

### Camada Sienge (mock)

```
lib/sienge/
  types.ts            # tipos de domínio (Customer, Contract, Installment, Unit, Project, Document...)
  service.ts           # interface SiengeService (métodos do briefing: getCustomer, getCustomerContracts, ...)
  mock-service.ts       # implementação com os dados fictícios do item 38, claramente marcada como mock
  config.ts              # getSiengeService(): real se SIENGE_API_URL/SIENGE_API_TOKEN existirem, senão mock
```

Nenhuma chamada HTTP ao Sienge é feita fora dessa pasta. Sem documentação real da API ainda, `RealSiengeService` não é implementada nesta etapa — só a interface e o mock.

`MockSiengeService` ignora `sienge_customer_id` (ainda não populado para ninguém) e devolve sempre o mesmo cenário fictício do item 38 do briefing (Felipe / Residencial Exemplo / Torre A-504), usando o nome real do `profiles.name` do usuário logado só para personalizar a saudação — o resto dos dados é fixo. Isso é suficiente para validar o fluxo ponta a ponta sem simular múltiplos clientes diferentes.

### Base de conhecimento (institucional)

```
lib/knowledge-base/
  service.ts           # interface simples: getProjectFeatures(projectId)
  mock-service.ts        # dados estáticos do "Residencial Exemplo" (diferenciais, memorial)
```

### Backend do chat

`app/api/chat/route.ts` (novo, único endpoint):
1. Autentica via `lib/supabase/server.ts` (padrão já existente).
2. Resolve papel via `AuthorizationService`. Sem papel → erro amigável, não chama IA.
3. Carrega ou cria a conversa (`conversations`/`messages`).
4. Monta a lista de tools permitidas pro papel.
5. Chama `AIProvider.streamChat` com histórico + tools; faz streaming da resposta como `Response` do Next.js (Route Handler).
6. Persiste mensagem do assistente, execuções de tool e auditoria conforme a resposta é processada.
7. Erros de provedor/tool nunca vazam texto técnico ao cliente (item 14) — sempre mensagem genérica amigável; detalhes vão para o log do servidor.

### Mensagens ricas

`content` de `messages` é um JSON tipado:

```ts
type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'financial_installment'; message: string; data: {...}; actions?: Action[] }
  | { type: 'unit_list'; message: string; units: Unit[]; actions?: Action[] }
  | { type: 'document'; message: string; documentUrl: string; label: string }
  | { type: 'notice'; message: string } // erro amigável, aviso
```

Renderização no frontend via componente por `type` (`FinancialMessage`, `UnitListMessage`, `DocumentMessage`, etc.) — evita um componente gigante de chat.

### Frontend

- `/portal` e `/dashboard` deixam de ser páginas estáticas de boas-vindas e passam a renderizar o mesmo `<ChatExperience role={role} greetingName={name} />`, cada um recebendo o papel resolvido no servidor.
- Tela inicial (sem mensagens ainda): saudação dinâmica por horário (bom dia/boa tarde/boa noite) + primeiro nome do usuário, campo de pergunta, sugestões discretas por papel.
- Após a primeira mensagem: layout de chat tradicional (histórico + mensagens + input fixo).
- Barra lateral discreta de conversas anteriores (recolhida no celular).
- Identidade visual: mantém a paleta e tipografia já construídas (amarelo/tinta/papel, Big Shoulders), com layout minimalista inspirado no ChatGPT — não uma paleta neutra genérica.
- Componentização: `ChatExperience`, `ChatWelcome`, `ChatMessages`, `ChatMessage` (+ variantes por tipo), `ChatInput`, `SuggestedQuestions`, `ConversationSidebar`, `LoadingMessage`.

### Segurança e LGPD

- Toda autorização e resolução de identidade acontece no servidor; o cliente nunca envia `userId`, `customer_id` ou papel.
- Ações sensíveis (segunda via, proposta) exigem confirmação explícita do usuário antes de executar.
- Rate limiting básico no endpoint de chat (por usuário).
- Logs de auditoria nunca guardam senhas, tokens ou o conteúdo bruto de documentos sigilosos — só metadados da ação.
- Contexto enviado à IA é filtrado no servidor antes de montar o prompt — só o necessário para responder aquela pergunta, nunca o registro completo do cliente.

## Contas de teste / atribuição de papel

Sem painel admin, um novo script `scripts/assign-role.ts` (mesmo padrão de `scripts/create-user.ts`) atribui um papel a uma conta de equipe existente, para viabilizar testes do CORRETOR nesta entrega.

## Autorregistro de erros

- API do Sienge indisponível, timeout, cliente sem contrato, documento inexistente, sem permissão, sessão expirada, resposta inválida → todos tratados com mensagem amigável fixa por categoria, nunca o erro técnico bruto.

## Fora de escopo — não ambíguo

Reafirmando a lista do item 37 do briefing: nenhuma automação jurídica, assinatura eletrônica, reserva definitiva, alteração financeira, pagamento, biblioteca completa de mídia ou RAG completo nesta entrega. A arquitetura (tool registry, mensagens ricas com `actions`, `SiengeService` desacoplado) não impede nada disso no futuro.
