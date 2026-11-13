-- The funnel report says where a visitor started (the Meta page or the main site's chat) and returns all their answers.
-- Sessions saved before this change all came from the Meta page, so a missing entry means 'meta'.
drop function if exists public.admin_funnel_report(int);
create function public.admin_funnel_report(p_days int default 30, p_entry text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := case when p_days is null or p_days <= 0 then '-infinity'::timestamptz else now() - make_interval(days => p_days) end;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  return jsonb_build_object(
    'steps', (select coalesce(jsonb_agg(c order by k), '[]') from (
        select k, (select count(*) from public.funnel_sessions f where f.created_at >= since and f.step >= k and (p_entry is null or coalesce(f.source->>'entry', 'meta') = p_entry)) as c from generate_series(0, 8) k) x),
    'completed', (select count(*) from public.funnel_sessions where created_at >= since and completed_at is not null and (p_entry is null or coalesce(source->>'entry', 'meta') = p_entry)),
    'cta', (select count(*) from public.funnel_sessions where created_at >= since and cta_at is not null and (p_entry is null or coalesce(source->>'entry', 'meta') = p_entry)),
    'registered', (select count(*) from public.funnel_sessions where created_at >= since and user_id is not null and (p_entry is null or coalesce(source->>'entry', 'meta') = p_entry)),
    'campaigns', (select coalesce(jsonb_agg(to_jsonb(c) order by c.started desc), '[]') from (
        select coalesce(source->>'entry', 'meta') as entry,
               coalesce(nullif(source->>'utm_campaign', ''), nullif(source->>'utm_source', ''), '(none)') as campaign,
               count(*) as started, count(*) filter (where step >= 8) as contacts, count(*) filter (where completed_at is not null) as completed,
               count(*) filter (where user_id is not null) as registered
          from public.funnel_sessions where created_at >= since and (p_entry is null or coalesce(source->>'entry', 'meta') = p_entry) group by 1, 2) c),
    'leads', (select coalesce(jsonb_agg(to_jsonb(l) order by l.at desc), '[]') from (
        select id, updated_at as at, name, phone, step, score, completed_at is not null as completed, cta_at is not null as cta, user_id is not null as registered,
               answers, coalesce(source->>'entry', 'meta') as entry,
               coalesce(nullif(source->>'utm_campaign', ''), nullif(source->>'utm_source', ''), '(none)') as campaign
          from public.funnel_sessions where created_at >= since and (phone is not null or step >= 7) and (p_entry is null or coalesce(source->>'entry', 'meta') = p_entry)
          order by updated_at desc limit 150) l)
  );
end $$;
revoke all on function public.admin_funnel_report(int, text) from public, anon;
grant execute on function public.admin_funnel_report(int, text) to authenticated;
