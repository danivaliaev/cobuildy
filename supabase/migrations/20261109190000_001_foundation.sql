create extension if not exists pgcrypto;

create type public.user_role as enum ('admin','expert','developer','investor');
create type public.invite_status as enum ('pending','approved','sent','accepted','revoked');
create type public.project_status as enum ('draft','teaser_review','approved','live','closed_won','closed_lost','discarded');
create type public.deal_stage as enum ('sent','interested','nda_sent','room','shared','qa','answered','ts','call','passed');

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- people ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role public.user_role not null,
  company_name text,
  note text,
  status public.invite_status not null default 'pending',
  invited_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_email_lower check (email = lower(email))
);
create unique index invitations_one_open_per_email on public.invitations (email) where status <> 'revoked';

create function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin','expert'), false)
$$;
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- ---------- registration only by approved invitation ----------
create function public.enforce_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.invitations i
                 where i.email = lower(new.email) and i.status in ('approved','sent')) then
    raise exception 'Registration is by invitation only';
  end if;
  return new;
end $$;
create trigger enforce_invite_before_user before insert on auth.users
  for each row execute function public.enforce_invite();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.invitations;
begin
  select * into inv from public.invitations
   where email = lower(new.email) and status in ('approved','sent')
   order by created_at desc limit 1;
  insert into public.profiles (id, role, full_name)
  values (new.id, inv.role, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  update public.invitations set status = 'accepted', accepted_at = now() where id = inv.id;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- developer side ----------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  website text,
  founded int,
  delivered int not null default 0,
  volume_m numeric not null default 0,
  units int not null default 0,
  active int not null default 0,
  team int not null default 0,
  refs int not null default 0,
  ver_registry boolean not null default false,
  ver_web boolean not null default false,
  ver_fin boolean not null default false,
  ver_refs boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger companies_touch before update on public.companies for each row execute function public.touch_updated_at();

create sequence public.project_code_seq start 1;
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('P-' || lpad(nextval('public.project_code_seq')::text, 3, '0')),
  company_id uuid references public.companies(id) on delete set null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  status public.project_status not null default 'draft',
  geo text,
  city text,
  asset text,
  instrument text[] not null default '{}',
  ask_eur numeric,
  cost_eur numeric,
  gdv_eur numeric,
  ltc numeric,
  margin numeric,
  license text check (license in ('none','submitted','granted')),
  presales numeric,
  units int,
  build_months int,
  term_months int,
  expected_return numeric,
  profile jsonb not null default '{}',
  readiness int not null default 0,
  stage int not null default 0,
  teaser jsonb,
  teaser_approved_by uuid references public.profiles(id),
  teaser_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner on public.projects(owner_id);
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();

create table public.project_docs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null,
  title text not null,
  storage_path text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- investor side ----------
create table public.investors (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text,
  name text not null,
  crm_id text unique,
  category text,
  crm_owner text,
  user_id uuid unique references public.profiles(id) on delete set null,
  instruments text[] not null default '{}',
  geos text[] not null default '{}',
  assets text[] not null default '{}',
  ticket_min numeric,
  ticket_max numeric,
  min_license text check (min_license in ('none','submitted','granted')),
  max_ltc numeric,
  min_return numeric,
  max_term int,
  min_track int,
  min_margin numeric,
  min_presales numeric,
  declared_qualified_at timestamptz,
  kyc_status text not null default 'none' check (kyc_status in ('none','pending','passed','failed')),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger investors_touch before update on public.investors for each row execute function public.touch_updated_at();

-- ---------- deals ----------
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  investor_id uuid not null references public.investors(id) on delete cascade,
  wave int not null default 1,
  stage public.deal_stage not null default 'sent',
  reason text,
  shared_docs uuid[] not null default '{}',
  call_slot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, investor_id)
);
create trigger deals_touch before update on public.deals for each row execute function public.touch_updated_at();

create table public.deal_events (
  id bigint generated always as identity primary key,
  deal_id uuid not null references public.deals(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  side text,
  kind text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.deal_messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  author_id uuid references public.profiles(id),
  side text not null check (side in ('investor','developer','agent')),
  kind text not null check (kind in ('question','answer','note')),
  body text not null,
  created_at timestamptz not null default now()
);
create table public.ndas (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null unique references public.deals(id) on delete cascade,
  sent_at timestamptz not null default now(),
  signed_dev_at timestamptz,
  signed_inv_at timestamptz,
  provider text,
  provider_ref text
);
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  table_name text,
  row_id text,
  data jsonb not null default '{}',
  at timestamptz not null default now()
);

