-- Touchline schema v2 (Neon Postgres + Data API; roles enforced by row-level security).
-- Global role: profiles.is_superuser (set by hand in SQL, never by the client).
-- Team roles: team_members.role = coach | reviewer. Coaches write, reviewers read.
-- Superusers read everything; they can only edit a team after adding themselves as its coach.
-- All data tables are soft-deleted (deleted=true) so offline clients can sync deletions.

create table public.profiles (user_id text primary key, email text, display_name text, is_superuser boolean not null default false, created_at timestamptz not null default now());
create table public.teams (id text primary key, name text not null default '', age text, ground text, primary_colour text, secondary_colour text, on_pitch int, periods int, period_mins int, created_by text default auth.user_id(), deleted boolean not null default false, updated_at timestamptz not null default clock_timestamp());
create table public.team_members (team_id text not null references public.teams(id), user_id text not null, role text not null check (role in ('coach','reviewer')), display_name text, email text, deleted boolean not null default false, updated_at timestamptz not null default clock_timestamp(), primary key (team_id, user_id));
create table public.invites (code text primary key, team_id text not null references public.teams(id), role text not null check (role in ('coach','reviewer')), note text, uses_left int not null default 1, expires_at timestamptz not null default now() + interval '14 days', created_by text default auth.user_id(), created_at timestamptz not null default now());
create table public.players (id text primary key, team_id text not null references public.teams(id), num int, name text not null default '', pos text, left_squad boolean not null default false, screen_name text, start_date date, end_date date, injured boolean not null default false, injury_note text, return_date date, deleted boolean not null default false, updated_at timestamptz not null default clock_timestamp());
create table public.matches (id text primary key, team_id text not null references public.teams(id), opp text, venue text, location text, comp text, match_date date, match_time text, status text not null default 'setup', periods int, period_mins int, on_pitch int, clock jsonb, notes text, rec_mode text, referee text, captain text, pins boolean not null default false, formation text, created_at_ms bigint, finished_at_ms bigint, deleted boolean not null default false, updated_at timestamptz not null default clock_timestamp());
create table public.match_squad (match_id text not null, player_id text not null, team_id text not null references public.teams(id), role text not null, reason text, pos text, deleted boolean not null default false, updated_at timestamptz not null default clock_timestamp(), primary key (match_id, player_id));
create table public.match_events (id text primary key, team_id text not null references public.teams(id), match_id text not null, seq int not null default 0, type text not null, player_id text, assist_id text, off_id text, on_id text, how text, detail text, reason text, opp_num text, opp_name text, note_text text, period int, minute int, ts bigint, x numeric, y numeric, ax numeric, ay numeric, deleted boolean not null default false, updated_at timestamptz not null default clock_timestamp());
create table public.sessions (id text primary key, team_id text not null references public.teams(id), kind text not null default 'training', title text, session_date date, session_time text, location text, notes text, deleted boolean not null default false, updated_at timestamptz not null default clock_timestamp());
create table public.attendance (session_id text not null, player_id text not null, team_id text not null references public.teams(id), attended boolean not null default true, late boolean not null default false, left_early boolean not null default false, mins_late int, mins_early int, reason text, note text, deleted boolean not null default false, updated_at timestamptz not null default clock_timestamp(), primary key (session_id, player_id));
create index on public.players(team_id, updated_at); create index on public.matches(team_id, updated_at); create index on public.match_squad(team_id, updated_at);
create index on public.match_events(team_id, updated_at); create index on public.sessions(team_id, updated_at); create index on public.attendance(team_id, updated_at); create index on public.team_members(user_id);

create function public.touch_updated() returns trigger language plpgsql as $$ begin new.updated_at := clock_timestamp(); return new; end $$;
-- trigger t_touch (before insert or update, touch_updated) on: teams, team_members, players, matches, match_squad, match_events, sessions, attendance

create function public.is_super() returns boolean language sql stable security definer set search_path = public as $$ select coalesce((select is_superuser from public.profiles where user_id = auth.user_id()), false) $$;
create function public.is_member(tid text) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.team_members where team_id = tid and user_id = auth.user_id() and not deleted) $$;
create function public.is_coach(tid text) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.team_members where team_id = tid and user_id = auth.user_id() and role = 'coach' and not deleted) $$;
create function public.can_read(tid text) returns boolean language sql stable security definer set search_path = public as $$ select public.is_super() or public.is_member(tid) $$;
-- rpc ensure_profile(p_name) upserts the caller's profile (email from JWT); rpc redeem_invite(p_code) joins the caller to a team.

-- RLS: profiles select own (all for superuser), update display_name only
--      teams: select can_read; insert superuser only; update coach
--      team_members: select can_read; insert superuser (self only); update superuser or coach
--      invites: all for superuser or the team's coach
--      players, matches, match_squad, match_events, sessions, attendance: select can_read; write coach only
-- Grants: authenticated gets select/insert/update (no delete) on data tables; invites also delete.
-- Auth: Neon Managed Better Auth (email + password); trusted origin https://73bobster.github.io

-- Position moves are stored as match_events with type='move' (how = from position, detail = to position); no extra column.
-- match_events.x,y = shot/goal location in metres (x across from the left touchline 0-68, y from the goal line attacked 0-52.5; y>52.5 means own half). ax,ay = same for the assist.
-- Team counters are match_events with type='tstat' (how = us|them, detail = Shot|Corner|Foul|Offside).
