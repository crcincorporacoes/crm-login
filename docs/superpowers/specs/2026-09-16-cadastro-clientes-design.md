# Cadastro Público de Clientes/Leads — Design

**Data:** 2026-09-16
**Status:** Aprovado, aguardando implementação

## Objetivo

Permitir que leads/clientes da CRC Incorporações criem sua própria conta
(nome, CPF, data de nascimento, telefone, email, senha) e acessem uma área
própria — sem depender de alguém da equipe criar a conta manualmente, como
hoje é obrigatório para contas de equipe (ver
`docs/superpowers/specs/2026-09-15-login-crm-design.md`).

Esta feature **reverte parcialmente** a restrição "sem autocadastro
público" do projeto original — mas só para este novo tipo de usuário
(cliente/lead). Contas de equipe continuam sem autocadastro, criadas apenas
via painel do Supabase ou `scripts/create-user.ts`.

## Contexto: dois tipos de usuário

A partir desta feature, o sistema passa a ter dois tipos de usuário,
distinguidos pela presença de uma linha na nova tabela `profiles`:

| Tipo | Como a conta é criada | Tem linha em `profiles`? | Área após login |
|---|---|---|---|
| Equipe (staff) | Painel do Supabase ou `scripts/create-user.ts` | Não | `/dashboard` |
| Cliente/lead | Autocadastro em `/signup` | Sim | `/portal` |

Não existe um campo `role` explícito — a existência da linha em `profiles`
já diferencia os dois casos. Motivo: só há dois papéis hoje, e essa
distinção implícita evita migrar as contas de equipe já existentes ou
mudar `scripts/create-user.ts`. Se um terceiro papel surgir no futuro, essa
decisão deve ser revisitada (ver "Fora de escopo").

## Stack

Mesma stack do projeto de login já existente — Next.js (App Router) +
TypeScript + Supabase Auth + `@supabase/ssr`. Nenhuma dependência nova.

## Modelo de dados

Nova tabela `profiles`, no schema `public` do Postgres do Supabase:

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  cpf text not null unique,
  birth_date date not null,
  phone text not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Usuários veem apenas seu próprio perfil"
  on profiles for select using (auth.uid() = id);

create policy "Usuários atualizam apenas seu próprio perfil"
  on profiles for update using (auth.uid() = id);

create policy "Usuários criam apenas seu próprio perfil"
  on profiles for insert with check (auth.uid() = id);
```

- `cpf` é armazenado normalizado (só dígitos, sem pontuação) e é `unique`
  — a constraint do banco é a garantia final contra duplicidade, além da
  validação de aplicação.
- `email` não é duplicado nesta tabela — já vive em `auth.users`.
- RLS habilitado desde o início (diferente do projeto de login original,
  que não tinha tabelas customizadas e por isso não precisava de RLS —
  ver a seção "Segurança de dados (RLS)" da spec anterior, que já avisava
  que isso seria obrigatório na primeira tabela nova).

## Arquitetura

```
app/
  signup/page.tsx    → formulário de cadastro (novo)
  signup/actions.ts  → Server Action de cadastro (novo)
  portal/page.tsx    → área do cliente, placeholder (novo)
  portal/actions.ts  → logout do cliente, reaproveita o padrão do dashboard (novo)
  login/page.tsx     → ganha link "Criar conta" → /signup (modificado)
  page.tsx           → passa a checar profiles para decidir /dashboard vs /portal (modificado)
  auth/callback/route.ts → sem mudança de código; já suporta o novo redirect via `next` (inalterado)
middleware.ts        → passa a checar profiles para separar /dashboard de /portal (modificado)
lib/supabase/middleware.ts → mesma checagem de perfil (modificado)
lib/validation/cpf.ts → validação de dígitos verificadores do CPF (novo)
```

Ações de cadastro e logout do cliente continuam sendo **Server Actions**,
mantendo o padrão do restante do projeto — sem rotas de API.

## Fluxo de cadastro

1. Usuário preenche `/signup`: nome, CPF, data de nascimento, telefone,
   email, senha.
2. Server Action `signup`:
   a. Valida CPF (formato + dígitos verificadores, via
      `lib/validation/cpf.ts`). Inválido → erro "CPF inválido."
   b. Chama `supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${siteUrl}/auth/callback?next=/portal` } })`.
      Erro (email já existe, senha fraca, etc.) → mensagem genérica: "Não
      foi possível concluir o cadastro. Verifique os dados e tente
      novamente." — não revela qual campo é o problema.
   c. Insere a linha em `profiles` (id do usuário recém-criado, name, cpf
      normalizado, birth_date, phone). Erro de CPF duplicado (constraint
      `unique`) → mesma mensagem genérica do passo anterior, para não
      vazar que aquele CPF já existe.
   d. Sucesso → mostra tela "Confirme seu email para ativar sua conta."
