-- A developer who signs up without having left a phone number (top-of-page sign-in on the landing) is asked for it during onboarding.
drop function if exists public.complete_signup(public.user_role, text, text);
create function public.complete_signup(p_role public.user_role, p_name text, p_company text default null, p_phone text default null)
returns public.user_role
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  em text;
  nm text := left(btrim(coalesce(p_name, '')), 120);
  co text := left(btrim(coalesce(p_company, '')), 160);
  ph text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if uid is null then raise exception 'Please sign in first'; end if;
  if p_role not in ('developer', 'investor') then raise exception 'Choose developer or investor'; end if;
  if exists (select 1 from public.profiles where id = uid) then raise exception 'Your profile already exists'; end if;
  if nm = '' then raise exception 'Please enter your name'; end if;
  if ph is not null and (ph !~ '^\+?[0-9 ()./-]{7,24}$' or length(regexp_replace(ph, '[^0-9]', '', 'g')) < 7) then raise exception 'Enter a valid phone number'; end if;
  select lower(email) into em from auth.users where id = uid;

  insert into public.profiles (id, role, full_name, phone) values (uid, p_role, nm, ph);

  if p_role = 'developer' then
    if co <> '' then insert into public.companies (owner_id, name) values (uid, co); end if;
  else
    update public.investors set user_id = uid where lower(email) = em and user_id is null;
    if not found then
      insert into public.investors (code, name, email, user_id)
      values ('I-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6), coalesce(nullif(co, ''), nm), em, uid);
    end if;
  end if;
  return p_role;
end $$;
revoke all on function public.complete_signup(public.user_role, text, text, text) from public, anon;
grant execute on function public.complete_signup(public.user_role, text, text, text) to authenticated;
