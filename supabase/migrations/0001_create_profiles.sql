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
