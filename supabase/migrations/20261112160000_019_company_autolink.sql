-- A project is linked to its owner's company automatically, whenever the company is created or the project is created.
-- Before this, a project made before the company profile was filled stayed unlinked and investors saw an empty Sponsor block.
create or replace function public.link_company_to_projects() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.projects set company_id = new.id where owner_id = new.owner_id and company_id is null;
  return new;
end $$;
revoke all on function public.link_company_to_projects() from public, anon, authenticated;
drop trigger if exists trg_company_link on public.companies;
create trigger trg_company_link after insert on public.companies for each row execute function public.link_company_to_projects();

create or replace function public.project_default_company() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.company_id is null then
    select c.id into new.company_id from public.companies c where c.owner_id = new.owner_id order by c.created_at limit 1;
  end if;
  return new;
end $$;
revoke all on function public.project_default_company() from public, anon, authenticated;
drop trigger if exists trg_project_company on public.projects;
create trigger trg_project_company before insert on public.projects for each row execute function public.project_default_company();

-- backfill existing projects
update public.projects p set company_id = (select c.id from public.companies c where c.owner_id = p.owner_id order by c.created_at limit 1)
 where p.company_id is null and exists (select 1 from public.companies c where c.owner_id = p.owner_id);
