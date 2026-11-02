-- Professional-club fixtures and results for the favourite-teams feature (additive; nothing existing changes).
-- Filled by importer/import.mjs (--sql). Separate from public.matches, which holds coach-recorded games.
-- Source-agnostic: source = 'bbc' (PoC) or 'apifootball' (paid plan, for launch). Re-running the upsert is safe.
create table if not exists public.pro_matches (
  source text not null,
  source_ref text not null,                -- date|home|away, stable across polls
  teams text[] not null,                   -- which favourite clubs this game belongs to (slugs)
  comp text,
  match_date date not null,
  kickoff text,
  home text not null,
  away text not null,
  home_goals int,
  away_goals int,
  status text not null check (status in ('scheduled','live','finished','other')),
  raw_status text,
  updated_at timestamptz not null default now(),
  primary key (source, source_ref)
);
create index if not exists pro_matches_date on public.pro_matches (match_date);
alter table public.pro_matches enable row level security;
-- Any signed-in user can read; nobody can write from the app (the importer writes with the owner connection).
create policy pro_matches_read on public.pro_matches for select to authenticated using (true);
grant select on public.pro_matches to authenticated;
