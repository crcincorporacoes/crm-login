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
- `/dashboard` — área protegida (redireciona para `/login` sem sessão)
- `/signup` — cadastro de cliente/lead (nome, CPF, data de nascimento, telefone, email, senha)
- `/portal` — área do cliente (redireciona para `/login` sem sessão, ou para `/dashboard` se a conta for de equipe)

## Segurança de dados (RLS)

Este projeto não cria tabelas customizadas no Postgres — apenas usa
`auth.users`, gerenciada internamente pelo Supabase. Ao adicionar tabelas
reais do CRM (contatos, negócios, etc.) em uma feature futura, ative Row
Level Security em cada uma delas antes de expor dados.

## Dois tipos de conta

- **Equipe**: criada manualmente (painel do Supabase ou script CLI), acessa `/dashboard`.
- **Cliente/lead**: se autocadastra em `/signup`, acessa `/portal`.

A distinção é implícita: contas de cliente têm uma linha na tabela `profiles`
(criada durante o cadastro); contas de equipe não têm. Não existe uma coluna
`role` — se um terceiro tipo de conta for necessário no futuro, essa decisão
deve ser revisitada.
