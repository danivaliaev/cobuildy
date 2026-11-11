-- Investor workspace: the guided mandate keeps its answer states in one jsonb column, and an investor can list the documents shared with them.
alter table public.investors add column if not exists mandate jsonb;
grant update (mandate) on public.investors to authenticated;

-- Documents a developer has shared with the signed-in investor, per deal. Titles and kinds only; nothing about the developer.
create or replace function public.my_deal_docs()
returns table (deal_id uuid, doc_id uuid, kind text, title text)
language sql stable security definer set search_path = public as $$
  select d.id, x.id, x.kind, x.title
    from public.deals d
    join public.investors i on i.id = d.investor_id and i.user_id = (select auth.uid())
    join public.project_docs x on x.project_id = d.project_id and x.id = any (d.shared_docs)
   where d.stage in ('shared', 'qa', 'answered', 'ts', 'call')
   order by x.created_at
$$;
revoke all on function public.my_deal_docs() from public, anon;
grant execute on function public.my_deal_docs() to authenticated;
