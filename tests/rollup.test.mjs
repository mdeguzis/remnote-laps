import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROOT_KEY,
  buildRollup,
  filterSessions,
  findNode,
  descendantCount,
  sortedChildren,
  toPlainJSON,
  topRecorded,
} from '../src/lib/rollup.ts';

/*
 * The rollup is the whole idea of the plugin: a lap belongs to a document's
 * key, and that key rolls up through every folder above it to a single total
 * for everything. Everything else on the stats page is a view onto this.
 */

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 0, 5, 9, 0, 0, 0).getTime();

function session(id, path, names, laps) {
  return {
    id,
    key: path[path.length - 1],
    name: names[names.length - 1],
    path,
    pathNames: names,
    startedAt: laps[0]?.at ?? T0,
    endedAt: laps[laps.length - 1]?.at,
    laps: laps.map((lap, index) => ({ id: `${id}-l${index}`, ms: lap.ms, at: lap.at })),
  };
}

// Study
//   Maths
//     Algebra   (2 sessions: 3000ms + 5000ms, then 1000ms)
//     Calculus  (4000ms)
//   Reading
//     Novel     (10000ms)
const SESSIONS = [
  session('s1', ['study', 'maths', 'algebra'], ['Study', 'Maths', 'Algebra'], [
    { ms: 3000, at: T0 },
    { ms: 5000, at: T0 + 60000 },
  ]),
  session('s2', ['study', 'maths', 'algebra'], ['Study', 'Maths', 'Algebra'], [{ ms: 1000, at: T0 + 2 * DAY }]),
  session('s3', ['study', 'maths', 'calculus'], ['Study', 'Maths', 'Calculus'], [{ ms: 4000, at: T0 + DAY }]),
  session('s4', ['study', 'reading', 'novel'], ['Study', 'Reading', 'Novel'], [{ ms: 10000, at: T0 + DAY }]),
];

test('a document reports only its own time as self', () => {
  const root = buildRollup(SESSIONS);
  const algebra = findNode(root, 'algebra');
  assert.equal(algebra.selfMs, 9000);
  assert.equal(algebra.totalMs, 9000);
  assert.equal(algebra.selfLaps, 3);
  assert.equal(algebra.selfSessions, 2);
});

test('a folder totals everything beneath it and claims none of it as its own', () => {
  const root = buildRollup(SESSIONS);
  const maths = findNode(root, 'maths');
  assert.equal(maths.totalMs, 13000, 'algebra 9000 + calculus 4000');
  assert.equal(maths.selfMs, 0, 'no lap was recorded on the folder itself');
  assert.equal(maths.totalLaps, 4);
  assert.equal(maths.totalSessions, 3);
});

test('every folder rolls up to one total for everything', () => {
  const root = buildRollup(SESSIONS);
  assert.equal(root.key, ROOT_KEY);
  assert.equal(root.totalMs, 23000);
  assert.equal(findNode(root, 'study').totalMs, 23000);
  assert.equal(findNode(root, 'reading').totalMs, 10000);
});

test('time recorded on a folder itself is kept separate from the rollup', () => {
  // A folder can be a document too. Its own laps must show up as self AND be
  // included in the total, without being double counted.
  const withFolderTime = [
    ...SESSIONS,
    session('s5', ['study', 'maths'], ['Study', 'Maths'], [{ ms: 2000, at: T0 + 3 * DAY }]),
  ];
  const maths = findNode(buildRollup(withFolderTime), 'maths');
  assert.equal(maths.selfMs, 2000);
  assert.equal(maths.totalMs, 15000);
});

test('a date range filters laps, not whole sessions', () => {
  // Session s1 has one lap on day 0 and one a minute later, so a range that
  // covers only day 0 must still include both of them and nothing from day 1.
  const root = buildRollup(SESSIONS, { from: T0 - 1000, to: T0 + DAY - 1 });
  assert.equal(root.totalMs, 8000);
  assert.equal(findNode(root, 'calculus'), undefined, 'day 1 should be out of range entirely');
});

test('a range that catches part of a session keeps only the laps inside it', () => {
  const partial = filterSessions(SESSIONS, { from: T0 + 30000, to: T0 + 90000 });
  assert.equal(partial.length, 1);
  assert.equal(partial[0].laps.length, 1);
  assert.equal(partial[0].laps[0].ms, 5000);
});

test('a filtered session still knows the numbering of the whole run', () => {
  // The chart tooltip and the lap list both read numbers from here. Numbering
  // the filtered array instead would renumber lap 2 as lap 1 the moment a date
  // range hid lap 1, and the two views would name the same lap differently.
  const [filtered] = filterSessions(SESSIONS, { from: T0 + 30000, to: T0 + 90000 });
  assert.equal(filtered.laps.length, 1);
  assert.equal(filtered.lapNumbers[filtered.laps[0].id], 2);
  assert.equal(filtered.original.laps.length, 2, 'the unfiltered run stays reachable for splits and totals');
});

test('scoping to a folder keeps everything below it', () => {
  // This is what right clicking a folder does: that item AND everything under
  // it, which is why the scope key is matched anywhere in the path rather than
  // only at the leaf.
  const scoped = filterSessions(SESSIONS, { scopeKey: 'maths' });
  assert.deepEqual(
    scoped.map((s) => s.id),
    ['s1', 's2', 's3'],
  );
});

