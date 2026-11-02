// BBC Sport match page reader: goals, assists, cards, starters, substitutions, officials.
// PoC / demo use only (see bbc.mjs about commercial reuse). Pages are server-rendered, so plain fetch is enough.
//
// parseMatchPage(html) -> {
//   venue, attendance, referee,
//   sides: [{ side:'home'|'away', club, manager, formation, players:[{ num, surname, name, pos, starter, captain,
//             yellow:[min], red:[min], offMin, replacedBy, onMin, replaced }] }],
//   events: [{ type:'goal'|'own_goal'|'yellow'|'red'|'sub', side, minute, player, assist, on, detail }],
//   notes: [strings about anything unrecognised]
// }
import { htmlToLines } from './bbc.mjs';

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const text = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const clean = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');

// BBC writes stoppage time as 90'+3 on the page and "90 minutes plus 3" in the spoken labels; both mean minute 93.
const MIN = String.raw`(\d+)'?(?:\s*\+\s*(\d+)'?)?`;
const minOf = (m, a = 1, b = 2) => +m[a] + (m[b] ? +m[b] : 0);
const AT = String.raw`at (\d+) minutes(?: plus (\d+))?`;
const PLAYER_RE = /^(\d+), (.+), ([A-Za-z][A-Za-z -]*)$/;       // "74, Mato, Defender"
const SUBON_RE = new RegExp(`^(.+?) ${MIN}$`);                   // "S. Kingsley 33'" (the replacement)
const SUBLONG_RE = new RegExp(`^, substituted for (.+?) ${AT}$`);
const CARD_RE = new RegExp(`^, (Yellow|Red|Second Yellow|Straight Red)[ -]?(?:Card)? ${AT}$`, 'i');
const CARDMIN_RE = new RegExp(`^${MIN}$`);                      // "72'" or "90'+3"

function keyEvents(html, notes) {
  const seg = html.match(/Key Events<\/h3>([\s\S]*?)(?:>Assists<|Venue:|Attendance:)/);
  const out = [];
  if (!seg) return out;
  const re = /<h4[^>]*>([\s\S]*?)<\/h4>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/g;
  let b;
  while ((b = re.exec(seg[1]))) {
    const club = text(b[1]);
    for (const li of b[2].split(/<li[^>]*>/).slice(1)) {
      const t = text(li);
      // One entry per player, possibly several events:
      //   "K. Nisbet (90'+5 pen) Penalty 90 minutes plus 5"
      //   "E. Fernandez (13' og) Own Goal 13 minutes"
      //   "L. Shankland (8' , 79') Goal 8 minutes, Goal 79 minutes"
      //   "C. Miller (82' pen , 90'+4) Penalty 82 minutes, Goal 90 minutes plus 4"
      //   "J. Iredale ( 62') Two Yellow Cards 62 minutes"
      const m = t.match(/^(.*?)\s*\(\s*(\d[^)]*)\)\s*(.*)$/);
      if (!m) { notes.push(`unrecognised key event: "${t}"`); continue; }
      const player = m[1].trim();
      const times = m[2].split(/\s*,\s*/).map((x) => x.match(new RegExp(`^\\s*${MIN}\\s*(og|pen)?\\s*$`, 'i')));
      const labels = m[3].split(/,\s*(?=[A-Z])/);
      if (times.some((x) => !x) || times.length !== labels.length) { notes.push(`unrecognised key event: "${t}"`); continue; }
      times.forEach((tm, k) => {
        const minute = minOf(tm, 1, 2);
        const flag = (tm[3] || '').toLowerCase();
        const label = labels[k];
        if (/^(red card|straight red)/i.test(label)) out.push({ club, type: 'red', minute, player, detail: null, label });
        else if (/^(two yellow|second yellow)/i.test(label)) out.push({ club, type: 'red', minute, player, detail: 'second yellow', label });
        else if (flag === 'og' || /^own goal/i.test(label)) out.push({ club, type: 'own_goal', minute, player, detail: null, label });
        else if (flag === 'pen' || /^penalty/i.test(label)) out.push({ club, type: 'goal', minute, player, detail: 'penalty', label });
        else if (/^goal/i.test(label)) out.push({ club, type: 'goal', minute, player, detail: null, label });
        else notes.push(`key event with label "${label}": ${t}`);
      });
    }
  }
  return out;
}

function assists(html) {
  const seg = html.match(/>Assists<\/div>([\s\S]*?)(?:<hr|Venue:)/);
  const out = [];
  if (!seg) return out;
  const re = /<span[^>]*>([^<]+),<\/span>([^<]*)/g;
  let b;
  while ((b = re.exec(seg[1]))) {
    const club = decode(b[1]).trim();
    for (const part of decode(b[2]).split(/\)\s*,\s*/)) {
      const m = part.match(new RegExp(`^\\s*(.+?)\\s*\\(\\s*${MIN}\\s*\\)?\\s*$`));
      if (m) out.push({ club, player: m[1].trim(), minute: minOf(m, 2, 3) });
    }
  }
  return out;
}

