-- "name" inside the subqueries resolved to investors.name. Every reference is now qualified with the object table.
drop policy if exists data_room_insert on storage.objects;
drop policy if exists data_room_update on storage.objects;
drop policy if exists data_room_delete on storage.objects;
drop policy if exists data_room_select on storage.objects;

create policy data_room_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'data-room' and exists (select 1 from public.projects p where p.id::text = (storage.foldername(objects.name))[1] and p.owner_id = (select auth.uid())));
create policy data_room_update on storage.objects for update to authenticated using (
  bucket_id = 'data-room' and exists (select 1 from public.projects p where p.id::text = (storage.foldername(objects.name))[1] and p.owner_id = (select auth.uid())))
  with check (bucket_id = 'data-room' and exists (select 1 from public.projects p where p.id::text = (storage.foldername(objects.name))[1] and p.owner_id = (select auth.uid())));
create policy data_room_delete on storage.objects for delete to authenticated using (
  bucket_id = 'data-room' and exists (select 1 from public.projects p where p.id::text = (storage.foldername(objects.name))[1] and p.owner_id = (select auth.uid())));
create policy data_room_select on storage.objects for select to authenticated using (
  bucket_id = 'data-room' and (
    exists (select 1 from public.projects p where p.id::text = (storage.foldername(objects.name))[1] and (p.owner_id = (select auth.uid()) or public.is_staff()))
    or exists (select 1 from public.deals d join public.investors i on i.id = d.investor_id
                where d.project_id::text = (storage.foldername(objects.name))[1] and i.user_id = (select auth.uid())
                  and d.stage in ('shared', 'qa', 'answered', 'ts', 'call')
                  and exists (select 1 from unnest(d.shared_docs) x where x::text = storage.filename(objects.name)))));
