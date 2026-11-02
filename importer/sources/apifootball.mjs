// API-Football source (paid-plan path). Not used while Touchline is a hobby PoC.
// The free plan only reaches seasons 2022-2024 (see probe.mjs), so current-season games need a paid plan.
// Switch on at launch with: node importer/import.mjs --source apifootball
// Needs APIFOOTBALL_KEY. Team ids found by the probe: Rangers 257, Heart of Midlothian 254.

export const id = 'apifootball';

const BASE = 'https://v3.football.api-sports.io';
const TEAM_IDS = { rangers: 257, 'heart-of-midlothian': 254 };
const FINISHED = new Set(['FT', 'AET', 'PEN']);

export async function listMatches({ team, months }) {
  const key = process.env.APIFOOTBALL_KEY;
  if (!key) throw new Error('APIFOOTBALL_KEY is not set');
  const tid = TEAM_IDS[team];
  if (!tid) throw new Error(`No API-Football team id known for "${team}"`);
  const [first, last] = [months[0], months[months.length - 1]];
  const from = `${first}-01`;
  const to = new Date(Date.UTC(+last.slice(0, 4), +last.slice(5, 7), 0)).toISOString().slice(0, 10);
  const season = +first.slice(0, 4) - (+first.slice(5, 7) < 7 ? 1 : 0);
  const res = await fetch(`${BASE}/fixtures?team=${tid}&season=${season}&from=${from}&to=${to}`, { headers: { 'x-apisports-key': key } });
  const j = await res.json();
  const errs = j.errors && (Array.isArray(j.errors) ? j.errors : Object.values(j.errors));
  if (!res.ok || (errs && errs.length)) throw new Error(`API-Football: HTTP ${res.status} ${(errs || []).join('; ')}`);
  return j.response.map((x) => ({
    team,
    comp: x.league.name,
    date: x.fixture.date.slice(0, 10),
    kickoff: x.fixture.date.slice(11, 16),
    home: x.teams.home.name,
    away: x.teams.away.name,
    homeGoals: x.goals.home,
    awayGoals: x.goals.away,
    status: FINISHED.has(x.fixture.status.short) ? 'finished' : x.fixture.status.short === 'NS' ? 'scheduled' : 'other',
    rawStatus: x.fixture.status.long,
  }));
}
