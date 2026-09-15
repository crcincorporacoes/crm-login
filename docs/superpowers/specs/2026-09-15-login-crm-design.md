# Sistema de Login para Dashboard de CRM — Design

**Data:** 2026-09-15
**Status:** Aprovado, aguardando implementação

## Objetivo

Construir, do zero, um sistema de autenticação (login/senha) que protege o
acesso a um dashboard inicial de CRM. Tanto o login quanto o dashboard
(placeholder) fazem parte deste projeto.

## Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Supabase** para autenticação (email/senha) e como banco Postgres
- `@supabase/ssr` para gerenciar sessão via cookies (server + client)
- Deploy-ready para Vercel

### Por que essa abordagem

Rejeitadas:
- **Auth manual (bcrypt + JWT próprio):** mais código para manter, reinventa
  o que o Supabase Auth já resolve (hash de senha, sessões, reset de senha).
- **NextAuth.js + Supabase como DB:** camada extra desnecessária, já que o
  Supabase Auth cobre tudo que este projeto precisa.

## Arquitetura

```
app/
  login/page.tsx           → formulário de login
  forgot-password/page.tsx → formulário "esqueci senha"
  reset-password/page.tsx  → formulário de nova senha (via link do email)
  dashboard/page.tsx       → página protegida (placeholder)
lib/supabase/
  client.ts   → cliente Supabase (browser)
  server.ts   → cliente Supabase (server components/actions)
middleware.ts → protege rotas /dashboard/*
scripts/
  create-user.ts → cria usuários manualmente via linha de comando
```

- Ações de login/logout implementadas como **Server Actions** (sem API
  routes separadas).
- **Middleware** intercepta toda requisição a `/dashboard/*`: sem sessão
  válida, redireciona para `/login`.

## Contas de usuário

- Não há autocadastro (sign-up público). Contas são criadas manualmente:
  - via painel do Supabase (Authentication → Users → Add user), ou
  - via `scripts/create-user.ts`, um script de linha de comando incluído
    no projeto.
- Usuários vivem na tabela nativa `auth.users` do Supabase — sem tabela de
  perfil (`profiles`) customizada, pois não há campos extras necessários
  hoje (pode ser adicionada depois se precisar de nome, cargo, etc.).

## Fluxo de autenticação

1. **Login** (`/login`): formulário email + senha → Server Action chama
   `supabase.auth.signInWithPassword`.
   - Sucesso → redireciona para `/dashboard`.
   - Erro → mensagem genérica "Email ou senha inválidos" (não revela se o
     email existe, por segurança).
2. **Sessão protegida**: middleware verifica cookie de sessão em toda rota
   `/dashboard/*`; sem sessão válida → redireciona para `/login`.
3. **Esqueci a senha** (`/forgot-password`): usuário informa email →
   `supabase.auth.resetPasswordForEmail` envia link de redefinição.
4. **Redefinir senha** (`/reset-password`): usuário chega via link do
   email → define nova senha via `supabase.auth.updateUser`.
5. **Logout**: botão no dashboard chama Server Action
   `supabase.auth.signOut()` → redireciona para `/login`.
6. **Dashboard** (`/dashboard`): Server Component busca usuário logado
   (`supabase.auth.getUser()`), mostra "Bem-vindo, {email}" e botão de
   logout. Sem conteúdo de CRM real ainda — é a base para features futuras.

## Tratamento de erros

- Login inválido → mensagem genérica, sem indicar se o email existe.
- Campos vazios → validação básica no cliente antes de submeter.
- Falha ao enviar email de reset → mensagem de erro amigável, sem detalhes
  técnicos expostos na UI.
- Erros inesperados do Supabase (rede, etc.) → mensagem genérica de erro.
- Configuração via variáveis de ambiente (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`) em `.env.local`, com `.env.example`
  versionado no repo.

## Testes

Dado o escopo (login/senha + dashboard placeholder), não há suíte
automatizada de testes — seria desproporcional ao tamanho do projeto.
Validação será manual: rodar o projeto localmente, criar um usuário de
teste no Supabase, e testar o fluxo completo (login certo, login errado,
esqueci senha, logout, acesso negado sem sessão) no navegador antes de
considerar pronto.

## Fora de escopo (por ora)

- Autocadastro público de usuários.
- Múltiplos papéis/permissões (admin vs. usuário comum).
- Conteúdo real de CRM (contatos, negócios, tarefas) — apenas a casca de
  autenticação e um dashboard placeholder.
- Testes automatizados.
