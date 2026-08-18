import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatClock,
  formatCoarse,
  formatDuration,
  formatHMS,
  fromDateInputEnd,
  fromDateInputStart,
  parseDuration,
  toDateInput,
} from '../src/lib/format.ts';

test('durations drop the fields they do not need', () => {
  assert.equal(formatDuration(4062), '4.062');
  assert.equal(formatDuration(64062), '1:04.062');
  assert.equal(formatDuration(3664062), '1:01:04.062');
  assert.equal(formatDuration(0), '0.000');
});

test('durations never go negative', () => {
  assert.equal(formatDuration(-500), '0.000');
  assert.equal(formatClock(-500), '00:00.0');
  assert.equal(formatHMS(-500, false), '00:00:00');
});

/*
 * The edit field is seeded with formatDuration and validated with
 * parseDuration. If those two ever disagree, every lap row refuses its own
 * value the moment you click Edit, so the round trip is pinned here rather than
 * each direction being checked alone.
 */
test('every duration the UI prints can be read back unchanged', () => {
  for (const ms of [0, 1, 999, 1000, 4062, 59999, 60000, 64062, 3599999, 3600000, 3664062, 45296789]) {
    assert.equal(parseDuration(formatDuration(ms)), ms, `round trip failed for ${ms}ms`);
  }
});

test('parsing accepts the shapes a person actually types', () => {
  assert.equal(parseDuration('4'), 4000);
  assert.equal(parseDuration('4.5'), 4500);
  assert.equal(parseDuration('4,5'), 4500);
  assert.equal(parseDuration('1:04'), 64000);
  assert.equal(parseDuration('1:01:04'), 3664000);
  assert.equal(parseDuration('  7.25  '), 7250);
});

test('a fraction pads on the right, not the left', () => {
  // ".5" is five hundred milliseconds. Reading it as five would silently
  // shorten every edited lap by almost half a second.
  assert.equal(parseDuration('0.5'), 500);
  assert.equal(parseDuration('0.05'), 50);
  assert.equal(parseDuration('0.005'), 5);
});

test('a bare number is a count of seconds, however big', () => {
  // "60" means a minute, not an error. A field is only capped when something
  // bigger sits to its left, so a plain count is never refused.
  assert.equal(parseDuration('60'), 60000);
  assert.equal(parseDuration('90'), 90000);
  assert.equal(parseDuration('3600'), 3600000);
  // Likewise minutes with no hours beside them.
  assert.equal(parseDuration('90:00'), 90 * 60000);
});

test('unparseable input is undefined, never zero', () => {
  // Returning 0 here would let a typo silently wipe a lap time instead of the
  // row refusing the edit.
  for (const bad of ['', '   ', 'abc', '1:2:3:4', '4.1234', '-4', '1:-2']) {
    assert.equal(parseDuration(bad), undefined, `"${bad}" should not parse`);
  }
});

test('a field IS capped once something bigger sits to its left', () => {
  // 75 cannot be seconds when a minutes field precedes it, so this is a typo
  // rather than a shorthand.
  assert.equal(parseDuration('1:75'), undefined);
  assert.equal(parseDuration('1:70:00'), undefined, 'minutes are capped once hours are present');
  assert.equal(parseDuration('1:00:75'), undefined);
});

test('the chip readout keeps a fixed shape', () => {
  assert.equal(formatHMS(0, false), '00:00:00');
  assert.equal(formatHMS(4062, false), '00:00:04');
  assert.equal(formatHMS(4062, true), '00:00:04.062');
  // Still three segments past an hour, so the box never changes width mid-run.
  assert.equal(formatHMS(3664062, false), '01:01:04');
});

test('coarse totals stay readable at every scale', () => {
  assert.equal(formatCoarse(4062), '4.1s');
  assert.equal(formatCoarse(64062), '1m 04s');
  assert.equal(formatCoarse(3664062), '1h 01m');
});

test('date inputs round trip through local midnight', () => {
  const noon = new Date(2026, 7, 18, 12, 30, 0, 0).getTime();
  const text = toDateInput(noon);
  assert.equal(text, '2026-08-18');

  const start = fromDateInputStart(text);
  const end = fromDateInputEnd(text);
  assert.ok(start !== undefined && end !== undefined);
  assert.ok(start <= noon && noon <= end, 'noon should fall inside its own day');

  // Inclusive to the last millisecond: typing the same date in both boxes has
  // to mean "that day", not an empty instant.
  assert.equal(end - start, 24 * 60 * 60 * 1000 - 1);
});

test('a malformed date is undefined rather than epoch zero', () => {
  for (const bad of ['', '2026-8-18', 'yesterday', '18-08-2026']) {
    assert.equal(fromDateInputStart(bad), undefined);
    assert.equal(fromDateInputEnd(bad), undefined);
  }
});
