import * as React from 'react';
import { useLocalStorageState, usePlugin } from '@remnote/plugin-sdk';

import { STORAGE_KEYS } from '../lib/types.ts';
import type { PillOffset } from '../lib/types.ts';

/** Pointer travel, in pixels, before a press counts as a drag and not a click. */
const DRAG_THRESHOLD = 4;

/** Minimum gap between position writes while dragging, in milliseconds. */
const WRITE_INTERVAL = 60;

export interface DragApi {
  offset: PillOffset;
  dragging: boolean;
  /** Spread onto the element that should act as the grab handle. */
  handleProps: {
    onPointerDown: (event: React.PointerEvent) => void;
    style: React.CSSProperties;
  };
  /**
   * True when the press that just ended was a drag.
   *
   * The handle is also a button, so its click handler asks this before acting.
   */
  consumedClick: () => boolean;
  reset: () => Promise<void>;
}

/**
 * Drag the stopwatch to wherever the user wants it, and remember where.
 *
 * The position is ONE offset for the whole knowledge base rather than one per
 * document, and it is stored as a delta from wherever the placement setting
 * would have put the pill. An absolute point is not available to a sandboxed
 * iframe: it cannot see the host DOM, so it has no idea where it sits in the
 * host viewport. It can measure movement, though, because `screenX`/`screenY`
 * are screen relative and therefore mean the same thing in both documents.
 *
 * Local storage, not synced. The position is meant to follow the user around
 * their knowledge base, but a pixel offset that suits a desktop would be wrong
 * on a phone.
 */
export function useDragPosition(): DragApi {
  const plugin = usePlugin();
  // Read through the hook so the offset stays reactive; written through
  // plugin.storage below.
  const [stored] = useLocalStorageState<PillOffset | null>(STORAGE_KEYS.position, null);
  const [dragging, setDragging] = React.useState(false);

  const offset = stored ?? { x: 0, y: 0 };

  // Refs, not state: these are read inside pointer handlers that must not be
  // re-created mid-drag, and changing them must not re-render.
  const start = React.useRef<{ screenX: number; screenY: number; base: PillOffset } | null>(null);
  const moved = React.useRef(false);
  const lastWrite = React.useRef(0);
  const wasDrag = React.useRef(false);

  const commit = React.useCallback(
    (next: PillOffset) => {
      // Written through `plugin.storage.setLocal` rather than the hook's
      // setter. The identical bridge for the pill width goes through
      // `plugin.storage` directly and is known to reach the index plugin's
      // listener; the hook setter is the one part of this path that has never
      // been proven end to end, so it is not the part to rely on.
      void plugin.storage.setLocal(STORAGE_KEYS.position, next);
    },
    [plugin],
  );

  const onPointerDown = (event: React.PointerEvent) => {
    // Left button only. A right click here belongs to the context menu.
    if (event.button !== 0) return;

    start.current = { screenX: event.screenX, screenY: event.screenY, base: offset };
    moved.current = false;
    wasDrag.current = false;

    // Pointer capture is what makes this work at all. The iframe is only as big
    // as the pill, so the moment the cursor leaves it the events would go to
    // the host document and the drag would stall after a few pixels. Capture
    // keeps them coming to this element wherever the pointer goes.
    try {
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    } catch {
      // Not fatal: without capture the drag simply stops at the iframe edge.
    }
  };

  const onPointerMove = React.useCallback(
    (event: PointerEvent) => {
      const from = start.current;
      if (!from) return;

      const dx = event.screenX - from.screenX;
      const dy = event.screenY - from.screenY;

      if (!moved.current && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;

      if (!moved.current) {
        moved.current = true;
        wasDrag.current = true;
        setDragging(true);
      }

      // Throttled. Every write crosses to the index plugin and rewrites a
      // stylesheet, so a write per pointermove would rebuild the sheet a
      // hundred times a second.
      const now = Date.now();
      if (now - lastWrite.current < WRITE_INTERVAL) return;
      lastWrite.current = now;

      commit({ x: from.base.x + dx, y: from.base.y + dy });
    },
    [commit],
  );

  const onPointerUp = React.useCallback(
    (event: PointerEvent) => {
      const from = start.current;
      start.current = null;
      if (!from || !moved.current) {
        setDragging(false);
        return;
      }

      // Always write the true final position, whatever the throttle last saw.
      commit({ x: from.base.x + (event.screenX - from.screenX), y: from.base.y + (event.screenY - from.screenY) });
      setDragging(false);
    },
    [commit],
  );

  React.useEffect(() => {
    // On the window rather than the element: with pointer capture the events
    // are routed to the capturing element and bubble up to here, and this also
    // catches a pointerup that arrives after capture was lost.
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  return {
    offset,
    dragging,
    handleProps: {
      onPointerDown,
      // A pointer, not a grab hand. Drag does not work yet, and a grab cursor
      // advertises an affordance that is not there; the stopwatch's real job on
      // click is start and stop.
      style: { cursor: dragging ? 'grabbing' : 'pointer', touchAction: 'none' },
    },
    consumedClick: () => {
      const was = wasDrag.current;
      wasDrag.current = false;
      return was;
    },
    reset: async () => {
      await plugin.storage.setLocal(STORAGE_KEYS.position, null);
    },
  };
}
