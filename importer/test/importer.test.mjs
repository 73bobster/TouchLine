// Run: node --test importer/test
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMonth } from '../sources/bbc.mjs';
import { parseMatchPage } from '../sources/bbc-detail.mjs';
import { merge, monthRange, inPollWindow, ukHour, toSql } from '../import.mjs';

// Minimal page shaped like BBC's month view: date heading, competition heading, then a hidden summary sentence.
const result = (home, hg, away, ag) => `<li><a><span class="visually-hidden">${home} ${hg} , ${away} ${ag} at Full time</span>` +
  `<div><span>${home}</span><span>${home}</span></div><span>${hg}</span><span>${ag}</span><div><span>${away}</span></div><span>Full time</span><span>FT</span></a></li>`;
const page = `<html><body><nav>Oct 2026</nav><main>
<h3>Saturday 31st October</h3><h4>League Cup - Semi-finals</h4>${result('Rangers', 1, 'Aberdeen', 0)}
<h3>Wednesday 28th October</h3><h4>Scottish Premiership - 1st Phase</h4>${result('Heart of Midlothian', 2, 'Rangers', 2)}
<h3>Saturday 24th October</h3><h4>Scottish Premiership - 1st Phase</h4>${result('Rangers', 4, 'St. Johnstone', 0)}${result('Dundee &amp; Co', 1, 'Rangers', 1)}
<h3>Saturday 7th November</h3><h4>Scottish Premiership - 1st Phase</h4><li><a><span class="visually-hidden">St. Mirren versus Rangers kick off 20:00</span><span>St. Mirren</span><span>20:00</span></a></li>
</main></body></html>`;

test('parses results and fixtures with date, competition and year', () => {
  const { matches } = parseMonth(page, '2026-10', 'rangers');
  assert.equal(matches.length, 5);
  assert.deepEqual(matches[0], { team: 'rangers', comp: 'League Cup - Semi-finals', date: '2026-10-31', kickoff: null, home: 'Rangers', away: 'Aberdeen', homeGoals: 1, awayGoals: 0, status: 'finished', rawStatus: 'Full time', pageId: null });
  assert.equal(matches[1].home, 'Heart of Midlothian');
  assert.equal(matches[1].date, '2026-10-28');
  assert.equal(matches[4].status, 'scheduled');
  assert.equal(matches[4].kickoff, '20:00');
  assert.equal(matches[4].date, '2026-11-07');
});

test('second game on the same day keeps the competition and decodes entities', () => {
  const { matches } = parseMonth(page, '2026-10', 'rangers');
  assert.equal(matches[3].home, 'Dundee & Co');
  assert.equal(matches[3].comp, 'Scottish Premiership - 1st Phase');
});

test('year rolls correctly around new year', () => {
  const html = '<main><h3>Saturday 2nd January</h3><h4>Cup</h4><span>A 1 , B 0 at Full time</span></main>';
  assert.equal(parseMonth(html, '2026-12', 't').matches[0].date, '2027-01-02');
  assert.equal(parseMonth(html, '2027-01', 't').matches[0].date, '2027-01-02');
});

test('postponed and live states are not marked finished', () => {
  const html = '<main><h3>Saturday 2nd May</h3><h4>Cup</h4><span>A 0 , B 0 at Half time</span></main>';
  assert.equal(parseMonth(html, '2026-05', 't').matches[0].status, 'live');
});

test('finished legs of a two-legged tie are finished, with the aggregate kept', () => {
  const html = '<main><h3>Thursday 13th August</h3><h4>UEFA Conference League</h4><span>A 1 , B 1 at Full time , B win 3 - 2 on aggregate</span></main>';
  const m = parseMonth(html, '2026-08', 't').matches[0];
  assert.equal(m.status, 'finished');
  assert.match(m.rawStatus, /on aggregate/);
});

test('a derby on both clubs pages merges into one row', () => {
  const a = parseMonth(page, '2026-10', 'rangers').matches;
  const b = parseMonth(page, '2026-10', 'heart-of-midlothian').matches.filter((m) => m.home === 'Heart of Midlothian');
  const rows = merge([...a, ...b]);
  const derby = rows.find((r) => r.home === 'Heart of Midlothian');
  assert.deepEqual(derby.teams, ['rangers', 'heart-of-midlothian']);
  assert.equal(rows.length, 5);
});