test('scoping to a document keeps only that document', () => {
  const scoped = filterSessions(SESSIONS, { scopeKey: 'novel' });
  assert.deepEqual(
    scoped.map((s) => s.id),
    ['s4'],
  );
});

test('scoping to something with nothing recorded returns nothing rather than everything', () => {
  assert.deepEqual(filterSessions(SESSIONS, { scopeKey: 'chemistry' }), []);
});

test('children come back heaviest first', () => {
  const study = findNode(buildRollup(SESSIONS), 'study');
  assert.deepEqual(
    sortedChildren(study).map((node) => node.name),
    ['Maths', 'Reading'],
  );
});

test('the most recent name for a folder wins', () => {
  // Renaming a folder must not leave the tree showing whatever it was called
  // the first time it was used.
  const renamed = [
    session('a', ['study', 'maths'], ['Study', 'Maths'], [{ ms: 1000, at: T0 }]),
    session('b', ['study', 'maths'], ['Study', 'Mathematics'], [{ ms: 1000, at: T0 + DAY }]),
  ];
  assert.equal(findNode(buildRollup(renamed), 'maths').name, 'Mathematics');
});

test('a session with no path still lands somewhere findable', () => {
  const orphan = {
    id: 'orphan',
    key: 'loose',
    name: 'Loose note',
    path: [],
    pathNames: [],
    startedAt: T0,
    laps: [{ id: 'x', ms: 7000, at: T0 }],
  };
  const root = buildRollup([orphan]);
  assert.equal(root.totalMs, 7000);
  assert.equal(findNode(root, 'loose').selfMs, 7000);
});

test('the tree serialises to nested JSON', () => {
  const json = toPlainJSON(buildRollup(SESSIONS));
  assert.equal(json.totalMs, 23000);
  const study = json.children[0];
  assert.equal(study.name, 'Study');
  const maths = study.children.find((child) => child.name === 'Maths');
  assert.equal(maths.totalMs, 13000);
  assert.equal(maths.children.find((child) => child.name === 'Algebra').totalMs, 9000);
  // Leaves carry no empty children array to read past.
  assert.equal('children' in maths.children[0], false);
});

test('an empty store produces an empty tree rather than throwing', () => {
  const root = buildRollup([]);
  assert.equal(root.totalMs, 0);
  assert.deepEqual(sortedChildren(root), []);
});

test('the places time was actually recorded come back heaviest first', () => {
  // selfMs, not totalMs, so this lists documents rather than every folder above
  // them. The empty state uses it to answer "nothing here" with "here instead".
  const top = topRecorded(buildRollup(SESSIONS));
  assert.deepEqual(
    top.map((node) => [node.name, node.selfMs]),
    [
      ['Novel', 10000],
      ['Algebra', 9000],
      ['Calculus', 4000],
    ],
  );
  // Folders carry the rolled up total but recorded none of it themselves, so
  // they must not appear.
  assert.equal(
    top.some((node) => node.name === 'Maths' || node.name === 'Study'),
    false,
  );
});

test('an empty store has nowhere to point at', () => {
  assert.deepEqual(topRecorded(buildRollup([])), []);
});

test('children come back in sidebar order, not heaviest first', () => {
  // The tree sits next to RemNote's own sidebar, so the two have to be readable
  // against each other. Ordering by time put a heavy folder above a document
  // that sits below it in the sidebar.
  const ordered = [
    {
      id: 'a',
      key: 'light',
      name: 'Light',
      path: ['root', 'light'],
      pathNames: ['Root', 'Light'],
      pathOrders: [0, 0],
      startedAt: T0,
      laps: [{ id: 'x', ms: 1000, at: T0 }],
    },
    {
      id: 'b',
      key: 'heavy',
      name: 'Heavy',
      path: ['root', 'heavy'],
      pathNames: ['Root', 'Heavy'],
      pathOrders: [0, 1],
      startedAt: T0,
      laps: [{ id: 'y', ms: 90000, at: T0 }],
    },
  ];
  const root = findNode(buildRollup(ordered), 'root');
  assert.deepEqual(
    sortedChildren(root).map((node) => node.name),
    ['Light', 'Heavy'],
  );
});

test('anything with no recorded position sorts after what has one', () => {
  // Sessions recorded before positions were captured must not scramble the
  // ones that do have them.
  const mixed = [
    {
      id: 'old',
      key: 'legacy',
      name: 'Legacy',
      path: ['root', 'legacy'],
      pathNames: ['Root', 'Legacy'],
      startedAt: T0,
      laps: [{ id: 'x', ms: 90000, at: T0 }],
    },
    {
      id: 'new',
      key: 'placed',
      name: 'Placed',
      path: ['root', 'placed'],
      pathNames: ['Root', 'Placed'],
      pathOrders: [0, 3],
      startedAt: T0,
      laps: [{ id: 'y', ms: 1000, at: T0 }],
    },
  ];
  assert.deepEqual(
    sortedChildren(findNode(buildRollup(mixed), 'root')).map((node) => node.name),
    ['Placed', 'Legacy'],
  );
});

test('a collapsed folder can say how much it is hiding', () => {
  const root = buildRollup(SESSIONS);
  // Study contains Maths, Reading, Algebra, Calculus and Novel.
  assert.equal(descendantCount(findNode(root, 'study')), 5);
  assert.equal(descendantCount(findNode(root, 'maths')), 2);
  assert.equal(descendantCount(findNode(root, 'novel')), 0, 'a leaf hides nothing');
});
