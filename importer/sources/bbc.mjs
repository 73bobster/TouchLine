// BBC Sport source: reads a club's public "Scores & Fixtures" month pages.
// PoC / demo use only: BBC's terms do not cover commercial reuse. Before a commercial launch,
// switch to a licensed feed (see apifootball.mjs) by changing --source; nothing else needs to change.
//
// Every source exports: id, listMatches({ team, months }) -> Match[]
// Match = { team, comp, date (YYYY-MM-DD), kickoff (HH:MM|null), home, away,
//           homeGoals (int|null), awayGoals (int|null), status ('finished'|'scheduled'|'live'|'other'), rawStatus }

export const id = 'bbc';

const BASE = 'https://www.bbc.co.uk/sport/football/teams';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DATE_RE = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]+)$/;
const RESULT_RE = /^(.+?) (\d+) , (.+?) (\d+) at (.+)$/;
const FIXTURE_RE = /^(.+?) versus (.+?) kick off (\d{1,2}:\d{2})$/;
const JUNK_RE = /^(FT|Full time|\d+|Show Scorers|Back to top|Scroll left|Scroll right)$/;

function decode(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function htmlToLines(html, whole = false) {
  const main = whole ? null : html.match(/<main[\s\S]*?<\/main>/i);
  const body = (main ? main[0] : html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(div|li|ul|ol|span|p|h[1-6]|a|section|button|time)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decode(body).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Pick the year that puts the dated heading closest to the month page that was requested.
function dateFor(day, monthName, ym) {
  const m = MONTHS.indexOf(monthName.toLowerCase());
  if (m < 0) return null;
  const [Y, M] = ym.split('-').map(Number);
  let best = null;
  for (const y of [Y - 1, Y, Y + 1]) {
    const dist = Math.abs((y * 12 + m) - (Y * 12 + (M - 1)));
    if (!best || dist < best.dist) best = { y, dist };
  }
  return `${best.y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function statusOf(raw) {
  const s = raw.toLowerCase();
  // "Full time" can carry a note, e.g. "Full time , X win 3 - 2 on aggregate" for the second leg of a tie.
  if (/^(full time|after extra time|after penalties|penalties)/.test(s)) return 'finished';
  if (/postpone|abandon|cancel|suspend/.test(s)) return 'other';
  return 'live';
}

// Each match is a link to /sport/football/live/<id>; pair the id with the summary sentence inside the link.
function pageIds(html) {
  const ids = new Map();
  const re = /<a\b[^>]*href="[^"]*\/sport\/football\/live\/([a-z0-9]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const sentence = htmlToLines(m[2]).find((l) => RESULT_RE.test(l) || FIXTURE_RE.test(l));
    if (sentence) { if (!ids.has(sentence)) ids.set(sentence, []); ids.get(sentence).push(m[1]); }
  }
  return ids;
}

export function parseMonth(html, ym, team) {
  const lines = htmlToLines(html);
  const ids = pageIds(html);
  const out = [];
  const unknown = [];
  let date = null;
  let comp = null;
  lines.forEach((line, i) => {
    const d = line.match(DATE_RE);
    if (d) { date = dateFor(+d[1], d[2], ym); return; }
    const r = line.match(RESULT_RE);
    const f = r ? null : line.match(FIXTURE_RE);
    if (!r && !f) return;
    const prev = lines[i - 1] || '';
    if (prev && !DATE_RE.test(prev) && !JUNK_RE.test(prev) && !RESULT_RE.test(prev) && !FIXTURE_RE.test(prev)) comp = prev;
    if (!date) { unknown.push(line); return; }
    const pageId = (ids.get(line) || []).shift() || null;
    if (r) {
      out.push({ team, comp, date, kickoff: null, home: r[1], away: r[3], homeGoals: +r[2], awayGoals: +r[4], status: statusOf(r[5]), rawStatus: r[5], pageId });
    } else {
      out.push({ team, comp, date, kickoff: f[3], home: f[1], away: f[2], homeGoals: null, awayGoals: null, status: 'scheduled', rawStatus: 'scheduled', pageId });
    }
  });
  return { matches: out, unknown };
}

export async function listMatches({ team, months }) {
  const all = [];
  for (const ym of months) {
    const url = `${BASE}/${team}/scores-fixtures/${ym}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'touchline-poc/0.1 (hobby project; hourly at most)', 'Accept-Language': 'en-GB' } });
    if (!res.ok) throw new Error(`BBC ${team} ${ym}: HTTP ${res.status}`);
    const { matches, unknown } = parseMonth(await res.text(), ym, team);
    if (unknown.length) console.warn(`BBC ${team} ${ym}: ${unknown.length} match line(s) with no date heading skipped`);
    all.push(...matches);
    await new Promise((r) => setTimeout(r, 1500)); // be polite: one page every 1.5s
  }
  return all;
}
