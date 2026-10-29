-- Touchline PoC schema (Neon Postgres + Data API, RLS by auth.user_id()).
-- Applied to Neon project aged-shape-39815755 (aws-eu-west-2), branch main.
create table public.teams (id text primary key, user_id text not null default auth.user_id(), name text not null default '', age text, ground text, primary_colour text, secondary_colour text, on_pitch int, periods int, period_mins int, updated_at timestamptz not null default now());
create table public.players (id text primary key, user_id text not null default auth.user_id(), team_id text not null references public.teams(id) on delete cascade, num int, name text not null default '', pos text, left_squad boolean not null default false, updated_at timestamptz not null default now());
create table public.matches (id text primary key, user_id text not null default auth.user_id(), team_id text not null references public.teams(id) on delete cascade, opp text, venue text, location text, comp text, match_date date, match_time text, status text not null default 'setup', periods int, period_mins int, on_pitch int, clock jsonb, notes text, created_at_ms bigint, updated_at timestamptz not null default now());
create table public.match_squad (match_id text not null references public.matches(id) on delete cascade, player_id text not null references public.players(id) on delete cascade, user_id text not null default auth.user_id(), role text not null, reason text, primary key (match_id, player_id));
create table public.match_events (id text primary key, user_id text not null default auth.user_id(), match_id text not null references public.matches(id) on delete cascade, seq int not null default 0, type text not null, player_id text, assist_id text, off_id text, on_id text, how text, detail text, reason text, opp_num text, opp_name text, note_text text, period int, minute int, ts bigint);
create index on public.players(team_id);
create index on public.matches(team_id);
create index on public.match_events(match_id);
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_squad enable row level security;
alter table public.match_events enable row level security;
create policy own_rows on public.teams for all to authenticated using (user_id = auth.user_id()) with check (user_id = auth.user_id());
create policy own_rows on public.players for all to authenticated using (user_id = auth.user_id()) with check (user_id = auth.user_id());
create policy own_rows on public.matches for all to authenticated using (user_id = auth.user_id()) with check (user_id = auth.user_id());
create policy own_rows on public.match_squad for all to authenticated using (user_id = auth.user_id()) with check (user_id = auth.user_id());
create policy own_rows on public.match_events for all to authenticated using (user_id = auth.user_id()) with check (user_id = auth.user_id());
grant select, insert, update, delete on public.teams, public.players, public.matches, public.match_squad, public.match_events to authenticated;