test('month range, polling window and sql quoting', () => {
  assert.deepEqual(monthRange('2026-11', '2027-01'), ['2026-11', '2026-12', '2027-01']);
  assert.equal(inPollWindow(new Date('2026-11-02T12:59:00Z')), false); // 12:59 UK (GMT)
  assert.equal(inPollWindow(new Date('2026-11-02T13:00:00Z')), true);
  assert.equal(inPollWindow(new Date('2026-11-02T23:59:00Z')), true);
  assert.equal(inPollWindow(new Date('2026-07-02T12:30:00Z')), true); // 13:30 UK (BST)
  assert.equal(ukHour(new Date('2026-07-02T22:30:00Z')), 23);
  const sql = toSql(merge([{ team: 't', comp: "Ladies' Cup", date: '2026-10-31', kickoff: null, home: "O'Neil", away: 'B', homeGoals: 1, awayGoals: 0, status: 'finished', rawStatus: 'Full time' }]), 'bbc');
  assert.match(sql, /'Ladies'' Cup'/);
  assert.match(sql, /on conflict \(source, source_ref\)/);
});

// Match page shaped like BBC's: key events, assists, venue/attendance, then line-ups with cards and substitutions.
const pl = (num, sur, pos, shown, extra = '') => `<li><button><div><span>Number</span><div>${num}</div><span>${num}, ${sur}, ${pos}</span></div><div><span><span>${shown}</span> </span>${extra}</div></button></li>`;
const sub = (name, min) => `<span>${name} ${min}&#x27;</span><span>, substituted for ${name} at ${min} minutes</span>`;
const card = (min, kind = 'Yellow') => `<span>${min}&#x27;</span><span>, ${kind} Card at ${min} minutes</span>`;
const matchPage = `<html><body><main>
<h3>Key Events</h3>
<div><div><h4>Heart of Midlothian</h4></div><ul><li><span>Cl\u00e1udio Braga<!-- --> </span><span><span>(<!-- -->48&#x27;<!-- -->)</span></span><span>Goal 48 minutes</span></li><li><span>C. Miller<!-- --> </span><span><span>(<!-- -->57&#x27;<!-- -->)</span></span><span>Goal 57 minutes</span></li></ul></div>
<div><div><h4>Rangers</h4></div><ul><li><span>K. Kelsy<!-- --> </span><span><span>(<!-- -->16&#x27;<!-- -->)</span></span><span>Goal 16 minutes</span></li><li><span>O. Makhanya<!-- --> </span><span><span>(<!-- -->89&#x27;<!-- -->)</span></span><span>Goal 89 minutes</span></li></ul></div>
<div><div><div>Assists</div><div><span>Heart of Midlothian,</span>M. Fagan-Walcott (48&#x27;)</div><div><span>Rangers,</span>R. Naderi (16&#x27;), B. Bouanani (89&#x27;)</div></div></div>
<div><hr><div><div><span>Venue:</span>Tynecastle Park</div></div><div><div><span>Attendance:</span>18,692</div></div></div>
<div><span>home team,</span><span>Heart of Midlothian</span><span>Manager:</span><span>Wouter Vrancken</span><span>Formation:</span><span>4 - 2 - 3 - 1</span>
<h4>Pitch Formation</h4><ul>${pl(1, 'Reus', 'Goalkeeper', 'Reus')}</ul>
<h4>Starting lineup</h4><ul>${pl(1, 'Reus', 'Goalkeeper', 'B. Reus')}${pl(74, 'Mato', 'Defender', 'R. Mato', sub('S. Kingsley', 33))}${pl(5, 'McCart', 'Defender', 'J. McCart (c)', '<span>, Captain</span>')}${pl(23, 'Altena', 'Defender', 'J. Altena', card(72))}</ul>
<h4>Substitutes</h4><ul>${pl(3, 'Kingsley', 'Substitute', 'S. Kingsley')}</ul></div>
<div><span>away team,</span><span>Rangers</span><span>Manager:</span><span>Derek McInnes</span><span>Formation:</span><span>4 - 2 - 3 - 1</span>
<h4>Starting lineup</h4><ul>${pl(1, 'Pandur', 'Goalkeeper', 'I. Pandur')}${pl(29, 'Penrice', 'Defender', 'J. Penrice', card(61) + sub('T. Rommens', 63))}${pl(8, 'Smith', 'Midfielder', 'A. Smith', card(90, 'Red'))}</ul>
<h4>Substitutes</h4><ul>${pl(25, 'Rommens', 'Substitute', 'T. Rommens')}</ul></div>
<div><span>Match Officials</span><span>Referee:</span><span>Don Robertson</span></div>
</main></body></html>`;

