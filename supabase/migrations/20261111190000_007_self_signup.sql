-- Self-service registration (Google or email link). Anyone may create an account; roles are chosen afterwards.
-- Only developer and investor can be self-selected. admin and expert still come only from an approved invitation.

drop trigger if exists enforce_invite_before_user on auth.users;
drop function if exists public.enforce_invite();

-- A new auth user gets a profile at once only when an approved invitation exists for the address.
-- Otherwise the app shows the onboarding screen, which calls complete_signup().
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.invitations;
begin
  select * into inv from public.invitations
   where email = lower(new.email) and status in ('approved','sent')
   order by created_at desc limit 1;
  if not found then return new; end if;
  insert into public.profiles (id, role, full_name)
  values (new.id, inv.role, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  update public.invitations set status = 'accepted', accepted_at = now() where id = inv.id;
  if inv.role = 'investor' then
    update public.investors set user_id = new.id where lower(email) = lower(new.email) and user_id is null;
    if not found then
      insert into public.investors (code, name, email, user_id)
      values ('I-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6),
              coalesce(inv.company_name, split_part(new.email, '@', 1)), lower(new.email), new.id);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.complete_signup(p_role public.user_role, p_name text, p_company text default null)
returns public.user_role
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  em text;
  nm text := left(btrim(coalesce(p_name, '')), 120);
  co text := left(btrim(coalesce(p_company, '')), 160);
begin
  if uid is null then raise exception 'Please sign in first'; end if;
  if p_role not in ('developer', 'investor') then raise exception 'Choose developer or investor'; end if;
  if exists (select 1 from public.profiles where id = uid) then raise exception 'Your profile already exists'; end if;
  if nm = '' then raise exception 'Please enter your name'; end if;
  select lower(email) into em from auth.users where id = uid;

  insert into public.profiles (id, role, full_name) values (uid, p_role, nm);

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
revoke all on function public.complete_signup(public.user_role, text, text) from public, anon;
grant execute on function public.complete_signup(public.user_role, text, text) to authenticated;
