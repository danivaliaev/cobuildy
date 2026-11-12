-- The developer gets a bell notice when the teaser goes to review (it used to be a banner on the project page).
create or replace function public.trg_project_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if new.status = 'teaser_review' then
    perform public.notify(new.owner_id, 'review', 'Teaser sent for review: ' || new.code, 'Cobuildy reviews it before any investor sees it. You will be notified once it is approved.', '/developer/projects/' || new.id);
    for s in select id from public.profiles where role in ('admin', 'expert') loop
      perform public.notify(s.id, 'review', 'Teaser waiting for review: ' || new.code, new.title, '/admin');
    end loop;
  elsif new.status = 'approved' then
    perform public.notify(new.owner_id, 'approved', 'Teaser approved: ' || new.code, 'You can now send it to matching investors.', '/developer/projects/' || new.id || '?tab=investors');
  end if;
  return new;
end $$;
