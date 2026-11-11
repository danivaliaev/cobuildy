-- For each investor the match list now also says which of the investor's hard criteria cannot be checked yet
-- because the project has not filled that fact in. These are the reasons behind the "needs info" bucket.
drop function public.match_project_info(uuid);
create function public.match_project_info(p_project uuid)
returns table (investor_id uuid, code text, bucket text, score integer, kind text, country text, missing text[])
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select m.investor_id, m.code, m.bucket, m.score, i.kind, i.country,
         array_remove(array[
           case when cardinality(i.geos) > 0 and p.geo is null then 'geo' end,
           case when cardinality(i.assets) > 0 and p.asset is null then 'asset' end,
           case when cardinality(i.instruments) > 0 and cardinality(p.instrument) = 0 then 'instrument' end,
           case when (i.ticket_min is not null or i.ticket_max is not null) and p.ask_eur is null then 'ticket' end,
           case when i.min_license is not null and i.min_license <> 'none' and p.license is null then 'license' end
         ], null)
    from public.match_project(p_project) m
    join public.investors i on i.id = m.investor_id
    join public.projects p on p.id = p_project;
end $$;
revoke all on function public.match_project_info(uuid) from public, anon;
grant execute on function public.match_project_info(uuid) to authenticated;
