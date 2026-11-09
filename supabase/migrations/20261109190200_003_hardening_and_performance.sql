alter function public.touch_updated_at() set search_path = public;

-- trigger functions are never called through the API
revoke all on function public.enforce_invite(), public.handle_new_user() from public, anon, authenticated;

-- teaser list: every deal sent to this investor
create or replace function public.list_teasers()
returns table (deal_id uuid, stage public.deal_stage, project_code text, geo text, asset text, instrument text[], ask_eur numeric, cost_eur numeric, gdv_eur numeric,
               margin numeric, license text, units int, build_months int, presales numeric, sponsor_years int, sponsor_delivered int, sponsor_volume_m numeric,
               sponsor_checks int)
language sql stable security definer set search_path = public as $$
  select d.id, d.stage, p.code, p.geo, p.asset, p.instrument, p.ask_eur, p.cost_eur, p.gdv_eur, p.margin, p.license, p.units, p.build_months, p.presales,
         case when c.founded is null then null else extract(year from now())::int - c.founded end, c.delivered, c.volume_m,
         (c.ver_registry::int + c.ver_web::int + c.ver_fin::int + c.ver_refs::int)
    from public.deals d
    join public.investors i on i.id = d.investor_id and i.user_id = (select auth.uid())
    join public.projects p on p.id = d.project_id
    left join public.companies c on c.id = p.company_id
$$;
revoke all on function public.list_teasers() from public, anon;
grant execute on function public.list_teasers() to authenticated;

-- foreign key indexes
create index companies_owner_idx on public.companies (owner_id);
create index projects_company_idx on public.projects (company_id);
create index projects_teaser_approved_by_idx on public.projects (teaser_approved_by);
create index project_docs_project_idx on public.project_docs (project_id);
create index deals_investor_idx on public.deals (investor_id);
create index deal_events_deal_idx on public.deal_events (deal_id);
create index deal_events_actor_idx on public.deal_events (actor_id);
create index deal_messages_deal_idx on public.deal_messages (deal_id);
create index deal_messages_author_idx on public.deal_messages (author_id);
create index invitations_approved_by_idx on public.invitations (approved_by);
create index invitations_invited_by_idx on public.invitations (invited_by);

-- policies: one permissive policy per action, auth.uid() evaluated once per query
drop policy profiles_read on public.profiles;
drop policy profiles_update_self on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (id = (select auth.uid()) or public.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy companies_owner on public.companies;
create policy companies_all on public.companies for all to authenticated
  using (owner_id = (select auth.uid()) or public.is_staff()) with check (owner_id = (select auth.uid()) or public.is_staff());

drop policy projects_owner_read on public.projects;
drop policy projects_owner_insert on public.projects;
drop policy projects_owner_update on public.projects;
drop policy projects_investor_after_nda on public.projects;
create policy projects_read on public.projects for select to authenticated using (
  owner_id = (select auth.uid()) or public.is_staff()
  or exists (select 1 from public.deals d join public.investors i on i.id = d.investor_id
             where d.project_id = projects.id and i.user_id = (select auth.uid())
               and d.stage in ('room','shared','qa','answered','ts','call')));
create policy projects_insert on public.projects for insert to authenticated
  with check ((owner_id = (select auth.uid()) and status = 'draft' and public.my_role() = 'developer') or public.is_staff());
create policy projects_update on public.projects for update to authenticated
  using (owner_id = (select auth.uid()) or public.is_staff()) with check (owner_id = (select auth.uid()) or public.is_staff());

drop policy docs_owner on public.project_docs;
drop policy docs_investor_shared on public.project_docs;
create policy docs_read on public.project_docs for select to authenticated using (
  exists (select 1 from public.projects p where p.id = project_docs.project_id and (p.owner_id = (select auth.uid()) or public.is_staff()))
  or exists (select 1 from public.deals d join public.investors i on i.id = d.investor_id
             where d.project_id = project_docs.project_id and i.user_id = (select auth.uid())
               and d.stage in ('shared','qa','answered','ts','call') and project_docs.id = any (d.shared_docs)));
create policy docs_insert on public.project_docs for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.is_staff())));
create policy docs_update on public.project_docs for update to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.is_staff())));
create policy docs_delete on public.project_docs for delete to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.is_staff())));

drop policy investors_staff on public.investors;
drop policy investors_self_read on public.investors;
drop policy investors_self_update on public.investors;
create policy investors_read on public.investors for select to authenticated using (public.is_staff() or user_id = (select auth.uid()));
create policy investors_insert on public.investors for insert to authenticated with check (public.is_staff());
create policy investors_update on public.investors for update to authenticated
  using (public.is_staff() or user_id = (select auth.uid())) with check (public.is_staff() or user_id = (select auth.uid()));
create policy investors_delete on public.investors for delete to authenticated using (public.is_staff());
