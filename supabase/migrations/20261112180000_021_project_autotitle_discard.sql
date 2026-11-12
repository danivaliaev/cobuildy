-- New project without asking for a name: the title builds itself from the answers.
-- create_project() reuses an untouched draft instead of piling up empty ones.
-- discard_project() lets the owner remove a draft (soft: status 'discarded', audited).

alter table public.projects add column if not exists title_auto boolean not null default false;

create or replace function public.auto_project_title() returns trigger
language plpgsql set search_path = public as $$
declare geo_l text; asset_l text; t text;
begin
  if new.title_auto then
    geo_l := case new.geo when 'CS' then 'Costa del Sol' when 'BCN' then 'Barcelona' when 'MAD' then 'Madrid' when 'VLC' then 'Valencia'
                          when 'ISL' then 'Balearics / Canaries' when 'LIS' then 'Lisbon' when 'OPO' then 'Porto' when 'ALG' then 'Algarve' end;
    asset_l := case new.asset when 'RES' then 'Residential for sale' when 'BTR' then 'Build-to-rent' when 'HOS' then 'Hospitality' end;
    t := coalesce(nullif(concat_ws(' · ', coalesce(nullif(btrim(new.city), ''), geo_l), asset_l), ''), 'New project');
    if tg_op = 'UPDATE' and new.title is distinct from old.title and new.title is distinct from t then
      new.title_auto := false;  -- someone renamed it by hand: keep their name
    else
      new.title := t;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists projects_auto_title on public.projects;
create trigger projects_auto_title before insert or update on public.projects
  for each row execute function public.auto_project_title();

create or replace function public.create_project() returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); pid uuid; cid uuid;
begin
  if uid is null or public.my_role() is distinct from 'developer' then
    raise exception 'developers only' using errcode = '42501';
  end if;
  select id into pid from public.projects
   where owner_id = uid and status = 'draft' and title_auto and profile = '{}'::jsonb and readiness = 0
   order by created_at desc limit 1;
  if pid is not null then return pid; end if;
  select id into cid from public.companies where owner_id = uid limit 1;
  insert into public.projects (title, owner_id, company_id, status, title_auto)
    values ('New project', uid, cid, 'draft', true) returning id into pid;
  return pid;
end $$;

create or replace function public.discard_project(p_project uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pr public.projects;
begin
  select * into pr from public.projects where id = p_project;
  if not found or (pr.owner_id is distinct from auth.uid() and not public.is_staff()) then
    raise exception 'project not found' using errcode = '42501';
  end if;
  if pr.status <> 'draft' then
    raise exception 'Only a draft can be deleted. Ask Cobuildy to withdraw a project that was already sent.' using errcode = '22023';
  end if;
  update public.projects set status = 'discarded' where id = p_project;
  insert into public.audit_log (actor_id, action, table_name, row_id, data)
    values (auth.uid(), 'project_discarded', 'projects', p_project::text, jsonb_build_object('code', pr.code, 'title', pr.title));
end $$;

revoke all on function public.create_project() from public, anon;
revoke all on function public.discard_project(uuid) from public, anon;
grant execute on function public.create_project() to authenticated;
grant execute on function public.discard_project(uuid) to authenticated;
