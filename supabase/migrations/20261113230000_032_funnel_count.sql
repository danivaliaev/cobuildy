-- Landing chat: how many investors still fit after the visitor has answered some of the questions. A missing answer never excludes anyone.
-- Same rules as funnel_match for region and ticket (high + medium there). Only counts leave the database.
create or replace function public.funnel_count(p_geo text, p_ask numeric) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', count(*),
    'match', count(*) filter (where
      (p_geo is null or cardinality(i.geos) = 0 or public.geo_match(i.geos, p_geo))
      and (p_ask is null or (i.ticket_min is null and i.ticket_max is null) or (p_ask >= coalesce(i.ticket_min, 0) and p_ask <= coalesce(i.ticket_max, 1e18)))))
  from public.investors i where i.active
$$;
revoke all on function public.funnel_count(text, numeric) from public;
grant execute on function public.funnel_count(text, numeric) to anon, authenticated;
