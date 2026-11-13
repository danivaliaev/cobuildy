-- Investors loaded from the CRM have no login, so they cannot answer a teaser themselves.
-- Staff record the reply they received outside the platform (email, call, WhatsApp...). The deal moves exactly as if the investor
-- had answered, and the record keeps who entered it, through which channel, and when.

create function public.record_investor_reply(p_deal uuid, p_reply text, p_channel text, p_note text default null)
returns public.deal_stage
language plpgsql security definer set search_path = public as $$
declare d public.deals; inv public.investors; v_new public.deal_stage; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if p_reply not in ('interest','pass') then raise exception 'bad reply'; end if;
  if p_channel not in ('email','phone','whatsapp','linkedin','meeting','other') then raise exception 'bad channel'; end if;
  select * into d from public.deals where id = p_deal for update;
  if d.id is null then raise exception 'deal not found'; end if;
  select * into inv from public.investors where id = d.investor_id;
  if inv.user_id is not null then raise exception 'this investor has their own login and answers themselves'; end if;
  if p_reply = 'interest' then
    if d.stage <> 'sent' then raise exception 'interest can be recorded only while the teaser is waiting for an answer'; end if;
    v_new := 'interested';
    update public.deals set stage = v_new where id = d.id;
  else
    if d.stage = 'passed' then raise exception 'already passed'; end if;
    v_new := 'passed';
    update public.deals set stage = v_new, reason = coalesce(v_note, 'Not for us') where id = d.id;
  end if;
  insert into public.deal_events (deal_id, actor_id, side, kind, payload)
  values (d.id, auth.uid(), 'staff', 'recorded_' || p_reply, jsonb_build_object('channel', p_channel, 'note', v_note));
  insert into public.audit_log (actor_id, action, table_name, row_id, data)
  values (auth.uid(), 'investor_reply_recorded', 'deals', d.id::text, jsonb_build_object('reply', p_reply, 'channel', p_channel, 'note', v_note, 'investor', inv.code));
  return v_new;
end $$;
revoke all on function public.record_investor_reply(uuid, text, text, text) from public, anon;
grant execute on function public.record_investor_reply(uuid, text, text, text) to authenticated;

-- Staff list: investors without a login who have been sent a teaser and not yet answered, plus the replies already recorded.
create function public.admin_investor_replies()
returns table (deal_id uuid, project_code text, project_title text, investor_code text, investor_name text, investor_category text,
               stage public.deal_stage, sent_at timestamptz, reply text, channel text, note text, recorded_by text, recorded_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  return query
  select d.id, p.code, p.title, i.code, i.name, i.category, d.stage, d.created_at,
         replace(e.kind, 'recorded_', ''), e.payload->>'channel', e.payload->>'note', pr.full_name, e.created_at
    from public.deals d
    join public.projects p on p.id = d.project_id
    join public.investors i on i.id = d.investor_id
    left join lateral (select * from public.deal_events x where x.deal_id = d.id and x.kind like 'recorded\_%' order by x.id desc limit 1) e on true
    left join public.profiles pr on pr.id = e.actor_id
   where i.user_id is null and (d.stage = 'sent' or e.id is not null)
   order by (d.stage = 'sent') desc, coalesce(e.created_at, d.created_at) desc;
end $$;
revoke all on function public.admin_investor_replies() from public, anon;
grant execute on function public.admin_investor_replies() to authenticated;

-- The developer sees that the reply was entered by the Cobuildy team, and through which channel.
drop function public.project_deals(uuid);
create function public.project_deals(p_project uuid)
returns table (deal_id uuid, investor_code text, investor_kind text, stage public.deal_stage, reason text, investor_name text, call_slot text, nda_dev_signed boolean, nda_inv_signed boolean, recorded_channel text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (exists (select 1 from public.projects where id = p_project and owner_id = auth.uid()) or public.is_staff()) then
    raise exception 'not allowed';
  end if;
  return query
  select d.id, i.code, i.kind, d.stage, d.reason,
         case when d.stage in ('interested','nda_sent','room','shared','qa','answered','ts','call') or public.is_staff() then i.name end,
         d.call_slot, (n.signed_dev_at is not null), (n.signed_inv_at is not null),
         (select x.payload->>'channel' from public.deal_events x where x.deal_id = d.id and x.kind like 'recorded\_%' order by x.id desc limit 1)
    from public.deals d join public.investors i on i.id = d.investor_id left join public.ndas n on n.deal_id = d.id
   where d.project_id = p_project;
end $$;
revoke all on function public.project_deals(uuid) from public, anon;
grant execute on function public.project_deals(uuid) to authenticated;
