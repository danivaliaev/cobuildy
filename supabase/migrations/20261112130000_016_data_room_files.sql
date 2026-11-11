-- Data room files. One private bucket, one object per document at <project id>/<document id>.
-- The developer uploads and removes; Cobuildy staff can read; an investor can read only a document shared with them
-- on a deal that has passed the NDA. Downloads by investors are logged.
alter table public.project_docs add column if not exists file_name text;
alter table public.project_docs add column if not exists size_bytes bigint;
alter table public.project_docs add column if not exists mime text;
alter table public.project_docs add column if not exists field_key text;
create unique index if not exists project_docs_field_uq on public.project_docs (project_id, field_key) where field_key is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('data-room', 'data-room', false, 26214400, array[
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy data_room_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'data-room' and exists (select 1 from public.projects p where p.id::text = (storage.foldername(name))[1] and p.owner_id = (select auth.uid())));
create policy data_room_update on storage.objects for update to authenticated using (
  bucket_id = 'data-room' and exists (select 1 from public.projects p where p.id::text = (storage.foldername(name))[1] and p.owner_id = (select auth.uid())))
  with check (bucket_id = 'data-room' and exists (select 1 from public.projects p where p.id::text = (storage.foldername(name))[1] and p.owner_id = (select auth.uid())));
create policy data_room_delete on storage.objects for delete to authenticated using (
  bucket_id = 'data-room' and exists (select 1 from public.projects p where p.id::text = (storage.foldername(name))[1] and p.owner_id = (select auth.uid())));
create policy data_room_select on storage.objects for select to authenticated using (
  bucket_id = 'data-room' and (
    exists (select 1 from public.projects p where p.id::text = (storage.foldername(name))[1] and (p.owner_id = (select auth.uid()) or public.is_staff()))
    or exists (select 1 from public.deals d join public.investors i on i.id = d.investor_id
                where d.project_id::text = (storage.foldername(name))[1] and i.user_id = (select auth.uid())
                  and d.stage in ('shared', 'qa', 'answered', 'ts', 'call')
                  and exists (select 1 from unnest(d.shared_docs) x where x::text = storage.filename(name)))));

-- The investor's list of shared documents, now with the file facts.
drop function public.my_deal_docs();
create function public.my_deal_docs()
returns table (deal_id uuid, doc_id uuid, kind text, title text, file_name text, size_bytes bigint, has_file boolean)
language sql stable security definer set search_path = public as $$
  select d.id, x.id, x.kind, x.title, x.file_name, x.size_bytes, x.storage_path is not null
    from public.deals d
    join public.investors i on i.id = d.investor_id and i.user_id = (select auth.uid())
    join public.project_docs x on x.project_id = d.project_id and x.id = any (d.shared_docs)
   where d.stage in ('shared', 'qa', 'answered', 'ts', 'call')
   order by x.created_at
$$;
revoke all on function public.my_deal_docs() from public, anon;
grant execute on function public.my_deal_docs() to authenticated;

create or replace function public.log_doc_download(p_doc uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d public.deals;
begin
  select dl.* into d from public.deals dl join public.investors i on i.id = dl.investor_id
   where i.user_id = auth.uid() and p_doc = any (dl.shared_docs) and dl.stage in ('shared', 'qa', 'answered', 'ts', 'call') limit 1;
  if d.id is null then raise exception 'not allowed'; end if;
  insert into public.audit_log (actor_id, action, table_name, row_id, data) values (auth.uid(), 'doc_downloaded', 'project_docs', p_doc::text, jsonb_build_object('deal', d.id, 'project', d.project_id));
end $$;
revoke all on function public.log_doc_download(uuid) from public, anon;
grant execute on function public.log_doc_download(uuid) to authenticated;
