import type { RemId } from './types.ts';

/**
 * The Rem API surface needed to resolve a document's place in the tree.
 *
 * Structural again, so the walk can be tested against a fake knowledge base
 * instead of a running RemNote.
 */
export interface HierarchyHost {
  rem: {
    findOne: (
      remId: RemId | undefined,
    ) => Promise<{ _id: RemId; parent: RemId | null; text?: unknown; children?: RemId[] } | undefined>;
  };
  richText: {
    toString: (richText: any) => Promise<string>;
  };
}

export interface ResolvedPath {
  key: RemId;
  name: string;
  /** Root first, the document itself last. */
  path: RemId[];
  pathNames: string[];
  /**
   * Each entry's index among its parent's children, parallel to `path`.
   *
   * Recorded so the rollup tree can be ordered the way RemNote's own sidebar
   * orders it. Sorting by recorded time instead put a folder above a document
   * that sits below it in the sidebar, which makes the two views hard to read
   * against each other. -1 where the position could not be determined.
   */
  pathOrders: number[];
}

/**
 * A cycle in the parent chain would hang the walk forever, and a knowledge base
 * deep enough to hit this legitimately does not exist. The cap turns a hang
 * into a truncated path, which is recoverable and visible.
 */
const MAX_DEPTH = 64;

/**
 * Walk from a Rem up to the top of the knowledge base.
 *
 * There is no `getAncestors` in the SDK, so this follows the `parent` field one
 * `findOne` at a time. The result is snapshotted into the session at record
 * time and never resolved again, so this runs once per session rather than once
 * per render.
 */
export async function resolvePath(plugin: HierarchyHost, remId: RemId): Promise<ResolvedPath | undefined> {
  const start = await plugin.rem.findOne(remId);
  if (!start) return undefined;

  const ids: RemId[] = [];
  const names: string[] = [];
  const orders: number[] = [];
  const seen = new Set<RemId>();

  let current: { _id: RemId; parent: RemId | null; text?: unknown; children?: RemId[] } | undefined = start;
  let depth = 0;

  while (current && depth < MAX_DEPTH) {
    if (seen.has(current._id)) break;
    seen.add(current._id);

    ids.push(current._id);
    names.push(await nameOf(plugin, current));

    if (!current.parent) {
      orders.push(-1);
      break;
    }

    const parent = await plugin.rem.findOne(current.parent);
    // The parent's `children` array IS the sidebar's order, so a Rem's index in
    // it is exactly the position the sidebar shows it at.
    orders.push(parent?.children?.indexOf(current._id) ?? -1);
    current = parent;
    depth += 1;
  }

  // Collected child-first while walking up; the tree wants root-first.
  ids.reverse();
  names.reverse();
  orders.reverse();

  return {
    key: remId,
    name: names[names.length - 1] ?? 'Untitled',
    path: ids,
    pathNames: names,
    pathOrders: orders,
  };
}

async function nameOf(plugin: HierarchyHost, rem: { text?: unknown }): Promise<string> {
  if (!rem.text) return 'Untitled';
  try {
    const text = (await plugin.richText.toString(rem.text)).trim();
    return text || 'Untitled';
  } catch {
    // A Rem whose text will not render is still a valid place to hang time
    // against, so name it and carry on rather than losing the whole path.
    return 'Untitled';
  }
}
