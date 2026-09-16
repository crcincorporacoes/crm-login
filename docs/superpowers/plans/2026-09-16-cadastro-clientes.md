# Cadastro Público de Clientes/Leads — Plano de Implementação

> **Para executores automatizados:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para rastreamento.

**Objetivo:** Permitir que leads/clientes criem sua própria conta (nome, CPF, data de nascimento, telefone, email, senha) e acessem uma área própria (`/portal`), sem afetar o autocadastro de contas de equipe (que continua proibido, via `/dashboard`).

**Arquitetura:** Nova tabela `profiles` no Postgres do Supabase (com RLS), preenchida só para clientes no momento do cadastro. A presença de uma linha em `profiles` é o único sinal usado para diferenciar "cliente" de "equipe" — sem coluna `role`. Cadastro é uma Server Action que chama `supabase.auth.signUp()` e depois insere o perfil. Middleware e páginas passam a checar essa presença para rotear entre `/dashboard` (equipe) e `/portal` (cliente).

**Stack Tecnológica:** Mesma do projeto de login já existente — Next.js (App Router), TypeScript, `@supabase/supabase-js`, `@supabase/ssr`. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-16-cadastro-clientes-design.md`

## Global Constraints

- Contas de equipe continuam sem autocadastro (criadas só via painel do Supabase ou `scripts/create-user.ts`). Só clientes/leads se autocadastram, e só pela rota `/signup`.
- Toda autenticação/sessão passa por `@supabase/ssr` (`createClient()` de `lib/supabase/server.ts`) — nunca lógica de cookie/sessão feita à mão.
- Cadastro e logout do cliente são Server Actions, não rotas de API.
- Mensagens de erro do cadastro são genéricas e nunca revelam qual dado específico (email ou CPF) já existe no sistema.
- CPF é armazenado normalizado (só dígitos, sem pontuação) e é `unique` no banco; validado no servidor (dígitos verificadores) antes de qualquer chamada ao Supabase.
- RLS habilitado na tabela `profiles` desde o primeiro commit — cada usuário só acessa a própria linha.
- Distinção entre conta de equipe e conta de cliente é implícita: **presença de uma linha em `profiles`**, sem coluna `role`.
- Sem suíte de testes automatizados (mesma decisão do projeto original — desproporcional para este escopo). Cada tarefa termina com um passo de **verificação manual**.
- Todo texto de interface (UI) é em português (pt-BR).

---

### Tarefa 1: Tabela `profiles` no Supabase + helper `hasProfile`

**Arquivos:**
- Criar: `supabase/migrations/0001_create_profiles.sql`
- Criar: `lib/supabase/profile.ts`

**Interfaces:**
- Consome: nada das tarefas anteriores (usa as credenciais já existentes em `.env.local`).
- Produz: tabela `profiles` no banco Supabase real do projeto; `hasProfile(supabase: SupabaseClient, userId: string): Promise<boolean>` de `lib/supabase/profile.ts` — usada pelas Tarefas 4, 5 e 6.

- [ ] **Passo 1: Criar o arquivo de migração SQL**

Criar `supabase/migrations/0001_create_profiles.sql`:

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

- [ ] **Passo 2: Ação manual do usuário — rodar a migração no Supabase**

Este projeto não usa a CLI do Supabase (sem senha do Postgres nem token de Management API disponíveis para automação). Peça para o usuário:

1. Abrir o painel do projeto em [supabase.com](https://supabase.com) → **SQL Editor** (menu lateral).
2. Clicar em **New query**.
3. Colar o conteúdo exato de `supabase/migrations/0001_create_profiles.sql`.
4. Clicar em **Run**.
5. Confirmar que apareceu "Success. No rows returned".

Se você é o agente executando esta tarefa e não tem como pedir isso diretamente ao usuário, pare aqui e reporte BLOCKED pedindo que o controlador obtenha essa confirmação antes de prosseguir para o Passo 3.

- [ ] **Passo 3: Verificação manual — confirmar que a tabela existe**

Rodar (a partir da raiz do projeto, onde está o `.env.local`):
```bash
set -a; source .env.local; set +a
curl -s -o /dev/null -w "%{http_code}\n" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/profiles?select=id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
Esperado: `200`. Se vier `404` ou um corpo com `PGRST205` (tabela não encontrada), a migração do Passo 2 não foi aplicada — volte lá antes de continuar.

- [ ] **Passo 4: Criar o helper `hasProfile`**

