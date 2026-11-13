-- Wider vocabulary for investor criteria, so the CRM can be loaded without losing anything.
-- Regions: ES (all Spain), PT (all Portugal), EU (all Europe), XES (other Spain), XX (outside Iberia) next to the eight regions.
-- Assets: COM, LND, LOG, PBS, OTH next to RES, BTR, HOS. A country or Europe covers the regions inside it.
alter table public.investors add column if not exists crm jsonb;
comment on column public.investors.crm is 'What the CRM said, as text: type, category, instrument, ticket, geographies, assets. Kept next to the platform criteria derived from it.';

create or replace function public.geo_match(inv text[], proj text) returns boolean
language sql immutable set search_path = public as $$
  select proj = any (inv)
      or ('EU' = any (inv) and proj <> 'XX')
      or ('ES' = any (inv) and proj in ('CS', 'BCN', 'MAD', 'VLC', 'ISL', 'XES'))
      or ('PT' = any (inv) and proj in ('LIS', 'OPO', 'ALG'))
$$;

create or replace function public.match_project(p_project uuid)
returns table (investor_id uuid, code text, bucket text, score int)
language plpgsql stable security definer set search_path = public as $$
declare p public.projects; c public.companies;
begin
  select * into p from public.projects where id = p_project;
  if p.id is null then raise exception 'project not found'; end if;
  if not (p.owner_id = auth.uid() or public.is_staff()) then raise exception 'not allowed'; end if;
  select * into c from public.companies where id = p.company_id;

  return query
  with t as (
    select i.id, i.code as icode,
      case when cardinality(i.geos) = 0 then 2 when p.geo is null then null when public.geo_match(i.geos, p.geo) then 1 else 0 end as sc_g,
      case when cardinality(i.assets) = 0 then 2 when p.asset is null then null when p.asset = any (i.assets) then 1 else 0 end as sc_a,
      case when cardinality(i.instruments) = 0 then 2 when cardinality(p.instrument) = 0 then null when p.instrument && i.instruments then 1 else 0 end as sc_ins,
      case when i.ticket_min is null and i.ticket_max is null then 2 when p.ask_eur is null then null
           when p.ask_eur >= coalesce(i.ticket_min, 0) and p.ask_eur <= coalesce(i.ticket_max, 1e18) then 1 else 0 end as sc_tk,
      case when i.min_license is null or i.min_license = 'none' then 2 when p.license is null then null
           when (case p.license when 'none' then 0 when 'submitted' then 1 else 2 end) >= (case i.min_license when 'submitted' then 1 else 2 end) then 1 else 0 end as sc_lic,
      case when cardinality(i.geos) = 0 then 1 when p.geo is null then null when public.geo_match(i.geos, p.geo) then 1 else 0 end as g,
      case when cardinality(i.assets) = 0 then 1 when p.asset is null then null when p.asset = any (i.assets) then 1 else 0 end as a,
      case when cardinality(i.instruments) = 0 then 1 when cardinality(p.instrument) = 0 then null when p.instrument && i.instruments then 1 else 0 end as ins,
      case when i.ticket_min is null and i.ticket_max is null then 1 when p.ask_eur is null then null
           when p.ask_eur >= coalesce(i.ticket_min, 0) and p.ask_eur <= coalesce(i.ticket_max, 1e18) then 1 else 0 end as tk,
      case when i.min_license is null or i.min_license = 'none' then 1 when p.license is null then null
           when (case p.license when 'none' then 0 when 'submitted' then 1 else 2 end) >= (case i.min_license when 'submitted' then 1 else 2 end) then 1 else 0 end as lic,
      case when i.max_ltc is null then 2 when p.ltc is null then null when p.ltc <= i.max_ltc then 1 else 0 end as s_ltc,
      case when i.min_return is null then 2 when p.expected_return is null then null when p.expected_return >= i.min_return then 1 else 0 end as s_ret,
      case when i.max_term is null then 2 when p.term_months is null then null when p.term_months <= i.max_term then 1 else 0 end as s_term,
      case when i.min_track is null then 2 when c.id is null then null when c.delivered >= i.min_track then 1 else 0 end as s_trk,
      case when i.min_margin is null then 2 when p.margin is null then null when p.margin >= i.min_margin then 1 else 0 end as s_mar,
      case when i.min_presales is null then 2 when p.presales is null then null when p.presales >= i.min_presales then 1 else 0 end as s_pre
    from public.investors i where i.active
  ), s as (
    select t.*,
      (select count(*) from unnest(array[sc_g, sc_a, sc_ins, sc_tk, sc_lic, s_ltc, s_ret, s_term, s_trk, s_mar, s_pre]) v where v is distinct from 2) as n,
      (select coalesce(sum(case when v = 1 then 1.0 when v is null then 0.5 else 0 end), 0)
         from unnest(array[sc_g, sc_a, sc_ins, sc_tk, sc_lic, s_ltc, s_ret, s_term, s_trk, s_mar, s_pre]) v where v is distinct from 2) as pts
    from t
  )
  select s.id, s.icode,
    case when 0 in (g, a, ins, tk) then 'out'
         when lic = 0 then 'later'
         when g is null or a is null or ins is null or tk is null or lic is null then 'possible'
         else 'fit' end,
    case when n = 0 then 100 else round(100 * pts / n)::int end
  from s;
end $$;
