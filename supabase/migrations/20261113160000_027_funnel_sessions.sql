-- The public funnel (/meta, /start) saves every visit: where the visitor came from, how far they got, what they answered, and the name and phone
-- they left. Nobody reads the table directly: visitors write through funnel_save, staff read through admin_funnel_report,
-- and a visitor who registers claims their own session with funnel_claim.

alter table public.profiles add column if not exists phone text check (phone is null or char_length(phone) <= 30);

create table public.funnel_sessions (
  id uuid primary key,                       -- chosen by the visitor's browser, never guessable
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  step int not null default 0 check (step between 0 and 8),  -- questions answered (0-7), 8 = contact details left
  answers jsonb not null default '{}',
  source jsonb not null default '{}',        -- utm_*, fbclid seen, referrer host
  name text check (name is null or char_length(name) <= 120),
  phone text check (phone is null or char_length(phone) <= 30),
  score int check (score is null or score between 0 and 100),
  matches jsonb,
  completed_at timestamptz,                  -- saw the result
  cta_at timestamptz,                        -- pressed "Unlock your investor matches"
  user_id uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz
);
create index funnel_sessions_created_idx on public.funnel_sessions (created_at desc);
create index funnel_sessions_user_idx on public.funnel_sessions (user_id);
alter table public.funnel_sessions enable row level security;
revoke all on public.funnel_sessions from anon, authenticated;

create function public.funnel_save(p_id uuid, p_step int default null, p_answers jsonb default null, p_source jsonb default null,
                                   p_name text default null, p_phone text default null, p_result jsonb default null, p_cta boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_score int;
begin
  if p_id is null then raise exception 'missing id'; end if;
  if p_step is not null and p_step not between 0 and 8 then raise exception 'bad step'; end if;
  if pg_column_size(coalesce(p_answers, '{}'::jsonb)) > 2000 or pg_column_size(coalesce(p_source, '{}'::jsonb)) > 1500 or pg_column_size(coalesce(p_result, '{}'::jsonb)) > 1000 then
    raise exception 'too large';
  end if;
  if p_answers is not null and jsonb_typeof(p_answers) <> 'object' then raise exception 'bad answers'; end if;
  if p_source is not null and jsonb_typeof(p_source) <> 'object' then raise exception 'bad source'; end if;
  if v_name is not null and (char_length(v_name) < 2 or char_length(v_name) > 120) then raise exception 'Enter your name'; end if;
  if v_phone is not null and (v_phone !~ '^\+?[0-9 ()./-]{7,24}$' or length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 7) then raise exception 'Enter a valid phone number'; end if;
  v_score := case when p_result ? 'score' and (p_result->>'score') ~ '^\d{1,3}$' then least(100, (p_result->>'score')::int) end;

  insert into public.funnel_sessions (id, step, answers, source, name, phone, score, matches, completed_at, cta_at)
  values (p_id, coalesce(p_step, 0), coalesce(p_answers, '{}'), coalesce(p_source, '{}'), v_name, v_phone, v_score, p_result->'matches',
          case when p_result is not null then now() end, case when p_cta then now() end)
  on conflict (id) do update set
    step = greatest(public.funnel_sessions.step, coalesce(p_step, 0)),
    answers = coalesce(p_answers, public.funnel_sessions.answers),
    source = case when public.funnel_sessions.source = '{}' then coalesce(p_source, '{}') else public.funnel_sessions.source end,
    name = coalesce(v_name, public.funnel_sessions.name),
    phone = coalesce(v_phone, public.funnel_sessions.phone),
    score = coalesce(v_score, public.funnel_sessions.score),
    matches = coalesce(p_result->'matches', public.funnel_sessions.matches),
    completed_at = coalesce(public.funnel_sessions.completed_at, case when p_result is not null then now() end),
    cta_at = coalesce(public.funnel_sessions.cta_at, case when p_cta then now() end),
    updated_at = now();
end $$;
revoke all on function public.funnel_save(uuid, int, jsonb, jsonb, text, text, jsonb, boolean) from public;
grant execute on function public.funnel_save(uuid, int, jsonb, jsonb, text, text, jsonb, boolean) to anon, authenticated;

-- A visitor who registers takes their session: it is linked to the account, the phone goes to the profile, and the answers come back so the project can be built from them.
create function public.funnel_claim(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.funnel_sessions;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  update public.funnel_sessions set user_id = auth.uid(), claimed_at = now() where id = p_id and user_id is null;
  select * into s from public.funnel_sessions where id = p_id and user_id = auth.uid();
  if s.id is null then return null; end if;
  if s.phone is not null then update public.profiles set phone = coalesce(phone, s.phone) where id = auth.uid(); end if;
  return jsonb_build_object('answers', s.answers, 'name', s.name, 'phone', s.phone, 'score', s.score);
end $$;
revoke all on function public.funnel_claim(uuid) from public, anon;
grant execute on function public.funnel_claim(uuid) to authenticated;

-- Staff: how many reached each step, how the campaigns did, and the latest leads with their contact details.
create function public.admin_funnel_report(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := case when p_days is null or p_days <= 0 then '-infinity'::timestamptz else now() - make_interval(days => p_days) end;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  return jsonb_build_object(
    'steps', (select coalesce(jsonb_agg(c order by k), '[]') from (
        select k, (select count(*) from public.funnel_sessions f where f.created_at >= since and f.step >= k) as c from generate_series(0, 8) k) x),
    'completed', (select count(*) from public.funnel_sessions where created_at >= since and completed_at is not null),
    'cta', (select count(*) from public.funnel_sessions where created_at >= since and cta_at is not null),
    'registered', (select count(*) from public.funnel_sessions where created_at >= since and user_id is not null),
    'campaigns', (select coalesce(jsonb_agg(to_jsonb(c) order by c.started desc), '[]') from (
        select coalesce(nullif(source->>'utm_campaign', ''), nullif(source->>'utm_source', ''), '(direct)') as campaign,
               count(*) as started, count(*) filter (where step >= 8) as contacts, count(*) filter (where completed_at is not null) as completed,
               count(*) filter (where user_id is not null) as registered
          from public.funnel_sessions where created_at >= since group by 1) c),
    'leads', (select coalesce(jsonb_agg(to_jsonb(l) order by l.at desc), '[]') from (
        select id, updated_at as at, name, phone, step, score, completed_at is not null as completed, cta_at is not null as cta, user_id is not null as registered,
               answers->>'strategy' as strategy, answers->>'city' as city, answers->>'geo' as geo, (answers->>'ask')::numeric as ask,
               coalesce(nullif(source->>'utm_campaign', ''), nullif(source->>'utm_source', ''), '(direct)') as campaign
          from public.funnel_sessions where created_at >= since and (phone is not null or step >= 7) order by updated_at desc limit 150) l)
  );
end $$;
revoke all on function public.admin_funnel_report(int) from public, anon;
grant execute on function public.admin_funnel_report(int) to authenticated;