function lineups(lines, notes) {
  const sides = [];
  let side = null;
  let section = null;
  let player = null;
  let pendingMinute = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const hs = l.match(/^(home|away) team,$/);
    if (hs) { side = { side: hs[1], club: lines[i + 1] || '', manager: null, formation: null, players: [] }; sides.push(side); section = null; player = null; i++; continue; }
    if (!side) continue;
    if (l === 'Manager:') { side.manager = lines[++i] || null; continue; }
    if (l === 'Formation:') { side.formation = (lines[++i] || '').replace(/\s+/g, '') || null; continue; }
    if (l === 'Starting lineup') { section = 'start'; player = null; continue; }
    if (l === 'Substitutes') { section = 'bench'; player = null; continue; }
    if (l === 'Match Officials') { section = null; player = null; continue; }
    if (!section) continue;
    const pm = l.match(PLAYER_RE);
    if (pm && lines[i - 2] === 'Number' && /^\d+$/.test(lines[i - 1] || '')) { // "Number", "74", "74, Mato, Defender"
      const display = (lines[i + 1] || '').replace(/\s*\(c\)\s*$/, '').trim();
      player = { num: +pm[1], surname: pm[2], name: display, pos: pm[3], starter: section === 'start', captain: /\(c\)\s*$/.test(lines[i + 1] || ''), yellow: [], red: [], offMin: null, replacedBy: null, onMin: null, replaced: null };
      side.players.push(player);
      pendingMinute = null;
      i++;
      continue;
    }
    if (!player) continue;
    const cm = l.match(CARD_RE);
    if (cm) {
      const min = pendingMinute ?? (+cm[2] + (cm[3] ? +cm[3] : 0));
      (/red/i.test(cm[1]) ? player.red : player.yellow).push(min);
      pendingMinute = null;
      continue;
    }
    const lm = l.match(SUBLONG_RE);
    if (lm) { player.replacedBy = lm[1]; player.offMin = +lm[2] + (lm[3] ? +lm[3] : 0); continue; }
    const on = l.match(SUBON_RE);
    if (on && lines[i + 1] && SUBLONG_RE.test(lines[i + 1])) continue; // read from the long form on the next line
    const cmn = l.match(CARDMIN_RE);
    if (cmn) { pendingMinute = minOf(cmn); continue; }
    if (l === ', Captain') player.captain = true;
  }
  return sides;
}

// The page repeats each team's line-up block (pitch view, list view, ...). Keep the fullest block per side.
function bestSides(all) {
  const out = [];
  for (const name of ['home', 'away']) {
    const cands = all.filter((s) => s.side === name);
    if (!cands.length) continue;
    out.push(cands.reduce((best, c) => (c.players.length > best.players.length ? c : best)));
  }
  return out;
}

// Pair each replacement with the player who went off.
function pairSubs(sides, notes) {
  for (const s of sides) {
    for (const off of s.players.filter((p) => p.replacedBy)) {
      const on = s.players.find((p) => !p.starter && p.name === off.replacedBy) || s.players.find((p) => p.name === off.replacedBy && p !== off);
      if (on) { on.onMin = off.offMin; on.replaced = off.name; } else notes.push(`replacement not on the bench list: ${off.replacedBy}`);
    }
  }
}

export function parseMatchPage(html) {
  const h = clean(html);
  const lines = htmlToLines(h, true);
  const notes = [];
  const after = (label) => { const i = lines.indexOf(label); return i >= 0 ? lines[i + 1] || null : null; };
  const sides = bestSides(lineups(lines, notes));
  pairSubs(sides, notes);
  const goals = keyEvents(h, notes);
  const assistList = assists(h);
  const events = [];
  const sideOf = (club) => (sides.find((s) => s.club === club) || {}).side || null;
  const ownerOf = (name) => (sides.find((s) => s.players.some((p) => p.name === name)) || {}).side || null;
  const other = (side) => (side === 'home' ? 'away' : side === 'away' ? 'home' : null);

  for (const g of goals.filter((x) => x.type !== 'red')) {
    // Side = the team whose score goes up. An own goal is credited to the opposition of the player who scored it.
    let side = sideOf(g.club);
    if (g.type === 'own_goal') side = other(ownerOf(g.player)) || side;
    const a = assistList.find((x) => x.minute === g.minute && (x.club === g.club || g.type === 'own_goal'));
    events.push({ type: g.type, side, minute: g.minute, player: g.player, assist: a ? a.player : null, detail: g.detail });
  }
  for (const a of assistList) {
    if (!goals.some((g) => g.type !== 'red' && g.minute === a.minute)) notes.push(`assist with no goal at that minute: ${a.player} (${a.minute}')`);
  }
  for (const s of sides) {
    for (const p of s.players) {
      p.yellow.forEach((m) => events.push({ type: 'yellow', side: s.side, minute: m, player: p.name, assist: null, detail: null }));
      p.red.forEach((m) => events.push({ type: 'red', side: s.side, minute: m, player: p.name, assist: null, detail: null }));
      if (p.replacedBy) events.push({ type: 'sub', side: s.side, minute: p.offMin, player: p.name, assist: null, on: p.replacedBy, detail: null });
    }
  }
  // Red cards also appear under Key Events; add any the line-ups did not carry.
  for (const r of goals.filter((x) => x.type === 'red')) {
    if (!events.some((e) => e.type === 'red' && e.player === r.player)) events.push({ type: 'red', side: ownerOf(r.player) || sideOf(r.club), minute: r.minute, player: r.player, assist: null, detail: r.detail });
  }
  events.sort((a, b) => a.minute - b.minute);
  const att = after('Attendance:');
  return {
    venue: after('Venue:'),
    attendance: att ? +att.replace(/[^\d]/g, '') || null : null,
    referee: after('Referee:'),
    sides,
    events,
    notes,
  };
}

export async function fetchMatchPage(pageId) {
  const url = `https://www.bbc.co.uk/sport/football/live/${pageId}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'touchline-poc/0.1 (hobby project; hourly at most)', 'Accept-Language': 'en-GB' } });
  if (!res.ok) throw new Error(`BBC match ${pageId}: HTTP ${res.status}`);
  return parseMatchPage(await res.text());
}
