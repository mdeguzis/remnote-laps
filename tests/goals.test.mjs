import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clearGoal, measureGoal, normalizeGoals, setGoal } from '../src/lib/goals.ts';

/*
 * Goals measure against the ROLLED UP total, so a goal on a folder is met by
 * work anywhere beneath it. That has to match the totals shown beside it, or
 * the page contradicts itself.
 */

const node = (totalMs, totalLaps) => ({ totalMs, totalLaps, selfMs: 0, selfLaps: 0 });

test('a time goal reports how far along it is', () => {
  const progress = measureGoal({ targetMs: 3600000, setAt: 0 }, node(900000, 3));
  // The panel shows "X of Y" and a countdown, so both the current total and the
  // remainder have to come back, not just the fraction.
  assert.equal(progress.currentMs, 900000);
  assert.equal(progress.currentLaps, 3);
  assert.equal(progress.timeFraction, 0.25);
  assert.equal(progress.overall, 0.25);
  assert.equal(progress.met, false);
  assert.equal(progress.msRemaining, 2700000);
  assert.equal(progress.lapFraction, undefined);
});

test('a lap goal counts laps', () => {
  const progress = measureGoal({ targetLaps: 10, setAt: 0 }, node(0, 4));
  assert.equal(progress.lapFraction, 0.4);
  assert.equal(progress.lapsRemaining, 6);
  assert.equal(progress.met, false);
});

test('both targets means the goal is met only when both are', () => {
  const goal = { targetMs: 1000, targetLaps: 10, setAt: 0 };

  // Time done, laps nowhere near.
  const half = measureGoal(goal, node(5000, 1));
  assert.equal(half.met, false);
  // The bar shows the LESSER half. Showing the greater would read as nearly
  // finished while the half that is actually behind has barely started.
  assert.equal(half.overall, 0.1);

  assert.equal(measureGoal(goal, node(1000, 10)).met, true);
});

test('beating a target does not push the bar past full', () => {
  const progress = measureGoal({ targetMs: 1000, setAt: 0 }, node(9000, 0));
  assert.equal(progress.timeFraction, 1);
  assert.equal(progress.overall, 1);
  assert.equal(progress.met, true);
  assert.equal(progress.msRemaining, 0);
});

test('a goal on something with nothing recorded is at zero, not undefined', () => {
  const progress = measureGoal({ targetMs: 1000, setAt: 0 }, undefined);
  assert.equal(progress.overall, 0);
  assert.equal(progress.met, false);
});

test('no goal measures to nothing, so the UI can render nothing', () => {
  assert.equal(measureGoal(undefined, node(5, 5)), undefined);
});

test('setting and clearing a goal leaves the others alone', () => {
  const first = setGoal({}, 'a', { targetMs: 1000 }, 111);
  assert.equal(first.a.targetMs, 1000);
  assert.equal(first.a.setAt, 111);

  const both = setGoal(first, 'b', { targetLaps: 5 }, 222);
  assert.equal(Object.keys(both).length, 2);
  assert.equal(clearGoal(both, 'a').a, undefined);
  assert.equal(clearGoal(both, 'a').b.targetLaps, 5);
});

test('saving a goal with neither target removes it', () => {
  // Otherwise it renders as an empty progress bar that can never be met.
  const goals = setGoal({}, 'a', { targetMs: 1000 });
  assert.deepEqual(setGoal(goals, 'a', {}), {});
});

test('malformed stored goals degrade rather than crash', () => {
  for (const bad of [undefined, null, 4, 'no']) {
    assert.deepEqual(normalizeGoals(bad), {});
  }

  const mixed = {
    good: { targetMs: 1000, setAt: 5 },
    zero: { targetMs: 0 },
    negative: { targetLaps: -3 },
    empty: {},
    wrongType: { targetMs: 'lots' },
    fractional: { targetLaps: 4.6, setAt: 1 },
  };
  const out = normalizeGoals(mixed);
  assert.deepEqual(Object.keys(out).sort(), ['fractional', 'good']);
  assert.equal(out.fractional.targetLaps, 5, 'lap counts are whole numbers');
  assert.equal(out.good.setAt, 5);
});
