-- In-app notifications. Rows are written only by the triggers below (security definer); a user can read and mark their own.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy notifications_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_mark on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link) select p_user, p_kind, p_title, p_body, p_link where p_user is not null;
$$;
revoke all on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

-- A teaser reaches an investor.
create or replace function public.trg_deal_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.projects; iu uuid;
begin
  select * into p from public.projects where id = new.project_id;
  select user_id into iu from public.investors where id = new.investor_id;
  perform public.notify(iu, 'teaser', 'New teaser: ' || p.code, 'A developer sent you a project that fits your mandate.', '/investor?tab=deal&deal=' || new.id);
  return new;
end $$;
revoke all on function public.trg_deal_created() from public, anon, authenticated;
create trigger deal_created after insert on public.deals for each row execute function public.trg_deal_created();

-- Every step of a deal tells the other side.
create or replace function public.trg_deal_stage() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.projects; i public.investors; who text; dl text; il text;
begin
  select * into p from public.projects where id = new.project_id;
  select * into i from public.investors where id = new.investor_id;
  -- the name is shown only once the investor has expressed interest
  who := case when old.stage = 'sent' then i.code else i.name end;
  dl := '/developer/projects/' || p.id || '?tab=investors';
  il := '/investor?tab=deal&deal=' || new.id;
  case new.stage
    when 'interested' then perform public.notify(p.owner_id, 'interest', i.name || ' is interested in ' || p.code, 'Accept to send the NDA, or decline.', dl);
    when 'nda_sent' then perform public.notify(i.user_id, 'nda', p.code || ': NDA is ready to sign', 'The developer accepted your interest.', il);
    when 'passed' then
      if auth.uid() = p.owner_id then perform public.notify(i.user_id, 'passed', p.code || ': the developer declined', new.reason, il);
      else perform public.notify(p.owner_id, 'passed', who || ' passed on ' || p.code, new.reason, dl); end if;
    when 'room' then
      perform public.notify(p.owner_id, 'room', 'NDA signed by both sides: ' || p.code, 'Choose which documents to share with ' || i.name || '.', '/developer/projects/' || p.id || '?tab=room');
      perform public.notify(i.user_id, 'room', p.code || ': NDA signed by both sides', 'The developer is preparing the data room.', il);
    when 'shared' then perform public.notify(i.user_id, 'docs', p.code || ': documents shared', 'Review them and send your questions.', il);
    when 'qa' then perform public.notify(p.owner_id, 'qa', i.name || ' sent questions on ' || p.code, 'Answer them to keep the process moving.', dl);
    when 'answered' then perform public.notify(i.user_id, 'answers', p.code || ': the developer answered', 'Read the answers or ask for a term sheet discussion.', il);
    when 'ts' then perform public.notify(p.owner_id, 'ts', i.name || ' wants a term sheet discussion', p.code || ': confirm a call slot.', dl);
    when 'call' then perform public.notify(i.user_id, 'call', p.code || ': call confirmed', new.call_slot, il);
    else null;
  end case;
  return new;
end $$;
revoke all on function public.trg_deal_stage() from public, anon, authenticated;
create trigger deal_stage after update of stage on public.deals for each row when (old.stage is distinct from new.stage) execute function public.trg_deal_stage();

-- One side signed the NDA, the other has not yet.
create or replace function public.trg_nda_signed() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.projects; i public.investors; d public.deals;
begin
  select * into d from public.deals where id = new.deal_id;
  select * into p from public.projects where id = d.project_id;
  select * into i from public.investors where id = d.investor_id;
  if new.signed_inv_at is not null and old.signed_inv_at is null and new.signed_dev_at is null then
    perform public.notify(p.owner_id, 'nda', i.name || ' signed the NDA', 'Sign it too to open the data room for ' || p.code || '.', '/developer/projects/' || p.id || '?tab=investors');
  elsif new.signed_dev_at is not null and old.signed_dev_at is null and new.signed_inv_at is null then
    perform public.notify(i.user_id, 'nda', p.code || ': the developer signed the NDA', 'Sign it too to open the data room.', '/investor?tab=deal&deal=' || d.id);
  end if;
  return new;
end $$;
revoke all on function public.trg_nda_signed() from public, anon, authenticated;
create trigger nda_signed after update on public.ndas for each row execute function public.trg_nda_signed();

-- Teaser review.
create or replace function public.trg_project_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if new.status = 'teaser_review' then
    for s in select id from public.profiles where role in ('admin', 'expert') loop
      perform public.notify(s.id, 'review', 'Teaser waiting for review: ' || new.code, new.title, '/admin');
    end loop;
  elsif new.status = 'approved' then
    perform public.notify(new.owner_id, 'approved', 'Teaser approved: ' || new.code, 'You can now send it to matching investors.', '/developer/projects/' || new.id || '?tab=investors');
  end if;
  return new;
end $$;
revoke all on function public.trg_project_status() from public, anon, authenticated;
create trigger project_status after update of status on public.projects for each row when (old.status is distinct from new.status) execute function public.trg_project_status();

-- Identity check result.
create or replace function public.trg_kyc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kyc_status = 'passed' then perform public.notify(new.user_id, 'kyc', 'Identity check passed', 'You can now sign NDAs and open data rooms.', '/investor');
  elsif new.kyc_status = 'failed' then perform public.notify(new.user_id, 'kyc', 'Identity check not passed', 'Cobuildy will contact you.', '/investor'); end if;
  return new;
end $$;
revoke all on function public.trg_kyc() from public, anon, authenticated;
create trigger kyc_changed after update of kyc_status on public.investors for each row when (old.kyc_status is distinct from new.kyc_status) execute function public.trg_kyc();
