-- Current stage of the project (depends on the project type). Projects made earlier keep their stage: the new answer is marked "to be confirmed".
update public.projects
set profile = jsonb_set(profile, '{fields,a_stage}', '{"st":"partial","v":"To be confirmed","n":null,"src":"system"}'::jsonb, true)
where status <> 'discarded' and profile ? 'fields' and not (profile->'fields' ? 'a_stage');