Criar `lib/supabase/profile.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export async function hasProfile(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  return data !== null
}
```

- [ ] **Passo 5: Verificação manual**

Rodar: `npx tsc --noEmit`
Esperado: build de tipos conclui sem erros (o arquivo ainda não é usado em lugar nenhum, mas precisa compilar corretamente).

- [ ] **Passo 6: Commit**

```bash
git add supabase/migrations/0001_create_profiles.sql lib/supabase/profile.ts
git commit -m "feat: add profiles table migration and hasProfile helper"
```

---

### Tarefa 2: Validação de CPF

**Arquivos:**
- Criar: `lib/validation/cpf.ts`

**Interfaces:**
- Consome: nada das tarefas anteriores.
- Produz: `isValidCPF(cpf: string): boolean` e `normalizeCPF(cpf: string): string` de `lib/validation/cpf.ts` — usadas pela Tarefa 3.

- [ ] **Passo 1: Criar o módulo de validação**

Criar `lib/validation/cpf.ts`:

```ts
export function normalizeCPF(rawCpf: string): string {
  return rawCpf.replace(/\D/g, '')
}

export function isValidCPF(rawCpf: string): boolean {
  const cpf = normalizeCPF(rawCpf)

  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  const digits = cpf.split('').map(Number)

  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += digits[i] * (10 - i)
  }
  let rest = sum % 11
  const firstCheck = rest < 2 ? 0 : 11 - rest
  if (firstCheck !== digits[9]) return false

  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += digits[i] * (11 - i)
  }
  rest = sum % 11
  const secondCheck = rest < 2 ? 0 : 11 - rest
  if (secondCheck !== digits[10]) return false

  return true
}
```

- [ ] **Passo 2: Verificação manual**

Rodar:
```bash
npx tsx -e "
import { isValidCPF, normalizeCPF } from './lib/validation/cpf';
console.log('válido esperado true:', isValidCPF('123.456.789-09'));
console.log('checksum errado esperado false:', isValidCPF('123.456.789-00'));
console.log('repetido esperado false:', isValidCPF('111.111.111-11'));
console.log('curto esperado false:', isValidCPF('123.456.789-0'));
console.log('normalize esperado 12345678909:', normalizeCPF('123.456.789-09'));
"
```
Esperado: as cinco linhas impressas batem exatamente com o que cada comentário diz (`true`, `false`, `false`, `false`, `12345678909`).

- [ ] **Passo 3: Commit**

```bash
git add lib/validation/cpf.ts
git commit -m "feat: add CPF validation helper"
```

---

### Tarefa 3: Cadastro — Server Action e página `/signup`

**Arquivos:**
- Criar: `app/signup/actions.ts`
- Criar: `app/signup/page.tsx`

**Interfaces:**
- Consome: `createClient()` de `lib/supabase/server.ts` (Tarefa existente do projeto de login); `isValidCPF`, `normalizeCPF` de `lib/validation/cpf.ts` (Tarefa 2); tabela `profiles` (Tarefa 1); variável de ambiente `NEXT_PUBLIC_SITE_URL`.
- Produz: rota `/signup`, referenciada pela Tarefa 6 (link "Criar conta" em `/login`) e pelo `redirectTo` da Tarefa 5.

- [ ] **Passo 1: Criar a Server Action de cadastro**

