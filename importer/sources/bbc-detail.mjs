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

const MIN = String.raw`(\d+)(?:\+(\d+))?`;
const minOf = (m, a = 1, b = 2) => +m[a] + (m[b] ? +m[b] : 0);
const PLAYER_RE = /^(\d+), (.+), ([A-Za-z][A-Za-z -]*)$/;       // "74, Mato, Defender"
const SUBON_RE = new RegExp(`^(.+?) ${MIN}'$`);                  // "S. Kingsley 33'" (the replacement)
const SUBLONG_RE = /^, substituted for (.+?) at (\d+) minutes$/;
const CARD_RE = /^, (Yellow|Red|Second Yellow|Straight Red)[ -]?(?:Card)? at (\d+) minutes$/i;
const CARDMIN_RE = new RegExp(`^${MIN}'$`);                     // "72'"

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
      const m = t.match(new RegExp(`^(.*?)\\s*\\(${MIN}'\\)\\s*(.*)$`));
      if (!m) { notes.push(`unrecognised key event: "${t}"`); continue; }
      const label = m[4];
      const own = /own goal|\(og\)/i.test(`${m[1]} ${label}`);
      const pen = /pen/i.test(`${m[1]} ${label}`);
      if (!/goal|penalty/i.test(label) && !own) notes.push(`key event with label "${label}"`);
      out.push({ club, type: own ? 'own_goal' : 'goal', minute: minOf(m, 2, 3), player: m[1].replace(/\((?:og|pen)\)/gi, '').trim(), detail: pen ? 'penalty' : null, label });
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
      const m = part.match(new RegExp(`^\\s*(.+?)\\s*\\(${MIN}'?\\)?\\s*$`));
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
      const min = pendingMinute ?? +cm[2];
      (/red/i.test(cm[1]) ? player.red : player.yellow).push(min);
      pendingMinute = null;
      continue;
    }
    const lm = l.match(SUBLONG_RE);
    if (lm) { player.replacedBy = lm[1]; player.offMin = +lm[2]; continue; }
    const on = l.match(SUBON_RE);
    if (on && lines[i + 1] && SUBLONG_RE.test(lines[i + 1])) continue; // read from the long form on the next line
    const cmn = l.match(CARDMIN_RE);
    if (cmn) { pendingMinute = minOf(cmn); continue; }
    if (l === ', Captain') player.captain = true;
  }
  // Pair each replacement with the player who went off.
  for (const s of sides) {
    for (const off of s.players.filter((p) => p.replacedBy)) {
      const on = s.players.find((p) => !p.starter && p.name === off.replacedBy) || s.players.find((p) => p.name === off.replacedBy && p !== off);
      if (on) { on.onMin = off.offMin; on.replaced = off.name; } else notes.push(`replacement not on the bench list: ${off.replacedBy}`);
    }
  }
  return sides;
}

export function parseMatchPage(html) {
  const h = clean(html);
  const lines = htmlToLines(h);
  const notes = [];
  const after = (label) => { const i = lines.indexOf(label); return i >= 0 ? lines[i + 1] || null : null; };
  const sides = lineups(lines, notes);
  const goals = keyEvents(h, notes);
  const assistList = assists(h);
  const events = [];
  const sideOf = (club) => (sides.find((s) => s.club === club) || {}).side || null;

  for (const g of goals) {
    const side = sideOf(g.club);
    const a = assistList.find((x) => x.club === g.club && x.minute === g.minute);
    events.push({ type: g.type, side, minute: g.minute, player: g.player, assist: a ? a.player : null, detail: g.detail });
  }
  for (const a of assistList) {
    if (!goals.some((g) => g.club === a.club && g.minute === a.minute)) notes.push(`assist with no goal at that minute: ${a.player} (${a.minute}')`);
  }
  for (const s of sides) {
    for (const p of s.players) {
      p.yellow.forEach((m) => events.push({ type: 'yellow', side: s.side, minute: m, player: p.name, assist: null, detail: null }));
      p.red.forEach((m) => events.push({ type: 'red', side: s.side, minute: m, player: p.name, assist: null, detail: null }));
      if (p.replacedBy) events.push({ type: 'sub', side: s.side, minute: p.offMin, player: p.name, assist: null, on: p.replacedBy, detail: null });
    }
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
