-- Investor onboarding: kind, country and phone. The developer sees kind and country (never the name or phone) in the match list.
alter table public.investors add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$');
alter table public.investors add column if not exists phone text check (phone is null or char_length(phone) <= 30);

create or replace function public.check_investor_profile(p_kind text, p_country text, p_phone text) returns void
language plpgsql immutable set search_path = public as $$
begin
  if p_kind is null or p_kind not in ('fund', 'family_office', 'crowdfunding', 'hnwi', 'bank') then raise exception 'Choose an investor type'; end if;
  if coalesce(p_country, '') !~ '^[A-Z]{2}$' then raise exception 'Choose a country'; end if;
  if coalesce(p_phone, '') !~ '^\+?[0-9 ()./-]{7,24}$' or length(regexp_replace(p_phone, '[^0-9]', '', 'g')) < 7 then raise exception 'Enter a valid phone number'; end if;
end $$;
revoke all on function public.check_investor_profile(text, text, text) from public, anon, authenticated;

-- First sign-in as an investor.
create or replace function public.complete_investor_signup(p_name text, p_firm text, p_kind text, p_country text, p_phone text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); em text;
  nm text := left(btrim(coalesce(p_name, '')), 120); firm text := left(btrim(coalesce(p_firm, '')), 160); ph text := left(btrim(coalesce(p_phone, '')), 30);
  mandate jsonb;
begin
  if uid is null then raise exception 'Please sign in first'; end if;
  if exists (select 1 from public.profiles where id = uid) then raise exception 'Your profile already exists'; end if;
  if nm = '' then raise exception 'Please enter your name'; end if;
  if firm = '' then raise exception 'Please enter the name of your fund, bank, office or platform'; end if;
  perform public.check_investor_profile(p_kind, p_country, ph);
  select lower(email) into em from auth.users where id = uid;
  mandate := jsonb_build_object('type', case when p_kind in ('fund', 'crowdfunding', 'bank') then 'inst' else 'priv' end, 'st', jsonb_build_object('type', 'filled'));

  insert into public.profiles (id, role, full_name) values (uid, 'investor', nm);
  update public.investors set user_id = uid, kind = p_kind, country = p_country, phone = ph, mandate = coalesce(investors.mandate, '{}'::jsonb) || mandate
   where lower(email) = em and user_id is null;
  if not found then
    insert into public.investors (code, name, email, user_id, kind, country, phone, mandate)
    values ('I-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6), firm, em, uid, p_kind, p_country, ph, mandate);
  end if;
end $$;
revoke all on function public.complete_investor_signup(text, text, text, text, text) from public, anon;
grant execute on function public.complete_investor_signup(text, text, text, text, text) to authenticated;

-- Later edits of the same facts by the investor.
create or replace function public.update_investor_profile(p_name text, p_kind text, p_country text, p_phone text)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); firm text := left(btrim(coalesce(p_name, '')), 160); ph text := left(btrim(coalesce(p_phone, '')), 30); t text;
begin
  if uid is null then raise exception 'Please sign in first'; end if;
  if firm = '' then raise exception 'Please enter a name'; end if;
  perform public.check_investor_profile(p_kind, p_country, ph);
  t := case when p_kind in ('fund', 'crowdfunding', 'bank') then 'inst' else 'priv' end;
  update public.investors
     set name = firm, kind = p_kind, country = p_country, phone = ph,
         mandate = coalesce(mandate, '{}'::jsonb) || jsonb_build_object('type', t, 'st', coalesce(mandate -> 'st', '{}'::jsonb) || '{"type":"filled"}'::jsonb)
   where user_id = uid;
  if not found then raise exception 'No investor profile for this user'; end if;
end $$;
revoke all on function public.update_investor_profile(text, text, text, text) from public, anon;
grant execute on function public.update_investor_profile(text, text, text, text) to authenticated;

-- Match list for a developer's project, with the investor's kind and country. Name and phone are never returned.
create or replace function public.match_project_info(p_project uuid)
returns table (investor_id uuid, code text, bucket text, score integer, kind text, country text)
language plpgsql stable security definer set search_path = public as $$
begin
  return query select m.investor_id, m.code, m.bucket, m.score, i.kind, i.country
    from public.match_project(p_project) m join public.investors i on i.id = m.investor_id;
end $$;
revoke all on function public.match_project_info(uuid) from public, anon;
grant execute on function public.match_project_info(uuid) to authenticated;