Criar `app/signup/actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isValidCPF, normalizeCPF } from '@/lib/validation/cpf'

export async function signup(formData: FormData) {
  const name = formData.get('name') as string
  const rawCpf = formData.get('cpf') as string
  const birthDate = formData.get('birthDate') as string
  const phone = formData.get('phone') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const cpf = normalizeCPF(rawCpf)

  if (!isValidCPF(cpf)) {
    redirect(`/signup?error=${encodeURIComponent('CPF inválido.')}`)
  }

  const generic = 'Não foi possível concluir o cadastro. Verifique os dados e tente novamente.'
  const supabase = await createClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=/portal`,
    },
  })

  if (signUpError || !data.user) {
    redirect(`/signup?error=${encodeURIComponent(generic)}`)
  }

  // Se a inserção do perfil falhar (ex.: CPF duplicado), o usuário criado em
  // auth.users fica sem perfil — aceito por ora, ver spec "Fora de escopo".
  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    name,
    cpf,
    birth_date: birthDate,
    phone,
  })

  if (profileError) {
    redirect(`/signup?error=${encodeURIComponent(generic)}`)
  }

  redirect('/signup?sent=1')
}
```

- [ ] **Passo 2: Criar a página de cadastro**

Criar `app/signup/page.tsx`:

```tsx
import { signup } from './actions'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>
}) {
  const { error, sent } = await searchParams

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>Criar conta</h1>
      {sent ? (
        <p>Confirme seu email para ativar sua conta.</p>
      ) : (
        <form action={signup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            Nome
            <input name="name" type="text" required style={{ display: 'block', width: '100%' }} />
          </label>
          <label>
            CPF
            <input name="cpf" type="text" required placeholder="000.000.000-00" style={{ display: 'block', width: '100%' }} />
          </label>
          <label>
            Data de nascimento
            <input name="birthDate" type="date" required style={{ display: 'block', width: '100%' }} />
          </label>
          <label>
            Telefone
            <input name="phone" type="tel" required style={{ display: 'block', width: '100%' }} />
          </label>
          <label>
            Email
            <input name="email" type="email" required style={{ display: 'block', width: '100%' }} />
          </label>
          <label>
            Senha
            <input name="password" type="password" required minLength={6} style={{ display: 'block', width: '100%' }} />
          </label>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <button type="submit">Criar conta</button>
        </form>
      )}
      <p>
        <a href="/login" style={{ color: '#0645ad', textDecoration: 'underline' }}>Já tenho conta</a>
      </p>
    </main>
  )
}
```

- [ ] **Passo 3: Verificação manual**

Com `npm run dev` rodando, simule o submit da Server Action via curl (mesma técnica de `$ACTION_ID_<hash>` usada no projeto de login — inspecione o HTML de `/signup` para extrair o hash do campo oculto). Use o CPF válido `987.654.321-00` para o cadastro de sucesso (dígitos verificadores já calculados e confirmados pelo mesmo algoritmo da Tarefa 2 — `98765432100` passa em `isValidCPF`), e `123.456.789-09` como um segundo CPF válido caso precise de dois cadastros distintos em algum passo abaixo.

Cobrir no mínimo:
1. CPF inválido (ex.: `111.111.111-11`) → erro "CPF inválido.", nenhum usuário criado (`GET /rest/v1/profiles?select=id` com service role não deve ganhar linha nova).
2. Cadastro com dados válidos e um email novo → resposta leva a `/signup?sent=1`; confirme que apareceu uma linha nova em `auth.users` (via Admin API `GET /auth/v1/admin/users`, filtrando pelo email) e uma linha correspondente em `profiles` (via REST, filtrando por `id`).
3. Cadastro repetido usando o **mesmo CPF** do passo 2 com um **email diferente** → erro genérico "Não foi possível concluir o cadastro...", e confirme que não foi criada uma segunda linha em `profiles` com aquele CPF.
4. Cadastro repetido usando o **mesmo email** do passo 2 com um **CPF diferente** (válido) → erro genérico, sem revelar que o email já existe.

- [ ] **Passo 4: Commit**

```bash
git add app/signup
git commit -m "feat: add client signup page and server action"
```

---

### Tarefa 4: Área do cliente — página `/portal` e logout

**Arquivos:**
- Criar: `app/portal/actions.ts`
- Criar: `app/portal/page.tsx`

**Interfaces:**
- Consome: `createClient()` de `lib/supabase/server.ts`; `hasProfile()` de `lib/supabase/profile.ts` (Tarefa 1).
- Produz: rota `/portal`, referenciada pela Tarefa 3 (`redirectTo` do cadastro), pela Tarefa 5 (middleware) e pela Tarefa 6 (página raiz).

- [ ] **Passo 1: Criar a Server Action de logout**

Criar `app/portal/actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Passo 2: Criar a página do portal**

Criar `app/portal/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasProfile } from '@/lib/supabase/profile'
import { logout } from './actions'

export default async function PortalPage() {
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

  return (
    <main style={{ maxWidth: 480, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>Bem-vindo, {profile?.name ?? user.email}</h1>
      <form action={logout}>
        <button type="submit">Sair</button>
      </form>
    </main>
  )
}
```

- [ ] **Passo 3: Verificação manual**

