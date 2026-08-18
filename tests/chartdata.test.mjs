import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dailyTotals, lapSeries, niceCeiling, statsOf } from '../src/lib/chartdata.ts';
import { resolvePath } from '../src/lib/hierarchy.ts';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 0, 5, 9, 0, 0, 0).getTime();

const SESSIONS = [
  {
    id: 's1',
    key: 'doc',
    name: 'Doc',
    path: ['folder', 'doc'],
    pathNames: ['Folder', 'Doc'],
    startedAt: T0,
    laps: [
      { id: 'a', ms: 3000, at: T0 },
      { id: 'b', ms: 5000, at: T0 + 60000 },
      // Two days later, leaving one empty day in between.
      { id: 'c', ms: 1000, at: T0 + 2 * DAY },
    ],
  },
];

test('days with nothing recorded are kept as zeroes', () => {
  // Closing the gaps would make a fortnight off look like a fortnight of steady
  // work, which is the opposite of what the data says.
  const days = dailyTotals(SESSIONS);
  assert.equal(days.length, 3);
  assert.deepEqual(
    days.map((day) => day.ms),
    [8000, 0, 1000],
  );
  assert.deepEqual(
    days.map((day) => day.laps),
    [2, 0, 1],
  );
});

test('a date range extends the day axis even past the recorded data', () => {
  const days = dailyTotals(SESSIONS, { from: T0 - DAY, to: T0 + 3 * DAY });
  assert.equal(days.length, 5);
  assert.equal(days[0].ms, 0);
  assert.equal(days[days.length - 1].ms, 0);
});

test('an empty selection charts as nothing, not as one empty day', () => {
  assert.deepEqual(dailyTotals([], { from: T0, to: T0 + 10 * DAY }), []);
});

test('a lap keeps its number in the session even when the range hides its neighbours', () => {
  // The chart and the lap list have to agree about which lap is "lap 2", or
  // hovering a dot names a different row than the one it came from.
  const series = lapSeries(SESSIONS, { from: T0 + 30000, to: T0 + 90000 });
  assert.equal(series.length, 1);
  assert.equal(series[0].index, 2);
  assert.equal(series[0].ms, 5000);
});

test('laps come back oldest first regardless of session order', () => {
  const series = lapSeries([
    { ...SESSIONS[0], id: 'late', laps: [{ id: 'z', ms: 1, at: T0 + 5 * DAY }] },
    SESSIONS[0],
  ]);
  assert.deepEqual(
    series.map((point) => point.lapId),
    ['a', 'b', 'c', 'z'],
  );
});

test('summary statistics describe the selection', () => {
  const stats = statsOf([3000, 5000, 1000]);
  assert.equal(stats.count, 3);
  assert.equal(stats.totalMs, 9000);
  assert.equal(stats.bestMs, 1000);
  assert.equal(stats.worstMs, 5000);
  assert.equal(stats.medianMs, 3000);
  assert.equal(stats.meanMs, 3000);
});

test('the median of an even count is the midpoint of the middle pair', () => {
  assert.equal(statsOf([1000, 2000, 3000, 6000]).medianMs, 2500);
});

test('there are no statistics for an empty selection', () => {
  assert.equal(statsOf([]), undefined);
});

test('the axis top rounds to a number a person would pick', () => {
  assert.equal(niceCeiling(4062), 5000);
  assert.equal(niceCeiling(1), 1);
  assert.equal(niceCeiling(12000), 20000);
  assert.equal(niceCeiling(0), 1, 'an empty chart still needs a scale');
  assert.equal(niceCeiling(-5), 1);
});

/*
 * The path walk. There is no getAncestors in the SDK, so this follows the
 * parent field one lookup at a time, and the failure modes worth pinning are
 * the ones that would hang or lose data rather than the happy path.
 */
function fakeKB(rems) {
  return {
    rem: { findOne: async (id) => rems[id] },
    richText: { toString: async (text) => (Array.isArray(text) ? text.join('') : String(text)) },
  };
}

test('a path comes back root first', () => {
  const kb = fakeKB({
    doc: { _id: 'doc', parent: 'folder', text: ['Doc'] },
    folder: { _id: 'folder', parent: 'top', text: ['Folder'] },
    top: { _id: 'top', parent: null, text: ['Top'] },
  });
  return resolvePath(kb, 'doc').then((resolved) => {
    assert.deepEqual(resolved.path, ['top', 'folder', 'doc']);
    assert.deepEqual(resolved.pathNames, ['Top', 'Folder', 'Doc']);
    assert.equal(resolved.name, 'Doc');
  });
});

test('a cycle in the parent chain truncates instead of hanging', async () => {
  const kb = fakeKB({
    a: { _id: 'a', parent: 'b', text: ['A'] },
    b: { _id: 'b', parent: 'a', text: ['B'] },
  });
  const resolved = await resolvePath(kb, 'a');
  assert.deepEqual(resolved.path, ['b', 'a']);
});

test('a Rem with no text is still a place to record time', async () => {
  const kb = fakeKB({ bare: { _id: 'bare', parent: null } });
  const resolved = await resolvePath(kb, 'bare');
  assert.equal(resolved.name, 'Untitled');
  assert.deepEqual(resolved.path, ['bare']);
});

test('a missing Rem resolves to nothing rather than an empty path', async () => {
  // The caller refuses to start a timer on this, which is better than starting
  // one that has nowhere to roll up to.
  assert.equal(await resolvePath(fakeKB({}), 'gone'), undefined);
});
