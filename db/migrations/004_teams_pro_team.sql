-- Which professional club a team follows (slug, e.g. 'rangers'). Additive, nullable. Read by the importer and the app.
alter table public.teams add column if not exists pro_team text;
