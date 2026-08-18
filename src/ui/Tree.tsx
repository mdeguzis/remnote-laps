import * as React from 'react';

import { formatCoarse } from '../lib/format.ts';
import { ROOT_KEY, descendantCount, sortedChildren } from '../lib/rollup.ts';
import type { RollupNode } from '../lib/rollup.ts';

export interface TreeProps {
  root: RollupNode;
  /** The key the stats are currently scoped to. */
  scopeKey: string;
  onScope: (key: string, name: string) => void;
}

/**
 * The rollup tree.
 *
 * Every row reports its own time and everything beneath it, so picking a folder
 * answers "how long did I spend anywhere under here" without the user having to
 * add anything up. Clicking a row rescopes the whole page, which is the
 * "per level / per path" filter: the levels are the tree, and a path is a row
 * in it.
 */
export function Tree({ root, scopeKey, onScope }: TreeProps): JSX.Element {
  const children = sortedChildren(root);

  if (children.length === 0) {
    return <div className="laps-empty">Nothing recorded yet.</div>;
  }

  return (
    <div className="laps-tree">
      <Row
        node={root}
        depth={0}
        maxMs={root.totalMs}
        scopeKey={scopeKey}
        onScope={onScope}
        forceOpen
      />
    </div>
  );
}

function Row({
  node,
  depth,
  maxMs,
  scopeKey,
  onScope,
  forceOpen,
}: {
  node: RollupNode;
  depth: number;
  maxMs: number;
  scopeKey: string;
  onScope: TreeProps['onScope'];
  forceOpen?: boolean;
}): JSX.Element {
  // Open the first couple of levels by default. Deep trees collapsed to nothing
  // hide the very rollup the page exists to show; fully expanded ones bury it.
  const [open, setOpen] = React.useState(depth < 2);
  const expanded = forceOpen || open;
  const children = sortedChildren(node);
  const hasChildren = children.length > 0;
  const scoped = node.key === scopeKey || (node.key === ROOT_KEY && scopeKey === '');
  const share = maxMs > 0 ? Math.min(1, node.totalMs / maxMs) : 0;

  return (
    <>
      <div
        className={`laps-tree__row${scoped ? ' laps-tree__row--scoped' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => onScope(node.key === ROOT_KEY ? '' : node.key, node.name)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onScope(node.key === ROOT_KEY ? '' : node.key, node.name);
        }}
        title={`${node.name} - ${formatCoarse(node.totalMs)} including everything below it`}
      >
        <span
          className="laps-tree__twisty"
          onClick={(event) => {
            // The twisty must not also rescope the page, or expanding a folder
            // silently changes what the chart beside it is showing.
            event.stopPropagation();
            if (hasChildren && !forceOpen) setOpen((value) => !value);
          }}
        >
          {hasChildren && !forceOpen ? (expanded ? '▾' : '▸') : ''}
        </span>
        <span className="laps-tree__name">{node.name}</span>
        {/* Collapsed folders say how much is hidden, so the tree does not look
            like it simply ends there. The slot is ALWAYS rendered, empty when
            there is nothing to say, so expanding a folder does not shift the
            bars beside it. */}
        <span className="laps-tree__hidden">
          {hasChildren && !expanded ? `(${descendantCount(node)})` : ''}
        </span>
        <span className="laps-tree__bar">
          <span style={{ width: `${(share * 100).toFixed(1)}%` }} />
        </span>
        <span className="laps-tree__total">{formatCoarse(node.totalMs)}</span>
        <span className="laps-tree__count">
          {node.totalLaps} lap{node.totalLaps === 1 ? '' : 's'}
        </span>
      </div>

      {expanded
        ? children.map((child) => (
            <Row key={child.key} node={child} depth={depth + 1} maxMs={maxMs} scopeKey={scopeKey} onScope={onScope} />
          ))
        : null}
    </>
  );
}
