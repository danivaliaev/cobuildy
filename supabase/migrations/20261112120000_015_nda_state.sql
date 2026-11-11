-- Both sides see who has signed the NDA, so a signature is visible straight away even while the other side has not signed.
drop function public.project_deals(uuid);
create function public.project_deals(p_project uuid)
returns table (deal_id uuid, investor_code text, investor_kind text, stage public.deal_stage, reason text, investor_name text, call_slot text, nda_dev_signed boolean, nda_inv_signed boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (exists (select 1 from public.projects where id = p_project and owner_id = auth.uid()) or public.is_staff()) then
    raise exception 'not allowed';
  end if;
  return query
  select d.id, i.code, i.kind, d.stage, d.reason,
         case when d.stage in ('interested','nda_sent','room','shared','qa','answered','ts','call') or public.is_staff() then i.name end,
         d.call_slot, (n.signed_dev_at is not null), (n.signed_inv_at is not null)
    from public.deals d join public.investors i on i.id = d.investor_id left join public.ndas n on n.deal_id = d.id
   where d.project_id = p_project;
end $$;
revoke all on function public.project_deals(uuid) from public, anon;
grant execute on function public.project_deals(uuid) to authenticated;

drop function public.list_teasers();
create function public.list_teasers()
returns table (deal_id uuid, stage public.deal_stage, project_code text, geo text, asset text, instrument text[], ask_eur numeric, cost_eur numeric, gdv_eur numeric,
               margin numeric, license text, units int, build_months int, presales numeric, sponsor_years int, sponsor_delivered int, sponsor_volume_m numeric,
               sponsor_checks int, changed_at timestamptz, sent_at timestamptz, nda_dev_signed boolean, nda_inv_signed boolean)
language sql stable security definer set search_path = public as $$
  select d.id, d.stage, p.code, p.geo, p.asset, p.instrument, p.ask_eur, p.cost_eur, p.gdv_eur, p.margin, p.license, p.units, p.build_months, p.presales,
         case when c.founded is null then null else extract(year from now())::int - c.founded end, c.delivered, c.volume_m,
         (c.ver_registry::int + c.ver_web::int + c.ver_fin::int + c.ver_refs::int), p.teaser_changed_at, d.created_at,
         (n.signed_dev_at is not null), (n.signed_inv_at is not null)
    from public.deals d
    join public.investors i on i.id = d.investor_id and i.user_id = (select auth.uid())
    join public.projects p on p.id = d.project_id
    left join public.companies c on c.id = p.company_id
    left join public.ndas n on n.deal_id = d.id
$$;
revoke all on function public.list_teasers() from public, anon;
grant execute on function public.list_teasers() to authenticated;
