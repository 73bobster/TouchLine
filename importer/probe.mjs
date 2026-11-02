// One-off probe: what does the API-Football FREE plan return for Rangers and Hearts?
// Prints a short report of which fields come back. No keys or raw responses are printed.
// Needs the env var APIFOOTBALL_KEY (a GitHub Actions secret). Uses about 15 of the 100 daily free requests.
const KEY = process.env.APIFOOTBALL_KEY;
const BASE = 'https://v3.football.api-sports.io';
const out = [];
const say = (s = '') => { out.push(s); console.log(s); };
if (!KEY) { say('APIFOOTBALL_KEY is not set. Add it under Settings > Secrets and variables > Actions, then re-run this job.'); process.exit(1); }

let calls = 0;
async function api(path) {
  calls++;
  const r = await fetch(BASE + path, { headers: { 'x-apisports-key': KEY, 'User-Agent': 'touchline-probe/0.1' } });
  let j = {};
  try { j = await r.json(); } catch (e) { /* not JSON */ }
  const errs = j.errors && (Array.isArray(j.errors) ? j.errors : Object.values(j.errors));
  return { http: r.status, errors: (errs || []).map(String), results: j.results ?? 0, resp: j.response ?? [], left: r.headers.get('x-ratelimit-requests-remaining') };
}
const yn = (b) => (b ? 'yes' : 'NO');

say('# API-Football free-plan probe');
const st = await api('/status');
const acct = st.resp && st.resp.subscription ? st.resp : null;
say(`status: HTTP ${st.http}${st.errors.length ? ' errors: ' + st.errors.join('; ') : ''}`);
if (acct) say(`plan: ${acct.subscription.plan}, active: ${acct.subscription.active}, requests today: ${acct.requests.current}/${acct.requests.limit_day}`);

async function team(name, search) {
  // The API rejects `country` combined with `search`, so search by name and keep the Scottish club client-side.
  const t = await api('/teams?search=' + encodeURIComponent(search));
  const club = t.resp.filter((x) => x.team && !x.team.national);
  const hit = club.find((x) => x.team.country === 'Scotland') || null;
  if (!hit && club.length) say(`(no Scottish match; ${club.length} club(s) elsewhere named like "${search}")`);
  say(`\n## ${name}: team search "${search}" -> HTTP ${t.http}, ${t.results} result(s)${t.errors.length ? ', errors: ' + t.errors.join('; ') : ''}`);
  if (hit) say(`found: id ${hit.team.id}, "${hit.team.name}", venue ${hit.venue && hit.venue.name}`);
  return hit && hit.team.id;
}

const leagues = await api('/leagues?country=Scotland&current=true');
say(`\n## Scottish competitions this season: HTTP ${leagues.http}, ${leagues.results}${leagues.errors.length ? ', errors: ' + leagues.errors.join('; ') : ''}`);
leagues.resp.forEach((l) => {
  const cur = (l.seasons || []).find((s) => s.current) || {};
  const c = cur.coverage || {}; const f = c.fixtures || {};
  say(`- ${l.league.name} (${l.league.type}) season ${cur.year}: events ${yn(f.events)}, lineups ${yn(f.lineups)}, stats ${yn(f.statistics_fixtures)}, player stats ${yn(f.statistics_players)}`);
});

const wanted = [['Rangers', 'Rangers'], ['Hearts', 'Heart of Midlothian']];
for (const [name, search] of wanted) {
  const id = await team(name, search);
  if (!id) continue;
  let finished = null;
  for (const season of [2026, 2025, 2024]) {
    const f = await api(`/fixtures?team=${id}&season=${season}&status=FT-AET-PEN`);
    say(`fixtures season ${season}: HTTP ${f.http}, ${f.results} finished${f.errors.length ? ', errors: ' + f.errors.join('; ') : ''}`);
    if (!finished && f.resp.length) finished = { season, list: f.resp };
  }
  if (!finished) { say('no finished fixtures available on this plan for those seasons'); continue; }
  const list = finished.list.sort((a, b) => (a.fixture.date < b.fixture.date ? 1 : -1));
  say(`latest available finished game (season ${finished.season}): ${list[0].teams.home.name} ${list[0].goals.home}-${list[0].goals.away} ${list[0].teams.away.name} on ${list[0].fixture.date.slice(0, 10)} (${list[0].league.name})`);
  const d = await api('/fixtures?id=' + list[0].fixture.id);
  const x = d.resp[0];
  say(`detail: HTTP ${d.http}${d.errors.length ? ', errors: ' + d.errors.join('; ') : ''}`);
  if (!x) continue;
  say(`referee: ${yn(x.fixture.referee)} (${x.fixture.referee || '-'}), venue: ${yn(x.fixture.venue && x.fixture.venue.name)}, attendance field: ${x.fixture.attendance != null ? 'yes' : 'NO'}`);
  const ev = x.events || [];
  const types = {}; ev.forEach((e) => { const k = e.type + (e.detail ? ':' + e.detail : ''); types[k] = (types[k] || 0) + 1; });
  say(`events: ${ev.length} -> ${JSON.stringify(types)}`);
  const goals = ev.filter((e) => e.type === 'Goal');
  say(`goal events with assist named: ${goals.filter((e) => e.assist && e.assist.name).length}/${goals.length}`);
  say(`sub events: ${ev.filter((e) => e.type === 'subst').length} (player = who went off, assist = who came on in this API)`);
  const lu = x.lineups || [];
  lu.forEach((l) => say(`lineup ${l.team.name}: formation ${l.formation || '-'}, coach ${l.coach && l.coach.name || '-'}, starters ${(l.startXI || []).length}, subs ${(l.substitutes || []).length}, shirt numbers ${yn((l.startXI || []).every((p) => p.player.number != null))}, grid positions ${yn((l.startXI || []).every((p) => p.player.grid))}, position codes ${yn((l.startXI || []).every((p) => p.player.pos))}`));
  say(`team statistics blocks: ${(x.statistics || []).length}, player stats blocks: ${(x.players || []).length}`);
  say(`captain flag visible: ${yn((x.players || []).some((t) => (t.players || []).some((p) => p.statistics && p.statistics[0] && p.statistics[0].games && p.statistics[0].games.captain)))}`);
}
say(`\nrequests used by this probe: ${calls}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const fs = await import('node:fs');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n');
}
