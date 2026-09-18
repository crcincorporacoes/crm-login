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