Usando o usuário de cliente criado na verificação da Tarefa 3 (ou criando um novo do mesmo jeito): confirme o email dele via `admin/generate_link` (mesma técnica usada no projeto de login para testar reset de senha sem depender de caixa de entrada real — gere um link tipo `signup`/`magiclink` e simule o clique via curl `-L`), obtenha uma sessão válida, e então:
1. `GET /portal` autenticado → 200, mostrando "Bem-vindo, {nome cadastrado}" (não o email).
2. Logout → redireciona para `/login`; `/portal` sem sessão → redireciona (comportamento definitivo de redirecionamento só fecha na Tarefa 5, que adiciona a checagem no middleware — por ora, sem middleware atualizado ainda, a proteção vem só do `redirect('/login')` dentro da própria página, o que já é suficiente para este teste).
3. Usando a sessão de uma conta de **equipe** existente (ex. `teste@example.com`), acessar `/portal` → deve cair no `redirect('/dashboard')` do Passo 2 (a conta de equipe não tem linha em `profiles`).

- [ ] **Passo 4: Commit**

```bash
git add app/portal
git commit -m "feat: add client portal page with logout"
```

---

### Tarefa 5: Middleware e dashboard — separar áreas por perfil

**Arquivos:**
- Modificar: `lib/supabase/middleware.ts`
- Modificar: `app/dashboard/page.tsx`

**Interfaces:**
- Consome: `hasProfile()` de `lib/supabase/profile.ts` (Tarefa 1).
- Produz: nada consumido por tarefas seguintes — fecha a proteção de rotas para ambas as áreas.

- [ ] **Passo 1: Atualizar o middleware para separar `/dashboard` de `/portal`**

Substituir o conteúdo de `lib/supabase/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseEnv } from './env'
import { hasProfile } from './profile'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const { url: supabaseUrl, anonKey } = getSupabaseEnv()

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const isDashboardRoute = request.nextUrl.pathname.startsWith('/dashboard')
  const isPortalRoute = request.nextUrl.pathname.startsWith('/portal')
  const isProtectedRoute = isDashboardRoute || isPortalRoute

  let user = null
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser()
    user = fetchedUser
  } catch {
    if (!isProtectedRoute) {
      // Rota não protegida: não derruba o site inteiro por um erro
      // transitório do Supabase.
      return supabaseResponse
    }
    // Rota protegida: falha fechada — trata como não autenticado.
    user = null
  }

  const redirectTo = (pathname: string) => {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = pathname
    const redirectResponse = NextResponse.redirect(redirectUrl)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  if (isProtectedRoute && !user) {
    return redirectTo('/login')
  }

  if (user && isProtectedRoute) {
    const isClient = await hasProfile(supabase, user.id)
    if (isDashboardRoute && isClient) {
      return redirectTo('/portal')
    }
    if (isPortalRoute && !isClient) {
      return redirectTo('/dashboard')
    }
  }

  return supabaseResponse
}
```

- [ ] **Passo 2: Atualizar o dashboard para redirecionar clientes**

Em `app/dashboard/page.tsx`, adicionar o import de `hasProfile` e a checagem logo após o `if (!user)`. Conteúdo final do arquivo:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasProfile } from '@/lib/supabase/profile'
import { logout } from './actions'

export default async function DashboardPage() {
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

  return (
    <main style={{ maxWidth: 480, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>Bem-vindo, {user.email}</h1>
      <form action={logout}>
        <button type="submit">Sair</button>
      </form>
    </main>
  )
}
```

- [ ] **Passo 3: Verificação manual**

Rodar `npm run dev` e, via curl com cookies salvos por sessão:
1. Sessão de cliente (da Tarefa 3/4) → `GET /dashboard` → 307 para `/portal`.
2. Sessão de equipe (`teste@example.com`) → `GET /portal` → 307 para `/dashboard`.
3. Sessão de equipe → `GET /dashboard` → 200, comportamento inalterado.
4. Sessão de cliente → `GET /portal` → 200, comportamento inalterado.
5. Sem sessão → `GET /dashboard` e `GET /portal` → ambos 307 para `/login` (regressão da proteção original).

- [ ] **Passo 4: Commit**

```bash
git add lib/supabase/middleware.ts app/dashboard/page.tsx
git commit -m "feat: separate /dashboard and /portal access by profile presence"
```

---

### Tarefa 6: Página raiz e link de cadastro no login

**Arquivos:**
- Modificar: `app/page.tsx`
- Modificar: `app/login/page.tsx`

**Interfaces:**
- Consome: `hasProfile()` de `lib/supabase/profile.ts` (Tarefa 1).
- Produz: nada consumido por tarefas seguintes.

- [ ] **Passo 1: Atualizar o redirecionamento da página raiz**

Substituir o conteúdo de `app/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasProfile } from '@/lib/supabase/profile'

export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  redirect((await hasProfile(supabase, user.id)) ? '/portal' : '/dashboard')
}
```

- [ ] **Passo 2: Adicionar o link "Criar conta" na página de login**

Em `app/login/page.tsx`, adicionar um novo parágrafo com o link, logo depois do parágrafo existente de "Esqueci minha senha" (antes de fechar `</main>`):

```tsx
      <p>
        <a href="/signup" style={{ color: '#0645ad', textDecoration: 'underline' }}>Criar conta</a>
      </p>
