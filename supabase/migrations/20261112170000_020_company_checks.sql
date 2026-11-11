-- Cobuildy verifies four facts about a sponsor (registry, website, financials, references). Only staff can set them,
-- every change is logged with a note saying what was checked, and the developer is notified when a check passes.

-- A developer must not be able to mark their own company as verified: grant only the columns they fill in.
revoke insert, update, truncate, references, trigger on public.companies from authenticated;
grant insert (owner_id, name, website, founded, delivered, volume_m, units, active, team, refs) on public.companies to authenticated;
grant update (name, website, founded, delivered, volume_m, units, active, team, refs) on public.companies to authenticated;

create table public.company_checks (
  company_id uuid not null references public.companies(id) on delete cascade,
  check_key text not null check (check_key in ('registry', 'web', 'fin', 'refs')),
  note text,
  checked_by uuid,
  checked_at timestamptz not null default now(),
  primary key (company_id, check_key)
);
alter table public.company_checks enable row level security;
create policy company_checks_staff on public.company_checks for select to authenticated using (public.is_staff());
revoke all on public.company_checks from anon, authenticated;
grant select on public.company_checks to authenticated;

create function public.set_company_check(p_company uuid, p_check text, p_passed boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.companies; was boolean; label text; note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if p_check not in ('registry', 'web', 'fin', 'refs') then raise exception 'unknown check'; end if;
  select * into c from public.companies where id = p_company;
  if not found then raise exception 'company not found'; end if;
  if p_passed and note is null then raise exception 'Add a note: what was checked, and where'; end if;
  was := case p_check when 'registry' then c.ver_registry when 'web' then c.ver_web when 'fin' then c.ver_fin else c.ver_refs end;
  label := case p_check when 'registry' then 'Registry' when 'web' then 'Website' when 'fin' then 'Financials' else 'References' end;
  update public.companies set
    ver_registry = case when p_check = 'registry' then p_passed else ver_registry end,
    ver_web = case when p_check = 'web' then p_passed else ver_web end,
    ver_fin = case when p_check = 'fin' then p_passed else ver_fin end,
    ver_refs = case when p_check = 'refs' then p_passed else ver_refs end
   where id = p_company;
  insert into public.company_checks (company_id, check_key, note, checked_by, checked_at) values (p_company, p_check, note, auth.uid(), now())
    on conflict (company_id, check_key) do update set note = excluded.note, checked_by = excluded.checked_by, checked_at = excluded.checked_at;
  insert into public.audit_log (actor_id, action, table_name, row_id, data)
    values (auth.uid(), 'company_check_set', 'companies', p_company::text, jsonb_build_object('check', p_check, 'passed', p_passed, 'note', note));
  if p_passed and not was then
    perform public.notify(c.owner_id, 'verified', 'Verified by Cobuildy: ' || label, 'Investors see this in your sponsor profile.', '/settings');
  end if;
end $$;
revoke all on function public.set_company_check(uuid, text, boolean, text) from public, anon;
grant execute on function public.set_company_check(uuid, text, boolean, text) to authenticated;

create function public.admin_companies()
returns table (company_id uuid, name text, website text, founded int, delivered int, volume_m numeric, refs int, owner_email text, projects bigint,
               ver_registry boolean, ver_web boolean, ver_fin boolean, ver_refs boolean, notes jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  return query
  select c.id, c.name, c.website, c.founded, c.delivered, c.volume_m, c.refs, u.email::text,
         (select count(*) from public.projects p where p.company_id = c.id),
         c.ver_registry, c.ver_web, c.ver_fin, c.ver_refs,
         coalesce((select jsonb_object_agg(k.check_key, jsonb_build_object('note', k.note, 'at', k.checked_at)) from public.company_checks k where k.company_id = c.id), '{}'::jsonb)
    from public.companies c left join auth.users u on u.id = c.owner_id
   order by c.created_at desc;
end $$;
revoke all on function public.admin_companies() from public, anon;
grant execute on function public.admin_companies() to authenticated;
