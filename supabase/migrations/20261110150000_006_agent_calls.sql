-- Usage log for the AI agent: one row per request. Used for the daily limit and cost tracking.
create table if not exists public.agent_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists agent_calls_user_day on public.agent_calls (user_id, created_at desc);

alter table public.agent_calls enable row level security;

create policy agent_calls_read on public.agent_calls
  for select using (user_id = (select auth.uid()) or public.is_staff());

create policy agent_calls_insert on public.agent_calls
  for insert with check (user_id = (select auth.uid()));
