-- What the developer is doing with the project: land development, work in progress, refurbishment, acquisition.
alter table public.projects add column if not exists strategy text;
alter table public.projects drop constraint if exists projects_strategy_check;
alter table public.projects add constraint projects_strategy_check check (strategy is null or strategy in ('land', 'wip', 'refurb', 'acq'));

-- Projects made before this field existed keep their stage: the type is marked "to be confirmed" (a partly met answer still opens the teaser gate).
update public.projects
set profile = jsonb_set(profile, '{fields,a_strategy}', '{"st":"partial","v":"To be confirmed","n":null,"src":"system"}'::jsonb, true)
where status <> 'discarded' and profile ? 'fields' and not (profile->'fields' ? 'a_strategy');
