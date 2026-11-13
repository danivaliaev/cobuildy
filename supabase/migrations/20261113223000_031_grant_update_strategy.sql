-- The app saves the project type with the rest of the profile, so the owner needs to be able to update the column.
grant update (strategy) on public.projects to authenticated;
