-- Public funnel (/start): a visitor who is not signed in sees how many investors are in the network and how many of them could fit.
-- Only counts leave the database, never investor names or criteria.
-- XPT: a project elsewhere in Portugal (next to XES for elsewhere in Spain). A Portugal-wide mandate covers it.

create or replace function public.geo_match(inv text[], proj text) returns boolean
language sql immutable set search_path = public as $$
  select proj = any (inv)
      or ('EU' = any (inv) and proj <> 'XX')
      or ('ES' = any (inv) and proj in ('CS', 'BCN', 'MAD', 'VLC', 'ISL', 'XES'))
      or ('PT' = any (inv) and proj in ('LIS', 'OPO', 'ALG', 'XPT'))
$$;

create function public.funnel_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('investors', count(*)) from public.investors where active
$$;
revoke all on function public.funnel_stats() from public;
grant execute on function public.funnel_stats() to anon, authenticated;

-- high:   the investor states both a region and a ticket range, the project fits them, and every other stated criterion (permit, leverage, margin) is met
-- medium: region and ticket are not contradicted, but the investor left one of them open, or another stated criterion is not met yet
-- low:    region fits and the ask is within a factor of two of the investor's ticket range
-- Asset type and instrument are not asked in the funnel, so they do not count here.
create or replace function public.funnel_match(p_geo text, p_ask numeric, p_license text, p_ltc numeric, p_margin numeric) returns jsonb
language sql stable security definer set search_path = public as $$
  with t as (
    select
      (cardinality(i.geos) = 0 or (p_geo is not null and public.geo_match(i.geos, p_geo))) as g,
      (i.ticket_min is null and i.ticket_max is null) or (p_ask >= coalesce(i.ticket_min, 0) and p_ask <= coalesce(i.ticket_max, 1e18)) as tk,
      (p_ask >= coalesce(i.ticket_min, 0) / 2 and p_ask <= coalesce(i.ticket_max, 1e18) * 2) as near,
      (cardinality(i.geos) > 0 and (i.ticket_min is not null or i.ticket_max is not null)) as explicit,
      not coalesce(
        (i.min_license in ('submitted','granted') and (case p_license when 'granted' then 2 when 'submitted' then 1 else 0 end) < (case i.min_license when 'granted' then 2 else 1 end))
        or (i.max_ltc is not null and p_ltc is not null and p_ltc > i.max_ltc)
        or (i.min_margin is not null and p_margin is not null and p_margin < i.min_margin), false) as soft_ok
    from public.investors i where i.active
  )
  select jsonb_build_object(
    'total', (select count(*) from public.investors where active),
    'high', count(*) filter (where g and tk and explicit and soft_ok),
    'medium', count(*) filter (where g and tk and not (explicit and soft_ok)),
    'low', count(*) filter (where g and not tk and near))
  from t
$$;
revoke all on function public.funnel_match(text, numeric, text, numeric, numeric) from public;
grant execute on function public.funnel_match(text, numeric, text, numeric, numeric) to anon, authenticated;
