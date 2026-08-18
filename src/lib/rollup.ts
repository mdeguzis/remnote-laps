import type { Lap, RemId, Session } from './types.ts';

/**
 * The rollup tree.
 *
 * One node per Rem that appears anywhere in a recorded path. `selfMs` is time
 * recorded on that Rem's own document; `totalMs` is that plus everything
 * beneath it. A folder therefore reports the sum of every document under it
 * without needing to know they exist, which is the behaviour the tree is for.
 */
export interface RollupNode {
  /** The Rem's unique key. The synthetic root uses `ROOT_KEY`. */
  key: RemId;
  name: string;
  /** Root first, this node last. */
  path: RemId[];
  selfMs: number;
  totalMs: number;
  selfLaps: number;
  totalLaps: number;
  selfSessions: number;
  totalSessions: number;
  /**
   * This node's index among its siblings in RemNote, or -1 when unknown.
   *
   * Ordering the tree by this rather than by recorded time is what makes it
   * read against the sidebar: a folder that sits below a document there should
   * sit below it here too.
   */
  order: number;
  children: Record<RemId, RollupNode>;
}

/**
 * The synthetic parent of every top level Rem.
 *
 * "all folders" needs somewhere to add up to, and a real Rem id would collide
 * with a document called the same thing.
 */
export const ROOT_KEY = '__laps_root__';

export interface RollupFilterOptions {
  /** Inclusive lower bound on lap timestamps. */
  from?: number;
  /** Inclusive upper bound on lap timestamps. */
  to?: number;
  /**
   * Restrict to laps recorded at or below this key.
   *
   * A key anywhere in the path counts, so scoping to a folder keeps every
   * document inside it.
   */
  scopeKey?: RemId;
}

function newNode(key: RemId, name: string, path: RemId[]): RollupNode {
  return {
    key,
    name,
    path,
    selfMs: 0,
    totalMs: 0,
    selfLaps: 0,
    totalLaps: 0,
    selfSessions: 0,
    totalSessions: 0,
    order: -1,
    children: {},
  };
}

export function lapInRange(lap: Lap, options: RollupFilterOptions): boolean {
  if (options.from !== undefined && lap.at < options.from) return false;
  if (options.to !== undefined && lap.at > options.to) return false;
  return true;
}

export function sessionInScope(session: Session, scopeKey?: RemId): boolean {
  if (!scopeKey) return true;
  return session.path.includes(scopeKey);
}

/**
 * A session narrowed to the laps in range, carrying the numbering it had before
 * the narrowing.
 *
 * `lapNumbers` exists because a lap's number is a property of the run, not of
 * whatever slice of it is on screen. Numbering the filtered array instead means
 * a date range that hides laps 1 and 2 renumbers lap 3 as lap 1, so the chart
 * tooltip and the lap list end up naming the same lap differently.
 */
export interface FilteredSession extends Session {
  lapNumbers: Record<string, number>;
  /**
   * The session before filtering.
   *
   * Anything describing the RUN rather than the selection reads from here: the
   * split times, the session total, which lap was fastest. Those must not move
   * when the user narrows the dates, or the fastest lap badge hops between rows
   * as the range changes.
   */
  original: Session;
}

/**
 * Laps of a session that survive the filter, in recorded order.
 *
 * Kept separate from `buildRollup` because the lap list, the chart and the tree
 * all need exactly this and must agree about what is in range. One filter,
 * three readers.
 */
export function filterSessions(sessions: Session[], options: RollupFilterOptions = {}): FilteredSession[] {
  const out: FilteredSession[] = [];
  for (const session of sessions) {
    if (!sessionInScope(session, options.scopeKey)) continue;

    // Numbered against the FULL session, before anything is dropped.
    const lapNumbers: Record<string, number> = {};
    session.laps.forEach((lap, index) => {
      lapNumbers[lap.id] = index + 1;
    });

    const laps = session.laps.filter((lap) => lapInRange(lap, options));
    if (laps.length === 0) continue;
    out.push({ ...session, laps, lapNumbers, original: session });
  }
  return out;
}

/**
 * Build the nested tree.
 *
 * Each session contributes to every node along its path: the leaf gets it as
 * `self`, and every node on the way down gets it as `total`. Walking the path
 * once per session is what makes the rollup a single pass rather than a
 * repeated descent.
 */
