// Run: node --test importer/test
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMonth } from '../sources/bbc.mjs';
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
  assert.deepEqual(matches[0], { team: 'rangers', comp: 'League Cup - Semi-finals', date: '2026-10-31', kickoff: null, home: 'Rangers', away: 'Aberdeen', homeGoals: 1, awayGoals: 0, status: 'finished', rawStatus: 'Full time' });
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
