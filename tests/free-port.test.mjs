import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isThemeProjectName } from '../scripts/free-port.mjs';

/*
 * Which processes the port guard is willing to stop.
 *
 * The guard exists so that a stale dev server does not block a restart, and the
 * whole point of it is that it refuses to kill anything else. It is widened here
 * from the themes-only rule to cover every `remnote-*` project, because this
 * plugin and the themes share port 8080 and switching between them is routine.
 * That widening is only safe while the test stays narrow, so the narrowness is
 * what is pinned below.
 *
 * Importing this file at all also checks something: free-port only runs its
 * main routine when invoked directly. Without that guard, importing it killed
 * whatever dev server was running.
 */

test('our RemNote projects are recognised', () => {
  assert.ok(isThemeProjectName('remnote-laps'));
  assert.ok(isThemeProjectName('remnote-koneko-theme'));
  assert.ok(isThemeProjectName('remnote-sakura-theme'));
});

test('nothing else is', () => {
  for (const name of [
    'my-app',
    'proton-pulse-web',
    'webpack-dev-server',
    // A trailing separator is a typo, not a project, and matching it would
    // start widening the rule by accident.
    'remnote-',
    'remnote_laps',
    'Remnote-Laps',
    '',
    null,
    undefined,
    42,
  ]) {
    assert.equal(isThemeProjectName(name), false, `${String(name)} should not be treated as ours`);
  }
});
