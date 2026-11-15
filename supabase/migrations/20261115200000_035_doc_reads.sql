-- What the agent read from an uploaded document, waiting for the developer's review.
-- Kept apart from project_docs on purpose: an investor who is shown a document can read its row, but never what was extracted from it.
create table if not exists public.doc_reads (
  doc_id uuid primary key references public.project_docs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'reading' check (status in ('reading', 'ready', 'applied', 'dismissed', 'failed')),
  doc_type text,
  result jsonb,
  error text,
  updated_at timestamptz not null default now()
);
create index if not exists doc_reads_project on public.doc_reads (project_id);
alter table public.doc_reads enable row level security;
create policy doc_reads_owner on public.doc_reads for all to authenticated
  using (exists (select 1 from public.projects p where p.id = doc_reads.project_id and (p.owner_id = (select auth.uid()) or public.is_staff())))
  with check (exists (select 1 from public.projects p where p.id = doc_reads.project_id and (p.owner_id = (select auth.uid()) or public.is_staff())));
grant select, insert, update, delete on public.doc_reads to authenticated;

-- Reading a document costs more than a chat message, so it has its own daily limit.
alter table public.agent_calls add column if not exists kind text not null default 'chat';
create index if not exists agent_calls_user_kind_day on public.agent_calls (user_id, kind, created_at desc);
