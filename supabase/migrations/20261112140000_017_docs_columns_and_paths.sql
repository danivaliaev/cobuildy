-- The developer may write the document facts, but not the verification flag (that is for Cobuildy staff, later).
revoke insert, update on public.project_docs from authenticated;
grant insert (id, project_id, kind, title, storage_path, file_name, size_bytes, mime, field_key) on public.project_docs to authenticated;
grant update (kind, title, storage_path, file_name, size_bytes, mime, field_key) on public.project_docs to authenticated;

drop function public.my_deal_docs();
create function public.my_deal_docs()
returns table (deal_id uuid, doc_id uuid, kind text, title text, file_name text, size_bytes bigint, storage_path text)
language sql stable security definer set search_path = public as $$
  select d.id, x.id, x.kind, x.title, x.file_name, x.size_bytes, x.storage_path
    from public.deals d
    join public.investors i on i.id = d.investor_id and i.user_id = (select auth.uid())
    join public.project_docs x on x.project_id = d.project_id and x.id = any (d.shared_docs)
   where d.stage in ('shared', 'qa', 'answered', 'ts', 'call')
   order by x.created_at
$$;
revoke all on function public.my_deal_docs() from public, anon;
grant execute on function public.my_deal_docs() to authenticated;
