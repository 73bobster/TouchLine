-- Lets any signed-in user start their own team. Security definer, so no table policy is loosened:
-- the function inserts the team and makes the caller its coach. Capped at 10 teams per non-admin user.
create or replace function public.create_team(
  p_id text, p_name text, p_age text, p_ground text, p_primary text, p_secondary text,
  p_on_pitch int, p_periods int, p_period_mins int
) returns text
language plpgsql security definer set search_path = public as $$
declare uid text := auth.user_id(); prof public.profiles;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the team a name'; end if;
  if not public.is_super() and (select count(*) from public.team_members where user_id = uid and role = 'coach' and not deleted) >= 10 then
    raise exception 'Team limit reached';
  end if;
  select * into prof from public.profiles where user_id = uid;
  insert into public.teams (id, name, age, ground, primary_colour, secondary_colour, on_pitch, periods, period_mins)
  values (p_id, trim(p_name), p_age, p_ground, p_primary, p_secondary, p_on_pitch, p_periods, p_period_mins);
  insert into public.team_members (team_id, user_id, role, display_name, email)
  values (p_id, uid, 'coach', coalesce(prof.display_name, auth.jwt()->>'name'), coalesce(prof.email, auth.jwt()->>'email'));
  return p_id;
end $$;
revoke all on function public.create_team(text,text,text,text,text,text,int,int,int) from public;
grant execute on function public.create_team(text,text,text,text,text,text,int,int,int) to authenticated;
