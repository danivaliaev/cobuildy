-- ================= matching =================
-- Unknown never excludes. Hard criteria: geo, asset, instrument, ticket. Licence gap = "later". Soft criteria only rank.
create function public.match_project(p_project uuid)
returns table (investor_id uuid, code text, bucket text, score int)
language plpgsql stable security definer set search_path = public as $$
declare p public.projects; c public.companies;
begin
  select * into p from public.projects where id = p_project;
  if p.id is null then raise exception 'project not found'; end if;
  if not (p.owner_id = auth.uid() or public.is_staff()) then raise exception 'not allowed'; end if;
  select * into c from public.companies where id = p.company_id;

  return query
  with t as (
    select i.id, i.code as icode,
      case when cardinality(i.geos) = 0 then 1 when p.geo is null then null when p.geo = any (i.geos) then 1 else 0 end as g,
      case when cardinality(i.assets) = 0 then 1 when p.asset is null then null when p.asset = any (i.assets) then 1 else 0 end as a,
      case when cardinality(i.instruments) = 0 then 1 when cardinality(p.instrument) = 0 then null when p.instrument && i.instruments then 1 else 0 end as ins,
      case when i.ticket_min is null and i.ticket_max is null then 1 when p.ask_eur is null then null
           when p.ask_eur >= coalesce(i.ticket_min, 0) and p.ask_eur <= coalesce(i.ticket_max, 1e18) then 1 else 0 end as tk,
      case when i.min_license is null or i.min_license = 'none' then 1 when p.license is null then null
           when (case p.license when 'none' then 0 when 'submitted' then 1 else 2 end) >= (case i.min_license when 'submitted' then 1 else 2 end) then 1 else 0 end as lic,
      case when i.max_ltc is null then 2 when p.ltc is null then null when p.ltc <= i.max_ltc then 1 else 0 end as s_ltc,
      case when i.min_return is null then 2 when p.expected_return is null then null when p.expected_return >= i.min_return then 1 else 0 end as s_ret,
      case when i.max_term is null then 2 when p.term_months is null then null when p.term_months <= i.max_term then 1 else 0 end as s_term,
      case when i.min_track is null then 2 when c.id is null then null when c.delivered >= i.min_track then 1 else 0 end as s_trk,
      case when i.min_margin is null then 2 when p.margin is null then null when p.margin >= i.min_margin then 1 else 0 end as s_mar,
      case when i.min_presales is null then 2 when p.presales is null then null when p.presales >= i.min_presales then 1 else 0 end as s_pre
    from public.investors i where i.active
  ), s as (
    select t.*,
      (select count(*) from unnest(array[s_ltc, s_ret, s_term, s_trk, s_mar, s_pre]) v where v is distinct from 2) as n,
      (select coalesce(sum(case when v = 1 then 1.0 when v is null then 0.5 else 0 end), 0)
         from unnest(array[s_ltc, s_ret, s_term, s_trk, s_mar, s_pre]) v where v is distinct from 2) as pts
    from t
  )
  select s.id, s.icode,
    case when 0 in (g, a, ins, tk) then 'out'
         when lic = 0 then 'later'
         when g is null or a is null or ins is null or tk is null or lic is null then 'possible'
         else 'fit' end,
    case when n = 0 then 70 else round(100 * pts / n)::int end
  from s;
end $$;