test('match page: goals, assists, cards, subs, line-ups and officials', () => {
  const d = parseMatchPage(matchPage);
  assert.equal(d.venue, 'Tynecastle Park');
  assert.equal(d.attendance, 18692);
  assert.equal(d.referee, 'Don Robertson');
  assert.equal(d.sides.length, 2);
  const [home, away] = d.sides;
  assert.equal(home.club, 'Heart of Midlothian');
  assert.equal(home.manager, 'Wouter Vrancken');
  assert.equal(home.formation, '4-2-3-1');
  assert.equal(home.players.filter((p) => p.starter).length, 4);   // pitch diagram is not double counted
  assert.equal(home.players.filter((p) => !p.starter).length, 1);
  assert.equal(home.players.find((p) => p.num === 5).captain, true);
  assert.equal(home.players.find((p) => p.name === 'J. McCart').name, 'J. McCart');
  const goals = d.events.filter((e) => e.type === 'goal');
  assert.deepEqual(goals.map((g) => [g.minute, g.side, g.player, g.assist]), [
    [16, 'away', 'K. Kelsy', 'R. Naderi'], [48, 'home', 'Cl\u00e1udio Braga', 'M. Fagan-Walcott'], [57, 'home', 'C. Miller', null], [89, 'away', 'O. Makhanya', 'B. Bouanani']]);
  assert.deepEqual(d.events.filter((e) => e.type === 'yellow').map((e) => [e.minute, e.side, e.player]), [[61, 'away', 'J. Penrice'], [72, 'home', 'J. Altena']]);
  assert.deepEqual(d.events.filter((e) => e.type === 'red').map((e) => [e.minute, e.player]), [[90, 'A. Smith']]);
  assert.deepEqual(d.events.filter((e) => e.type === 'sub').map((e) => [e.minute, e.side, e.player, e.on]), [[33, 'home', 'R. Mato', 'S. Kingsley'], [63, 'away', 'J. Penrice', 'T. Rommens']]);
  const kingsley = home.players.find((p) => p.name === 'S. Kingsley');
  assert.equal(kingsley.onMin, 33);
  assert.equal(kingsley.replaced, 'R. Mato');
  assert.equal(d.notes.length, 0);
});

test('detail rows are written as a replace-per-match transaction', () => {
  const d = parseMatchPage(matchPage);
  const row = { team: 't', ref: '2026-10-28|H|R', teams: ['t'], comp: 'Prem', date: '2026-10-28', kickoff: null, home: 'H', away: 'R', homeGoals: 2, awayGoals: 2, status: 'finished', rawStatus: 'Full time', pageId: 'abc', detail: d };
  const sql = toSql([row], 'bbc');
  assert.match(sql, /^-- Generated[\s\S]*\nbegin;/);
  assert.match(sql, /commit;\n$/);
  assert.match(sql, /delete from public\.pro_match_players/);
  assert.equal((sql.match(/insert into public\.pro_match_players/g) || []).length, 9);
  assert.equal((sql.match(/insert into public\.pro_match_events/g) || []).length, 9); // 4 goals, 2 yellow, 1 red, 2 subs
  assert.match(sql, /yellow, red\) values[^;]*array\[72\]::int\[\]/);
});

// Formats seen on real pages: penalties, own goals, stoppage time, reds under Key Events, line-up block repeated.
test('match page: penalty, own goal, stoppage time and repeated blocks', () => {
  const block = (cards) => `<div><span>home team,</span><span>Aberdeen</span><span>Manager:</span><span>M One</span><span>Formation:</span><span>4 - 4 - 2</span>
<h4>Starting lineup</h4><ul>${pl(1, 'Keeper', 'Goalkeeper', 'A. Keeper')}${pl(4, 'Findlay', 'Defender', 'S. Findlay', cards)}</ul><h4>Substitutes</h4><ul>${pl(12, 'Bench', 'Substitute', 'B. Bench')}</ul></div>
<div><span>away team,</span><span>Hearts</span><span>Manager:</span><span>M Two</span><span>Formation:</span><span>4 - 2 - 3 - 1</span>
<h4>Starting lineup</h4><ul>${pl(9, 'Nisbet', 'Striker', 'K. Nisbet')}${pl(5, 'Fernandez', 'Defender', 'E. Fernandez')}</ul><h4>Substitutes</h4><ul></ul></div>`;
  const stoppageRed = `<span>90&#x27;+3</span><span>, Red Card at 90 minutes plus 3</span>`;
  const html = `<html><body><header><div><span>Venue:</span>Pittodrie</div><div><span>Attendance:</span>20,001</div></header><main>
<h3>Key Events</h3>
<div><div><h4>Aberdeen</h4></div><ul><li><span>E. Fernandez</span> <span><span>(13&#x27; og)</span></span><span>Own Goal 13 minutes</span></li><li><span>S. Findlay</span> <span><span>( 90&#x27;+3)</span></span><span>Red Card 90 minutes plus 3</span></li></ul></div>
<div><div><h4>Hearts</h4></div><ul><li><span>K. Nisbet</span> <span><span>(90&#x27;+5 pen)</span></span><span>Penalty 90 minutes plus 5</span></li></ul></div>
<div><div><div>Assists</div><div><span>Aberdeen,</span>B. Bench (13&#x27;)</div></div></div><hr>
${block('')}${block(stoppageRed)}${block(stoppageRed)}
</main></body></html>`;
  const d = parseMatchPage(html);
  assert.equal(d.venue, 'Pittodrie');            // header sits outside <main>
  assert.equal(d.attendance, 20001);
  assert.equal(d.sides.length, 2);                // repeated blocks collapse to one per side
  assert.equal(d.sides[0].players.filter((p) => p.starter).length, 2);
  const og = d.events.find((e) => e.type === 'own_goal');
  assert.equal(og.minute, 13);
  assert.equal(og.side, 'home');                  // Fernandez plays for Hearts (away), so the goal counts for Aberdeen
  assert.equal(og.assist, 'B. Bench');
  const pen = d.events.find((e) => e.detail === 'penalty');
  assert.deepEqual([pen.minute, pen.side, pen.player], [95, 'away', 'K. Nisbet']);
  const reds = d.events.filter((e) => e.type === 'red');
  assert.equal(reds.length, 1);                   // not doubled by Key Events
  assert.deepEqual([reds[0].minute, reds[0].side, reds[0].player], [93, 'home', 'S. Findlay']);
  assert.equal(d.notes.length, 0);
});

