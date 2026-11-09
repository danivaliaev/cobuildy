-- Public "request an invitation" form on the landing page. Anyone may insert; only staff may read or change.
create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 5 and 200 and email = lower(email) and email like '%_@_%._%'),
  role text not null check (role in ('developer','investor')),
  context text check (char_length(context) <= 500),
  status text not null default 'new' check (status in ('new','invited','dismissed')),
  created_at timestamptz not null default now()
);
create unique index access_requests_open_email on public.access_requests (email) where status = 'new';
alter table public.access_requests enable row level security;
create policy access_requests_insert on public.access_requests for insert to anon, authenticated with check (status = 'new');
create policy access_requests_staff_read on public.access_requests for select to authenticated using (public.is_staff());
create policy access_requests_staff_update on public.access_requests for update to authenticated using (public.is_staff()) with check (public.is_staff());
revoke all on public.access_requests from anon, authenticated;
grant insert (name, email, role, context) on public.access_requests to anon, authenticated;
grant select on public.access_requests to authenticated;
grant update (status) on public.access_requests to authenticated;
