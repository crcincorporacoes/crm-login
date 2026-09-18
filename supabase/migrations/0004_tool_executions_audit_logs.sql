create table tool_executions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  tool_name text not null,
  input jsonb not null,
  output jsonb,
  success boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create index tool_executions_message_id_idx on tool_executions (message_id);

alter table tool_executions enable row level security;

create policy "Usuários veem execuções de tool das próprias mensagens"
  on tool_executions for select
  to authenticated
  using (
    exists (
      select 1 from messages
      join conversations on conversations.id = messages.conversation_id
      where messages.id = tool_executions.message_id
        and conversations.user_id = (select auth.uid())
    )
  );

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_user_id_idx on audit_logs (user_id);

alter table audit_logs enable row level security;

create policy "Usuários veem apenas seus próprios logs de auditoria"
  on audit_logs for select
  to authenticated
  using ((select auth.uid()) = user_id);