3. Usuário clica no link do email → `/auth/callback` (já existe, sem
   mudança) troca o código por sessão e redireciona para `/portal` (via
   `next=/portal`, do mesmo jeito que o fluxo de reset de senha já usa
   `next=/reset-password`).

## Roteamento e proteção de rotas

- `middleware.ts` / `lib/supabase/middleware.ts`: para requisições a
  `/dashboard` ou `/portal` com sessão válida, consulta se existe uma
  linha em `profiles` para aquele `user.id`.
  - Sem sessão → redireciona para `/login` (comportamento já existente,
    inalterado).
  - Com sessão e **sem** perfil (equipe) acessando `/portal` → redireciona
    para `/dashboard`.
  - Com sessão e **com** perfil (cliente) acessando `/dashboard` →
    redireciona para `/portal`.
- `app/page.tsx` (raiz): em vez de sempre redirecionar usuário logado para
  `/dashboard`, passa a checar `profiles` e decidir entre `/dashboard`
  (sem perfil) e `/portal` (com perfil).
- `/portal`: página nova, mesmo nível de simplicidade que `/dashboard` foi
  inicialmente — mostra nome do cliente e um botão de logout (reaproveita
  o mesmo padrão de Server Action de `app/dashboard/actions.ts`).
- `/login`: ganha um link "Criar conta" apontando para `/signup`.

## Validação de CPF

`lib/validation/cpf.ts` exporta `isValidCPF(cpf: string): boolean`,
implementando o algoritmo padrão de dígitos verificadores do CPF
brasileiro (rejeita sequências repetidas tipo `111.111.111-11`, que
passam num check ingênuo de dígito verificador). O CPF é normalizado
(removendo pontuação, mantendo só dígitos) antes de validar e antes de
gravar no banco, para que `123.456.789-00` e `12345678900` sejam tratados
como o mesmo valor.

## Tratamento de erros

- CPF com formato ou dígitos verificadores inválidos → "CPF inválido."
- Email já cadastrado OU CPF já cadastrado → mesma mensagem genérica: "Não
  foi possível concluir o cadastro. Verifique os dados e tente novamente."
  (não diferenciamos os dois motivos, para não vazar qual dado específico
  já existe no sistema — mesmo princípio anti-enumeração já usado no
  login e no reset de senha do projeto original).
- Senha fraca (regra padrão do Supabase, mínimo 6 caracteres) → mensagem
  genérica adaptada para pt-BR.
- Erros inesperados do Supabase (rede, etc.) → mensagem genérica de erro,
  mesmo padrão do restante do projeto.

## Testes

Sem suíte automatizada, mesma decisão do projeto de login original —
desproporcional ao escopo. Verificação manual mínima antes de considerar
pronto:

- Cadastro com CPF inválido → erro exibido, nenhum usuário criado em
  `auth.users` nem em `profiles`.
- Cadastro com dados válidos → email de confirmação disparado; clicar no
  link leva a `/portal` autenticado.
- Cadastro repetido com o mesmo CPF (email diferente) → erro genérico,
  nenhuma duplicata criada.
- Cadastro repetido com o mesmo email (CPF diferente) → erro genérico,
  sem vazar que o email já existe.
- Cliente logado tentando acessar `/dashboard` diretamente → redirecionado
  para `/portal`.
- Conta de equipe (sem perfil) tentando acessar `/portal` diretamente →
  redirecionado para `/dashboard`.
- Fluxo de "esqueci minha senha" continua funcionando para clientes (usa o
  mesmo backend de auth, sem mudança de código nessas rotas).

## Segurança de dados (RLS)

Diferente do projeto de login original (que não tinha tabelas
customizadas), esta feature **introduz a primeira tabela customizada**
(`profiles`), com dados sensíveis (CPF, data de nascimento, telefone) —
por isso RLS é obrigatório desde o primeiro commit desta tabela, não uma
pendência futura. As policies restringem cada usuário à própria linha
(`auth.uid() = id`), sem exceção para leitura por outros usuários ou pela
equipe (a equipe hoje não tem uma tela para listar clientes — isso é
"Fora de escopo").

## Fora de escopo (por ora)

- Tela administrativa para a equipe listar/gerenciar clientes cadastrados
  (a equipe pode consultar `profiles` diretamente pelo painel do Supabase
  se precisar, por enquanto).
- Papel (`role`) explícito ou um terceiro tipo de usuário — a distinção
  implícita (tem perfil = cliente) é suficiente para dois papéis; revisar
  se isso mudar.
- Aprovação manual de cadastros — liberação é imediata após confirmação de
  email.
- Edição de dados cadastrais pelo próprio cliente (a tabela/policies já
  permitem `update`, mas nenhuma tela usa isso ainda).
- Validação de telefone (formato/DDD) além de campo obrigatório.
- Conteúdo real da área do cliente — `/portal` é um placeholder, como
  `/dashboard` foi inicialmente.
- Testes automatizados.
