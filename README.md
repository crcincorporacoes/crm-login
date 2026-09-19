# CRM Login

Sistema de login (email/senha) protegendo o acesso a um dashboard de CRM.
Next.js 16 + TypeScript + Supabase Auth.

## Configuração

1. `npm install`
2. Crie um projeto no [Supabase](https://supabase.com) (gratuito).
3. Copie `.env.example` para `.env.local` e preencha com as chaves do seu
   projeto Supabase (Project Settings → API). A variável `NEXT_PUBLIC_SITE_URL`
   é usada para montar a URL de redirecionamento do link de redefinição de
   senha enviado por email — em desenvolvimento, deixe como
   `http://localhost:3000`.
4. No painel do Supabase, vá em Authentication → URL Configuration →
   Redirect URLs e adicione `http://localhost:3000/**` (e, depois do deploy,
   a URL de produção equivalente). Sem isso, o link de redefinição de senha
   por email não funciona corretamente.
5. `npm run dev` e acesse `http://localhost:3000`.

## Criando usuários

Não há autocadastro. Crie contas de duas formas:

- Painel do Supabase → Authentication → Users → Add user.
- Linha de comando:
  ```bash
  npx tsx --env-file=.env.local scripts/create-user.ts email@exemplo.com senha123
  ```

## Rotas

- `/login` — login
- `/forgot-password` — solicitar redefinição de senha
- `/reset-password` — definir nova senha (via link do email)
- `/dashboard` — assistente conversacional (equipe com papel atribuído; redireciona para `/login` sem sessão)
- `/signup` — cadastro de cliente/lead (nome, CPF, data de nascimento, telefone, email, senha)
- `/portal` — assistente conversacional (cliente; redireciona para `/login` sem sessão, ou para `/dashboard` se a conta for de equipe)

## Segurança de dados (RLS)

Além de `auth.users` (gerenciada internamente pelo Supabase), este projeto
cria seis tabelas customizadas: `profiles`, `team_members`, `conversations`,
`messages`, `tool_executions` e `audit_logs` — todas com Row Level Security
ativa (ver `supabase/migrations/`). Ao adicionar novas tabelas do CRM em uma
feature futura, ative RLS nelas também antes de expor dados.

## Dois tipos de conta

- **Equipe**: criada manualmente (painel do Supabase ou script CLI), acessa `/dashboard`.
- **Cliente/lead**: se autocadastra em `/signup`, acessa `/portal`.

A distinção é implícita: contas de cliente têm uma linha na tabela `profiles`
(criada durante o cadastro); contas de equipe não têm. `team_members.role` é
a primeira coluna de papel explícito do projeto, mas é escopada só a contas
de equipe (ver seção "Papéis de equipe" abaixo) — `profiles` continua sem
coluna de papel, de propósito, já que hoje só existe um tipo de cliente.

## Assistente conversacional (Etapa 2)

`/portal` (cliente) e `/dashboard` (equipe com papel atribuído) mostram um
assistente de IA (Claude) em vez de uma tela estática. O assistente consulta
dados através de um "tool registry" — nunca acessa banco de dados ou APIs
externas diretamente.

### Configuração

- Antes de tudo, rode as migrações em `supabase/migrations/` (`0001` a
  `0005`, nessa ordem — há dependência entre elas). No painel do Supabase:
  **SQL Editor** → **New query** → colar o conteúdo de `0001_create_profiles.sql`
  → **Run** → repetir para `0002`, `0003`, `0004` e `0005`.
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
