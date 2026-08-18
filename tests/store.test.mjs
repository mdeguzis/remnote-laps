import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  allLaps,
  finishTimer,
  currentLapElapsed,
  deleteLap,
  editLap,
  elapsedOf,
  normalizeData,
  recordedRange,
  removeSession,
  runningAsSession,
  sessionList,
  upsertSession,
} from '../src/lib/store.ts';

const T0 = new Date(2026, 0, 5, 9, 0, 0, 0).getTime();

function data() {
  return {
    version: 1,
    sessions: {
      s1: {
        id: 's1',
        key: 'doc',
        name: 'Doc',
        path: ['folder', 'doc'],
        pathNames: ['Folder', 'Doc'],
        startedAt: T0,
        endedAt: T0 + 9000,
        laps: [
          { id: 'l1', ms: 3000, at: T0 + 3000 },
          { id: 'l2', ms: 6000, at: T0 + 9000 },
        ],
      },
    },
  };
}

test('editing a lap changes that lap and nothing else', () => {
  // Deliberately does NOT reflow the neighbours. A lap time is the number the
  // user cares about; rewriting the ones they did not touch to keep the
  // arithmetic tidy would change data behind their back.
  const next = editLap(data(), 's1', 'l1', { ms: 4500 });
  assert.equal(next.sessions.s1.laps[0].ms, 4500);
  assert.equal(next.sessions.s1.laps[1].ms, 6000);
  assert.equal(next.sessions.s1.laps[0].at, T0 + 3000, 'the timestamp is provenance and stays put');
});

test('editing clamps a negative duration to zero', () => {
  assert.equal(editLap(data(), 's1', 'l1', { ms: -500 }).sessions.s1.laps[0].ms, 0);
});

test('editing a note leaves the duration alone and vice versa', () => {
  const noted = editLap(data(), 's1', 'l1', { note: 'warm up' });
  assert.equal(noted.sessions.s1.laps[0].note, 'warm up');
  assert.equal(noted.sessions.s1.laps[0].ms, 3000);

  const retimed = editLap(noted, 's1', 'l1', { ms: 1000 });
  assert.equal(retimed.sessions.s1.laps[0].note, 'warm up');
});

test('editing something that is not there returns the store untouched', () => {
  const original = data();
  assert.equal(editLap(original, 'nope', 'l1', { ms: 1 }), original);
});

test('deleting the last lap deletes the session with it', () => {
  // An empty session would otherwise keep contributing a session count and no
  // time to every rollup, which reads as a bug in the totals.
  const one = deleteLap(data(), 's1', 'l1');
  assert.equal(one.sessions.s1.laps.length, 1);

  const none = deleteLap(one, 's1', 'l2');
  assert.equal(none.sessions.s1, undefined);
  assert.deepEqual(sessionList(none), []);
});

test('upsert and remove leave the rest of the store alone', () => {
  const extra = {
    id: 's2',
    key: 'other',
    name: 'Other',
    path: ['other'],
    pathNames: ['Other'],
    startedAt: T0 + 100,
    laps: [{ id: 'x', ms: 1, at: T0 + 101 }],
  };
  const two = upsertSession(data(), extra);
  assert.equal(sessionList(two).length, 2);
  assert.equal(sessionList(removeSession(two, 's2')).length, 1);
});

test('malformed stored data degrades to empty rather than crashing', () => {
  // Storage is synced, so a newer build on another device can put a shape here
  // this one has never seen.
  for (const bad of [undefined, null, 42, 'nope', {}, { sessions: 'no' }]) {
    assert.deepEqual(normalizeData(bad).sessions, {});
  }
});

test('normalising keeps the salvageable sessions and drops only the broken ones', () => {
  const mixed = {
    version: 1,
    sessions: {
      good: { key: 'k', laps: [{ id: 'a', ms: 1, at: 2 }] },
      noKey: { laps: [] },
      noLaps: { key: 'k' },
      brokenLap: { key: 'k', laps: [{ id: 'b' }, { id: 'c', ms: 5, at: 6 }] },
    },
  };
  const out = normalizeData(mixed);
  assert.deepEqual(Object.keys(out.sessions).sort(), ['brokenLap', 'good']);
  assert.equal(out.sessions.brokenLap.laps.length, 1, 'the lap with no time is dropped, the session is not');
  assert.deepEqual(out.sessions.noLaps, undefined);
  // A session missing its path still gets one, so the rollup has somewhere to
  // hang it.
  assert.deepEqual(out.sessions.good.path, ['k']);
});

