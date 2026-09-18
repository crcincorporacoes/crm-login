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