test('match page: a player with two goals in one entry, and a second-yellow dismissal', () => {
  const html = `<html><body><main><h3>Key Events</h3>
<div><div><h4>Rangers</h4></div><ul><li><span>L. Shankland</span> <span><span>(8&#x27; , 79&#x27;)</span></span><span>Goal 8 minutes, Goal 79 minutes</span></li></ul></div>
<div><div><h4>Hearts</h4></div><ul><li><span>C. Miller</span> <span><span>(82&#x27; pen , 90&#x27;+4)</span></span><span>Penalty 82 minutes, Goal 90 minutes plus 4</span></li><li><span>J. Iredale</span> <span><span>( 62&#x27;)</span></span><span>Two Yellow Cards 62 minutes</span></li></ul></div>
<div><div><div>Assists</div><div><span>Rangers,</span>D. Gassama (8&#x27;), R. McCrorie (79&#x27;)</div><div><span>Hearts,</span>J. McPake (94&#x27;)</div></div></div><hr>
<div><span>home team,</span><span>Rangers</span><h4>Starting lineup</h4><ul>${pl(9, 'Shankland', 'Striker', 'L. Shankland')}</ul></div>
<div><span>away team,</span><span>Hearts</span><h4>Starting lineup</h4><ul>${pl(7, 'Miller', 'Midfielder', 'C. Miller')}${pl(4, 'Iredale', 'Defender', 'J. Iredale')}</ul></div>
</main></body></html>`;
  const d = parseMatchPage(html);
  assert.deepEqual(d.events.filter((e) => e.type === 'goal').map((e) => [e.minute, e.side, e.player, e.assist, e.detail]), [
    [8, 'home', 'L. Shankland', 'D. Gassama', null], [79, 'home', 'L. Shankland', 'R. McCrorie', null], [82, 'away', 'C. Miller', null, 'penalty'], [94, 'away', 'C. Miller', 'J. McPake', null]]);
  const red = d.events.find((e) => e.type === 'red');
  assert.deepEqual([red.minute, red.side, red.player, red.detail], [62, 'away', 'J. Iredale', 'second yellow']);
  assert.equal(d.notes.length, 0);
});

test('match officials in a definition list are read (referee)', () => {
  const html = '<html><body><main><div><dl><div><dt>Referee: </dt><dd>Don Robertson</dd></div><div><dt>Video Assistant Referee: </dt><dd>Matthew MacDermid</dd></div></dl></div></main></body></html>';
  assert.equal(parseMatchPage(html).referee, 'Don Robertson');
});

test('match header picks up a game missing from the month page', async () => {
  const { parseMatchHeader, parseTeamHomeIds } = await import('../sources/bbc.mjs');
  const html = '<main><span>Match Summary</span><div>Sun 1 Nov 2026</div><span>‧</span><div>League Cup -</div><div>Semi-finals</div><div>Heart of Midlothian 1 , Hibernian 2 at Full time</div></main>';
  const m = parseMatchHeader(html, 'heart-of-midlothian', 'c9dr821nl8kdt');
  assert.deepEqual([m.date, m.comp, m.home, m.away, m.homeGoals, m.awayGoals, m.status], ['2026-11-01', 'League Cup - Semi-finals', 'Heart of Midlothian', 'Hibernian', 1, 2, 'finished']);
  assert.deepEqual(parseTeamHomeIds('<a href="/sport/football/live/abc123">x</a><a href="/sport/football/live/abc123">y</a>'), ['abc123']);
});
