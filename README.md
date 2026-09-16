# CRM Login

Sistema de login (email/senha) protegendo o acesso a um dashboard de CRM.
Next.js 15 + TypeScript + Supabase Auth.

## Configuração

1. `npm install`
2. Crie um projeto no [Supabase](https://supabase.com) (gratuito).
3. Copie `.env.example` para `.env.local` e preencha com as chaves do seu
   projeto Supabase (Project Settings → API).
4. `npm run dev` e acesse `http://localhost:3000`.

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
- `/dashboard` — área protegida (redireciona para `/login` sem sessão)

## Segurança de dados (RLS)

Este projeto não cria tabelas customizadas no Postgres — apenas usa
`auth.users`, gerenciada internamente pelo Supabase. Ao adicionar tabelas
reais do CRM (contatos, negócios, etc.) em uma feature futura, ative Row
Level Security em cada uma delas antes de expor dados.
