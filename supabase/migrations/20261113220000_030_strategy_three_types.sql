-- Project type is land development, work in progress or refurbishment. Buying a finished property is out of scope.
alter table public.projects drop constraint if exists projects_strategy_check;
alter table public.projects add constraint projects_strategy_check check (strategy is null or strategy in ('land', 'wip', 'refurb'));