-- ================= invitations (admin decides, nothing is emailed here) =================
create function public.approve_invite(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.invitations set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_id and status = 'pending';
  if not found then raise exception 'invitation is not pending'; end if;
  insert into public.audit_log (actor_id, action, table_name, row_id) values (auth.uid(), 'invite_approved', 'invitations', p_id::text);
end $$;

create function public.revoke_invite(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.invitations set status = 'revoked' where id = p_id and status in ('pending','approved','sent');
  if not found then raise exception 'nothing to revoke'; end if;
  insert into public.audit_log (actor_id, action, table_name, row_id) values (auth.uid(), 'invite_revoked', 'invitations', p_id::text);
end $$;

-- ================= teaser review =================
create function public.submit_teaser(p_project uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.projects set status = 'teaser_review'
   where id = p_project and owner_id = auth.uid() and status = 'draft' and stage >= 1;
  if not found then raise exception 'project is not ready for a teaser review'; end if;
  insert into public.audit_log (actor_id, action, table_name, row_id) values (auth.uid(), 'teaser_submitted', 'projects', p_project::text);
end $$;

create function public.approve_teaser(p_project uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  update public.projects set status = 'approved', teaser_approved_by = auth.uid(), teaser_approved_at = now()
   where id = p_project and status = 'teaser_review';
  if not found then raise exception 'no teaser waiting for review'; end if;
  insert into public.audit_log (actor_id, action, table_name, row_id) values (auth.uid(), 'teaser_approved', 'projects', p_project::text);
end $$;

-- ================= outreach: the developer confirms each wave =================
create function public.launch_wave(p_project uuid, p_wave int, p_investors uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from public.projects where id = p_project and owner_id = auth.uid() and status in ('approved','live')) then
    raise exception 'the teaser must be approved by an expert first';
  end if;
  with ok as (select investor_id from public.match_project(p_project) where bucket in ('fit','possible') and investor_id = any (p_investors)),
  ins as (insert into public.deals (project_id, investor_id, wave) select p_project, investor_id, p_wave from ok
          on conflict (project_id, investor_id) do nothing returning id)
  select count(*) into n from ins;
  update public.projects set status = 'live' where id = p_project and status = 'approved';
  insert into public.audit_log (actor_id, action, table_name, row_id, data)
  values (auth.uid(), 'wave_launched', 'projects', p_project::text, jsonb_build_object('wave', p_wave, 'created', n));
  return n;
end $$;

-- ================= investor self-service steps =================
create function public.investor_declare() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.investors set declared_qualified_at = now() where user_id = auth.uid();
  if not found then raise exception 'no investor profile for this user'; end if;
end $$;

create function public.set_kyc(p_investor uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if p_status not in ('none','pending','passed','failed') then raise exception 'bad status'; end if;
  update public.investors set kyc_status = p_status where id = p_investor;
  insert into public.audit_log (actor_id, action, table_name, row_id, data)
  values (auth.uid(), 'kyc_set', 'investors', p_investor::text, jsonb_build_object('status', p_status));
end $$;

-- ================= the deal state machine =================
create function public.deal_action(p_deal uuid, p_action text, p_payload jsonb default '{}')
returns public.deal_stage
language plpgsql security definer set search_path = public as $$
declare
  d public.deals; inv public.investors; n public.ndas;
  v_dev boolean; v_inv boolean; v_side text; v_new public.deal_stage; q text; docs uuid[];
begin
  select * into d from public.deals where id = p_deal for update;
  if d.id is null then raise exception 'deal not found'; end if;
  select * into inv from public.investors where id = d.investor_id;
  v_dev := exists (select 1 from public.projects where id = d.project_id and owner_id = auth.uid());
  v_inv := inv.user_id is not null and inv.user_id = auth.uid();
  if not (v_dev or v_inv) then raise exception 'not allowed'; end if;
  v_side := case when v_dev then 'developer' else 'investor' end;
  v_new := d.stage;

  if p_action = 'interest' then
    if not v_inv or d.stage <> 'sent' then raise exception 'cannot express interest now'; end if;
    v_new := 'interested'; update public.deals set reason = p_payload->>'reason' where id = d.id;
  elsif p_action = 'accept' then
    if not v_dev or d.stage <> 'interested' then raise exception 'nothing to accept'; end if;
    v_new := 'nda_sent'; insert into public.ndas (deal_id) values (d.id) on conflict (deal_id) do nothing;
  elsif p_action = 'decline' then
    if not v_dev or d.stage in ('sent','passed','call') then raise exception 'cannot decline now'; end if;
    v_new := 'passed'; update public.deals set reason = coalesce(p_payload->>'reason', 'Declined by the developer') where id = d.id;
  elsif p_action = 'pass' then
    if not v_inv or d.stage = 'passed' then raise exception 'cannot pass now'; end if;
    v_new := 'passed'; update public.deals set reason = p_payload->>'reason' where id = d.id;
  elsif p_action = 'sign_nda' then
    if d.stage <> 'nda_sent' then raise exception 'no NDA to sign'; end if;
    if v_inv and (inv.declared_qualified_at is null or inv.kyc_status <> 'passed') then
      raise exception 'complete the investor declaration and identity check first';
    end if;
    if v_dev then update public.ndas set signed_dev_at = coalesce(signed_dev_at, now()) where deal_id = d.id;
    else update public.ndas set signed_inv_at = coalesce(signed_inv_at, now()) where deal_id = d.id; end if;
    select * into n from public.ndas where deal_id = d.id;
    if n.signed_dev_at is not null and n.signed_inv_at is not null then v_new := 'room'; end if;
  elsif p_action = 'share_docs' then
    if not v_dev or d.stage <> 'room' then raise exception 'data room is not ready'; end if;
    select coalesce(array_agg(x.id), '{}') into docs from public.project_docs x
     where x.project_id = d.project_id and x.id in (select (jsonb_array_elements_text(coalesce(p_payload->'docs','[]')))::uuid);
    update public.deals set shared_docs = docs where id = d.id; v_new := 'shared';
  elsif p_action = 'ask' then
    if not v_inv or d.stage <> 'shared' then raise exception 'cannot ask now'; end if;
    for q in select jsonb_array_elements_text(coalesce(p_payload->'questions','[]')) loop
      insert into public.deal_messages (deal_id, author_id, side, kind, body) values (d.id, auth.uid(), 'investor', 'question', q);
    end loop;
    v_new := 'qa';
  elsif p_action = 'answer' then
    if not v_dev or d.stage <> 'qa' then raise exception 'no questions to answer'; end if;
    for q in select jsonb_array_elements_text(coalesce(p_payload->'answers','[]')) loop
      insert into public.deal_messages (deal_id, author_id, side, kind, body) values (d.id, auth.uid(), 'developer', 'answer', q);
    end loop;
    v_new := 'answered';
  elsif p_action = 'request_ts' then
    if not v_inv or d.stage <> 'answered' then raise exception 'cannot request a term sheet discussion now'; end if;
    v_new := 'ts';
  elsif p_action = 'confirm_call' then
    if not v_dev or d.stage <> 'ts' then raise exception 'no call to confirm'; end if;
    v_new := 'call'; update public.deals set call_slot = p_payload->>'slot' where id = d.id;
  else
    raise exception 'unknown action %', p_action;
  end if;

  update public.deals set stage = v_new where id = d.id;
  insert into public.deal_events (deal_id, actor_id, side, kind, payload) values (d.id, auth.uid(), v_side, p_action, p_payload);
  return v_new;
end $$;

-- ================= what each side is allowed to see =================
-- Investor: anonymised teasers of the deals sent to them. Never the developer name or website.
create function public.list_teasers()
returns table (deal_id uuid, stage public.deal_stage, project_code text, geo text, asset text, instrument text[], ask_eur numeric, cost_eur numeric, gdv_eur numeric,
               margin numeric, license text, units int, build_months int, presales numeric, sponsor_years int, sponsor_delivered int, sponsor_volume_m numeric,
               sponsor_checks int)
language sql stable security definer set search_path = public as $$
  select d.id, d.stage, p.code, p.geo, p.asset, p.instrument, p.ask_eur, p.cost_eur, p.gdv_eur, p.margin, p.license, p.units, p.build_months, p.presales,
         case when c.founded is null then null else extract(year from now())::int - c.founded end, c.delivered, c.volume_m,
         (c.ver_registry::int + c.ver_web::int + c.ver_fin::int + c.ver_refs::int)
    from public.deals d
    join public.investors i on i.id = d.investor_id and i.user_id = auth.uid()
    join public.projects p on p.id = d.project_id
    left join public.companies c on c.id = p.company_id
   where d.stage <> 'passed' or true
$$;

-- Developer: investors on their project. The name is shown only after both sides signed the NDA.
create function public.project_deals(p_project uuid)
returns table (deal_id uuid, investor_code text, investor_kind text, stage public.deal_stage, reason text, investor_name text, call_slot text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (exists (select 1 from public.projects where id = p_project and owner_id = auth.uid()) or public.is_staff()) then
    raise exception 'not allowed';
  end if;
  return query
  select d.id, i.code, i.kind, d.stage, d.reason,
         case when d.stage in ('room','shared','qa','answered','ts','call') or public.is_staff() then i.name end,
         d.call_slot
    from public.deals d join public.investors i on i.id = d.investor_id
   where d.project_id = p_project;
end $$;

-- ================= function privileges =================
revoke all on function public.match_project(uuid), public.approve_invite(uuid), public.revoke_invite(uuid), public.submit_teaser(uuid), public.approve_teaser(uuid),
  public.launch_wave(uuid, int, uuid[]), public.investor_declare(), public.set_kyc(uuid, text), public.deal_action(uuid, text, jsonb),
  public.list_teasers(), public.project_deals(uuid), public.my_role(), public.is_staff(), public.is_admin(), public.can_see_deal(uuid) from public, anon;
grant execute on function public.match_project(uuid), public.approve_invite(uuid), public.revoke_invite(uuid), public.submit_teaser(uuid), public.approve_teaser(uuid),
  public.launch_wave(uuid, int, uuid[]), public.investor_declare(), public.set_kyc(uuid, text), public.deal_action(uuid, text, jsonb),
  public.list_teasers(), public.project_deals(uuid), public.my_role(), public.is_staff(), public.is_admin(), public.can_see_deal(uuid) to authenticated;