-- ---------- access helpers ----------
create function public.can_see_deal(d uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff()
      or exists (select 1 from public.deals x join public.projects p on p.id = x.project_id
                 where x.id = d and p.owner_id = auth.uid())
      or exists (select 1 from public.deals x join public.investors i on i.id = x.investor_id
                 where x.id = d and i.user_id = auth.uid())
$$;

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.companies enable row level security;
alter table public.projects enable row level security;
alter table public.project_docs enable row level security;
alter table public.investors enable row level security;
alter table public.deals enable row level security;
alter table public.deal_events enable row level security;
alter table public.deal_messages enable row level security;
alter table public.ndas enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy inv_read on public.invitations for select to authenticated using (public.is_staff());
create policy inv_create on public.invitations for insert to authenticated with check (public.is_staff() and status = 'pending');
create policy inv_admin_update on public.invitations for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy companies_owner on public.companies for all to authenticated
  using (owner_id = auth.uid() or public.is_staff()) with check (owner_id = auth.uid() or public.is_staff());

create policy projects_owner_read on public.projects for select to authenticated using (owner_id = auth.uid() or public.is_staff());
create policy projects_owner_insert on public.projects for insert to authenticated
  with check ((owner_id = auth.uid() and status = 'draft' and public.my_role() = 'developer') or public.is_staff());
create policy projects_owner_update on public.projects for update to authenticated
  using (owner_id = auth.uid() or public.is_staff()) with check (owner_id = auth.uid() or public.is_staff());
create policy projects_investor_after_nda on public.projects for select to authenticated using (
  exists (select 1 from public.deals d join public.investors i on i.id = d.investor_id
          where d.project_id = projects.id and i.user_id = auth.uid()
            and d.stage in ('room','shared','qa','answered','ts','call')));

create policy docs_owner on public.project_docs for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = auth.uid() or public.is_staff())))
  with check (exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = auth.uid() or public.is_staff())));
create policy docs_investor_shared on public.project_docs for select to authenticated using (
  exists (select 1 from public.deals d join public.investors i on i.id = d.investor_id
          where d.project_id = project_docs.project_id and i.user_id = auth.uid()
            and d.stage in ('shared','qa','answered','ts','call') and project_docs.id = any (d.shared_docs)));

create policy investors_staff on public.investors for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy investors_self_read on public.investors for select to authenticated using (user_id = auth.uid());
create policy investors_self_update on public.investors for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy deals_read on public.deals for select to authenticated using (public.can_see_deal(id));
create policy deal_events_read on public.deal_events for select to authenticated using (public.can_see_deal(deal_id));
create policy deal_messages_read on public.deal_messages for select to authenticated using (public.can_see_deal(deal_id));
create policy ndas_read on public.ndas for select to authenticated using (public.can_see_deal(deal_id));
create policy audit_staff on public.audit_log for select to authenticated using (public.is_staff());

-- ---------- privileges: nothing for anon, narrow writes for signed-in users ----------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

revoke insert, update, delete on public.deals, public.deal_events, public.deal_messages, public.ndas, public.audit_log from authenticated;
revoke insert, delete on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;
revoke update on public.projects from authenticated;
grant update (company_id, title, geo, city, asset, instrument, ask_eur, cost_eur, gdv_eur, ltc, margin, license, presales, units, build_months, term_months, expected_return, profile, readiness, stage, teaser) on public.projects to authenticated;
revoke update on public.investors from authenticated;
grant update (name, instruments, geos, assets, ticket_min, ticket_max, min_license, max_ltc, min_return, max_term, min_track, min_margin, min_presales) on public.investors to authenticated;
revoke update on public.invitations from authenticated;
grant update (status, approved_by, approved_at, sent_at) on public.invitations to authenticated;

-- first administrator: invitation only, no email is sent by this row
insert into public.invitations (email, role, status, approved_at, note)
values ('dv@cobuildy.com', 'admin', 'approved', now(), 'Founder, created at setup');