```

O arquivo completo passa a ser:

```tsx
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>Entrar</h1>
      <form action={login} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          Email
          <input name="email" type="email" required style={{ display: 'block', width: '100%' }} />
        </label>
        <label>
          Senha
          <input name="password" type="password" required style={{ display: 'block', width: '100%' }} />
        </label>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit">Entrar</button>
      </form>
      <p>
        <a href="/forgot-password" style={{ color: '#0645ad', textDecoration: 'underline' }}>Esqueci minha senha</a>
      </p>
      <p>
        <a href="/signup" style={{ color: '#0645ad', textDecoration: 'underline' }}>Criar conta</a>
      </p>
    </main>
  )
}
```

- [ ] **Passo 3: Verificação manual**

Rodar `npm run dev`.
1. `curl -s http://localhost:3000/login | grep -o 'href="/signup"'` → deve encontrar o link.
2. Sessão de cliente → `GET /` → 307 para `/portal`.
3. Sessão de equipe → `GET /` → 307 para `/dashboard`.
4. Sem sessão → `GET /` → 307 para `/login` (regressão do comportamento original).

- [ ] **Passo 4: Commit**

```bash
git add app/page.tsx app/login/page.tsx
git commit -m "feat: route root page by profile and add signup link to login"
```

---

### Tarefa 7: README e verificação final completa

**Arquivos:**
- Modificar: `README.md`

**Interfaces:**
- Consome: nada — é a tarefa final, de documentação e verificação.
- Produz: nada.

- [ ] **Passo 1: Atualizar o README**

Em `README.md`, na seção "Rotas", adicionar as duas rotas novas à lista existente:

```markdown
- `/signup` — cadastro de cliente/lead (nome, CPF, data de nascimento, telefone, email, senha)
- `/portal` — área do cliente (redireciona para `/login` sem sessão, ou para `/dashboard` se a conta for de equipe)
```

Adicionar uma nova seção, depois da seção "Segurança de dados (RLS)" existente:

```markdown
## Dois tipos de conta

- **Equipe**: criada manualmente (painel do Supabase ou script CLI), acessa `/dashboard`.
- **Cliente/lead**: se autocadastra em `/signup`, acessa `/portal`.

A distinção é implícita: contas de cliente têm uma linha na tabela `profiles`
(criada durante o cadastro); contas de equipe não têm. Não existe uma coluna
`role` — se um terceiro tipo de conta for necessário no futuro, essa decisão
deve ser revisitada.
```

- [ ] **Passo 2: Verificação manual final completa**

Rodar `npm run dev` e percorrer, em ordem:
1. Cadastro completo de um cliente novo com dados válidos em `/signup` → confirmar email (via `admin/generate_link`, como nas tarefas anteriores) → cai em `/portal`, mostrando o nome cadastrado.
2. Cliente logado tenta `/dashboard` → redirecionado para `/portal`.
3. Conta de equipe existente (`teste@example.com`) continua acessando `/dashboard` normalmente; se tentar `/portal`, é mandada de volta para `/dashboard`.
4. CPF inválido em `/signup` → rejeitado, nenhuma conta criada.
5. CPF duplicado (email novo) → rejeitado com mensagem genérica, sem duplicar linha em `profiles`.
6. Email duplicado (CPF novo) → rejeitado com a mesma mensagem genérica.
7. Fluxo de "esqueci minha senha" (`/forgot-password` → `/reset-password`) continua funcionando para a conta de cliente criada no passo 1.
8. `/` deslogado → `/login`; logado como cliente → `/portal`; logado como equipe → `/dashboard`.

Esperado: cada passo se comporta como descrito, sem erros no console do navegador ou do terminal.

- [ ] **Passo 3: Commit**

```bash
git add README.md
git commit -m "docs: document client signup flow and account types"
```
