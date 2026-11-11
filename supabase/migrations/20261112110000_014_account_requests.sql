-- A person asks Cobuildy to export or delete their data. Staff are notified; the work itself is done by hand and confirmed with the person.
create or replace function public.request_account_action(p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text; s record;
begin
  if uid is null then raise exception 'Please sign in first'; end if;
  if p_kind not in ('export', 'deletion') then raise exception 'Unknown request'; end if;
  if exists (select 1 from public.audit_log where actor_id = uid and action = 'account_' || p_kind || '_requested' and at > now() - interval '7 days') then
    raise exception 'You already sent this request. Cobuildy will contact you by email.';
  end if;
  select email into em from auth.users where id = uid;
  insert into public.audit_log (actor_id, action, table_name, row_id, data) values (uid, 'account_' || p_kind || '_requested', 'profiles', uid::text, jsonb_build_object('email', em));
  for s in select id from public.profiles where role = 'admin' loop
    perform public.notify(s.id, 'account', case p_kind when 'export' then 'Data export requested' else 'Account deletion requested' end, em, '/admin');
  end loop;
end $$;
revoke all on function public.request_account_action(text) from public, anon;
grant execute on function public.request_account_action(text) to authenticated;