export function buildRollup(sessions: Session[], options: RollupFilterOptions = {}): RollupNode {
  const root = newNode(ROOT_KEY, 'All folders', []);

  for (const session of filterSessions(sessions, options)) {
    let ms = 0;
    for (const lap of session.laps) ms += lap.ms;
    const lapCount = session.laps.length;

    // A path is always meant to end at the document the session belongs to. A
    // session written by an older build, or one recorded against a Rem with no
    // resolvable parent, may not carry one; treat the key itself as the path so
    // the time still lands somewhere the user can find it.
    const path = session.path.length > 0 ? session.path : [session.key];
    const names = session.pathNames.length === path.length ? session.pathNames : path.map(() => session.name);

    let node = root;
    node.totalMs += ms;
    node.totalLaps += lapCount;
    node.totalSessions += 1;

    for (let depth = 0; depth < path.length; depth++) {
      const key = path[depth];
      const existing = node.children[key];
      const child = existing ?? newNode(key, names[depth] || 'Untitled', path.slice(0, depth + 1));
      if (!existing) node.children[key] = child;

      // Most recently recorded position wins, same rule as the name: moving a
      // document in the sidebar should move it here on the next lap.
      const order = session.pathOrders?.[depth];
      if (typeof order === 'number' && order >= 0) child.order = order;

      child.totalMs += ms;
      child.totalLaps += lapCount;
      child.totalSessions += 1;

      // A name recorded more recently wins. Renaming a folder should not leave
      // the tree showing whatever it was called the first time it was used.
      if (names[depth]) child.name = names[depth];

      if (depth === path.length - 1) {
        child.selfMs += ms;
        child.selfLaps += lapCount;
        child.selfSessions += 1;
      }

      node = child;
    }
  }

  return root;
}

/**
 * Children in the order RemNote shows them.
 *
 * Sibling position first, so the tree can be read against the sidebar. Anything
 * with no recorded position sorts after what does, heaviest first, which is
 * where sessions recorded before positions were captured end up.
 */
export function sortedChildren(node: RollupNode): RollupNode[] {
  return Object.values(node.children).sort((a, b) => {
    const aKnown = a.order >= 0;
    const bKnown = b.order >= 0;
    if (aKnown && bKnown && a.order !== b.order) return a.order - b.order;
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    return b.totalMs - a.totalMs || a.name.localeCompare(b.name);
  });
}

/** How many descendants a node has, for the count on a collapsed folder. */
export function descendantCount(node: RollupNode): number {
  let total = 0;
  for (const child of Object.values(node.children)) total += 1 + descendantCount(child);
  return total;
}

/**
 * The documents that actually have time on them, heaviest first.
 *
 * `selfMs`, not `totalMs`, so this lists the places time was recorded rather
 * than every folder above them. Used to answer "nothing here" with "here is
 * where it is instead", which is far more use than the bare statement.
 */
export function topRecorded(root: RollupNode, limit = 5): RollupNode[] {
  const out: RollupNode[] = [];
  const walk = (node: RollupNode) => {
    if (node.selfMs > 0 && node.key !== ROOT_KEY) out.push(node);
    for (const child of Object.values(node.children)) walk(child);
  };
  walk(root);
  return out.sort((a, b) => b.selfMs - a.selfMs).slice(0, limit);
}

/** Find a node by key anywhere in the tree. */
export function findNode(root: RollupNode, key: RemId): RollupNode | undefined {
  if (root.key === key) return root;
  for (const child of Object.values(root.children)) {
    const hit = findNode(child, key);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * The tree as plain nested JSON, for the popup's Copy JSON button.
 *
 * Deliberately drops the internal `path` and `children` map keys: what a person
 * pasting this into a scratch file wants is a readable tree, not the indexes we
 * needed to build it.
 */
export function toPlainJSON(node: RollupNode): Record<string, unknown> {
  const children = sortedChildren(node).map(toPlainJSON);
  const out: Record<string, unknown> = {
    key: node.key,
    name: node.name,
    selfMs: node.selfMs,
    totalMs: node.totalMs,
    laps: node.totalLaps,
    sessions: node.totalSessions,
  };
  if (children.length > 0) out.children = children;
  return out;
}
