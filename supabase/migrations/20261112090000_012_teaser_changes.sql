-- After a teaser is approved the developer may still correct the key figures. Every such change is dated, Cobuildy is told,
-- and investors who hold the teaser are told what changed and see a "Data updated" mark.
alter table public.projects add column if not exists teaser_changed_at timestamptz;

create or replace function public.trg_project_key_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.geo, new.asset, new.instrument, new.ask_eur, new.cost_eur, new.gdv_eur, new.ltc, new.margin, new.license, new.units)
     is distinct from (old.geo, old.asset, old.instrument, old.ask_eur, old.cost_eur, old.gdv_eur, old.ltc, old.margin, old.license, old.units) then
    new.teaser_changed_at := now();
  end if;
  return new;
end $$;
revoke all on function public.trg_project_key_guard() from public, anon, authenticated;
create trigger project_key_guard before update on public.projects for each row
  when (new.status in ('approved', 'live')) execute function public.trg_project_key_guard();

create or replace function public.fmt_change(p_label text, p_old numeric, p_new numeric, p_kind text) returns text
language sql immutable set search_path = public as $$
  select case when p_old is not distinct from p_new then null
    else p_label || ' ' || case p_kind
      when 'eur' then coalesce('€' || round(p_old / 1e6, 2) || 'M', '—') || ' → ' || coalesce('€' || round(p_new / 1e6, 2) || 'M', '—')
      when 'pct' then coalesce(round(p_old * 100) || '%', '—') || ' → ' || coalesce(round(p_new * 100) || '%', '—')
      else coalesce(p_old::text, '—') || ' → ' || coalesce(p_new::text, '—') end end
$$;
revoke all on function public.fmt_change(text, numeric, numeric, text) from public, anon, authenticated;

create or replace function public.trg_project_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare parts text[]; txt text; s record; d record;
begin
  parts := array_remove(array[
    public.fmt_change('Ask', old.ask_eur, new.ask_eur, 'eur'), public.fmt_change('Cost', old.cost_eur, new.cost_eur, 'eur'), public.fmt_change('GDV', old.gdv_eur, new.gdv_eur, 'eur'),
    public.fmt_change('Margin', old.margin, new.margin, 'pct'), public.fmt_change('LTC', old.ltc, new.ltc, 'pct'), public.fmt_change('Units', old.units, new.units, 'n'),
    case when old.geo is distinct from new.geo then 'Region ' || coalesce(old.geo, '—') || ' → ' || coalesce(new.geo, '—') end,
    case when old.asset is distinct from new.asset then 'Asset ' || coalesce(old.asset, '—') || ' → ' || coalesce(new.asset, '—') end,
    case when old.instrument is distinct from new.instrument then 'Instrument ' || coalesce(array_to_string(old.instrument, '/'), '—') || ' → ' || coalesce(array_to_string(new.instrument, '/'), '—') end,
    case when old.license is distinct from new.license then 'Licence ' || coalesce(old.license, '—') || ' → ' || coalesce(new.license, '—') end
  ], null);
  txt := array_to_string(parts, '; ');
  if txt = '' then return new; end if;
  for s in select id from public.profiles where role in ('admin', 'expert') loop
    perform public.notify(s.id, 'changed', 'Teaser data changed: ' || new.code, txt, '/admin');
  end loop;
  for d in select dl.id, i.user_id from public.deals dl join public.investors i on i.id = dl.investor_id where dl.project_id = new.id and dl.stage <> 'passed' loop
    perform public.notify(d.user_id, 'changed', new.code || ': project data updated', txt, '/investor?tab=deal&deal=' || d.id);
  end loop;
  return new;
end $$;
revoke all on function public.trg_project_changed() from public, anon, authenticated;
create trigger project_changed after update on public.projects for each row
  when (new.teaser_changed_at is distinct from old.teaser_changed_at) execute function public.trg_project_changed();

-- Investors see when the figures changed after they received the teaser.
drop function public.list_teasers();
create function public.list_teasers()
returns table (deal_id uuid, stage public.deal_stage, project_code text, geo text, asset text, instrument text[], ask_eur numeric, cost_eur numeric, gdv_eur numeric,
               margin numeric, license text, units int, build_months int, presales numeric, sponsor_years int, sponsor_delivered int, sponsor_volume_m numeric,
               sponsor_checks int, changed_at timestamptz, sent_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.stage, p.code, p.geo, p.asset, p.instrument, p.ask_eur, p.cost_eur, p.gdv_eur, p.margin, p.license, p.units, p.build_months, p.presales,
         case when c.founded is null then null else extract(year from now())::int - c.founded end, c.delivered, c.volume_m,
         (c.ver_registry::int + c.ver_web::int + c.ver_fin::int + c.ver_refs::int), p.teaser_changed_at, d.created_at
    from public.deals d
    join public.investors i on i.id = d.investor_id and i.user_id = (select auth.uid())
    join public.projects p on p.id = d.project_id
    left join public.companies c on c.id = p.company_id
$$;
revoke all on function public.list_teasers() from public, anon;
grant execute on function public.list_teasers() to authenticated;