test('laps come back in recorded order across sessions', () => {
  const two = upsertSession(data(), {
    id: 's0',
    key: 'earlier',
    name: 'Earlier',
    path: ['earlier'],
    pathNames: ['Earlier'],
    startedAt: T0 - 5000,
    laps: [{ id: 'e', ms: 100, at: T0 - 4000 }],
  });
  assert.deepEqual(
    allLaps(two).map((entry) => entry.lap.id),
    ['e', 'l1', 'l2'],
  );
  assert.deepEqual(recordedRange(two), { from: T0 - 4000, to: T0 + 9000 });
});

test('an empty store has no recorded range at all', () => {
  assert.equal(recordedRange({ version: 1, sessions: {} }), undefined);
});

test('elapsed freezes while paused', () => {
  const running = {
    sessionId: 'r',
    key: 'doc',
    name: 'Doc',
    path: ['doc'],
    pathNames: ['Doc'],
    startedAt: T0,
    lapStartedAt: T0 + 1000,
    laps: [],
    pausedAt: T0 + 5000,
  };
  // The wall clock has moved on, but a paused stopwatch must not.
  assert.equal(elapsedOf(running, T0 + 60000), 5000);
  assert.equal(currentLapElapsed(running, T0 + 60000), 4000);

  const live = { ...running, pausedAt: undefined };
  assert.equal(elapsedOf(live, T0 + 60000), 60000);
  assert.equal(currentLapElapsed(live, T0 + 60000), 59000);
});

test('a running timer converts to a session with no end time', () => {
  const session = runningAsSession({
    sessionId: 'r',
    key: 'doc',
    name: 'Doc',
    path: ['folder', 'doc'],
    pathNames: ['Folder', 'Doc'],
    startedAt: T0,
    lapStartedAt: T0,
    laps: [{ id: 'a', ms: 5, at: T0 + 5 }],
  });
  assert.equal(session.id, 'r');
  assert.equal(session.endedAt, undefined, 'an in-flight run must not look finished');
  assert.deepEqual(session.path, ['folder', 'doc']);
});

test('stopping folds in the part lap that was still running', () => {
  // Discarding it would quietly lose the tail of every run, which for a timer
  // used to measure one continuous stretch is the whole measurement.
  const running = {
    sessionId: 'r',
    key: 'doc',
    name: 'Doc',
    path: ['folder', 'doc'],
    pathNames: ['Folder', 'Doc'],
    startedAt: T0,
    lapStartedAt: T0 + 5000,
    laps: [{ id: 'a', ms: 5000, at: T0 + 5000 }],
  };

  const { session, endedAt } = finishTimer(running, T0 + 9000);
  assert.equal(endedAt, T0 + 9000);
  assert.equal(session.laps.length, 2);
  assert.equal(session.laps[1].ms, 4000, 'the 4s since the last lap');
  assert.equal(session.endedAt, T0 + 9000, 'a stopped run is no longer in flight');
});

test('a paused run ended when it was paused, not when Stop was pressed', () => {
  const running = {
    sessionId: 'r',
    key: 'doc',
    name: 'Doc',
    path: ['doc'],
    pathNames: ['Doc'],
    startedAt: T0,
    lapStartedAt: T0,
    laps: [],
    pausedAt: T0 + 3000,
  };
  // Stop pressed an hour after pausing must not bank an hour.
  const { session } = finishTimer(running, T0 + 3600000);
  assert.equal(session.laps.length, 1);
  assert.equal(session.laps[0].ms, 3000);
});

test('a run that banked nothing leaves no empty session behind', () => {
  const running = {
    sessionId: 'r',
    key: 'doc',
    name: 'Doc',
    path: ['doc'],
    pathNames: ['Doc'],
    startedAt: T0,
    lapStartedAt: T0,
    laps: [],
  };
  // Started and stopped in the same instant: an empty session would otherwise
  // show up in every rollup contributing a session count and no time.
  assert.equal(finishTimer(running, T0).session, undefined);
});
