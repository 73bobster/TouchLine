-- Match detail for favourite teams: venue, officials, line-ups, goals, assists, cards and substitutions.
-- Additive. Run after 002_pro_matches.sql. Filled by importer/import.mjs --sql; readable by signed-in users only.
alter table public.pro_matches
  add column if not exists page_id text,
  add column if not exists venue text,
  add column if not exists attendance int,
  add column if not exists referee text,
  add column if not exists home_manager text,
  add column if not exists away_manager text,
  add column if not exists home_formation text,
  add column if not exists away_formation text,
  add column if not exists detail_fetched_at timestamptz;

create table if not exists public.pro_match_players (
  source text not null,
  source_ref text not null,
  side text not null check (side in ('home','away')),
  num int not null,                       -- shirt number
  name text not null,                     -- as shown, e.g. "J. McCart"
  surname text,
  pos text,                               -- Goalkeeper, Defender, Attacking Midfielder, Striker, Substitute ...
  starter boolean not null,               -- true = in the starting XI, false = on the bench
  captain boolean not null default false,
  on_min int,                             -- minute this bench player came on
  off_min int,                            -- minute this player went off
  replaced_by text,                       -- who came on for him
  replaced text,                          -- who he came on for
  yellow int[] not null default '{}',     -- minutes of yellow cards
  red int[] not null default '{}',        -- minutes of red cards
  primary key (source, source_ref, side, num),
  foreign key (source, source_ref) references public.pro_matches (source, source_ref) on delete cascade
);

create table if not exists public.pro_match_events (
  source text not null,
  source_ref text not null,
  seq int not null,                       -- order within the match (by minute)
  type text not null check (type in ('goal','own_goal','yellow','red','sub')),
  side text,                              -- team the event is credited to (home/away)
  minute int not null,
  player text,                            -- scorer / carded player / player going off
  assist text,                            -- goals only
  on_player text,                         -- substitutions only: player coming on
  detail text,                            -- e.g. 'penalty'
  primary key (source, source_ref, seq),
  foreign key (source, source_ref) references public.pro_matches (source, source_ref) on delete cascade
);

alter table public.pro_match_players enable row level security;
alter table public.pro_match_events enable row level security;
create policy pro_match_players_read on public.pro_match_players for select to authenticated using (true);
create policy pro_match_events_read on public.pro_match_events for select to authenticated using (true);
grant select on public.pro_match_players, public.pro_match_events to authenticated;
