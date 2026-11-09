alter table public.investors add column email text;
create unique index investors_email_unique on public.investors (lower(email)) where email is not null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.invitations;
begin
  select * into inv from public.invitations
   where email = lower(new.email) and status in ('approved','sent')
   order by created_at desc limit 1;
  insert into public.profiles (id, role, full_name)
  values (new.id, inv.role, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
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
