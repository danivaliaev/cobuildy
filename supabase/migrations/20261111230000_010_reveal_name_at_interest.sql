-- The developer sees who is behind an investor code as soon as that investor expresses interest, before any NDA is signed.
-- Before interest (stage 'sent') and after a pass, the name stays hidden.
create or replace function public.project_deals(p_project uuid)
returns table (deal_id uuid, investor_code text, investor_kind text, stage public.deal_stage, reason text, investor_name text, call_slot text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (exists (select 1 from public.projects where id = p_project and owner_id = auth.uid()) or public.is_staff()) then
    raise exception 'not allowed';
  end if;
  return query
  select d.id, i.code, i.kind, d.stage, d.reason,
         case when d.stage in ('interested','nda_sent','room','shared','qa','answered','ts','call') or public.is_staff() then i.name end,
         d.call_slot
    from public.deals d join public.investors i on i.id = d.investor_id
   where d.project_id = p_project;
end $$;
revoke all on function public.project_deals(uuid) from public, anon;
grant execute on function public.project_deals(uuid) to authenticated;
