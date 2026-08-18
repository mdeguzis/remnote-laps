/**
 * CSS injected into the HOST document, as opposed to the widget iframes.
 *
 * A widget cannot reach outside its iframe, and RemNote drops the plugin
 * container in normal flow directly after `.rn-doc-header`, one full row below
 * the Add Template pill. There is no widget location inside that row, so the
 * only way to sit beside Add Template is to move the container from the host
 * side with `plugin.app.registerCSS`, which only the index plugin may call.
 *
 * The real markup this targets, from a daily document:
 *
 *   <div class="rn-doc-header">
 *     <div id="doc-title" class="... flex flex-wrap gap-2 justify-between">
 *       <div>August 14th - Friday</div>
 *       <div class="flex flex-wrap gap-3">
 *         <span contenteditable="false" class="flex">
 *           <button data-test="Daily Doc Add Template Pill Trigger">
 *   <div class="fade-in-first-load relative">
 *     <div style="display:flex">
 *       <iframe class="rn-plugin-root" data-plugin-id="remnote-laps-dev">
 *
 * Everything is hung off `data-test` and `data-plugin-id` rather than the
 * Tailwind classes beside them, because those classes describe how the element
 * looks and change on any restyle.
 */

import type { PillOffset } from './types.ts';

export type Placement = 'under' | 'inline' | 'center' | 'left';

/** The plugin's container in the host document. */
const CONTAINER = '.rn-doc-header + div:has(iframe.rn-plugin-root[data-plugin-id^="remnote-laps"])';

/**
 * How far a drag may move the pill from its anchored spot.
 *
 * The delta is applied blind, with no way to check the result against the
 * viewport from here, so the cap is what stops a stray drag parking the
 * stopwatch somewhere unreachable. "Laps: Reset the stopwatch position" is the
 * way back if it still lands somewhere awkward.
 */
const MAX_OFFSET = 1600;

function clampOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(MAX_OFFSET, Math.max(-MAX_OFFSET, value)));
}

function hasOffset(offset: PillOffset | undefined): offset is PillOffset {
  return !!offset && (offset.x !== 0 || offset.y !== 0);
}

/**
 * The transform carrying the user's drag.
 *
 * A translate on top of whatever the placement rules already did, rather than
 * absolute coordinates. The pill keeps its anchoring, so it still scrolls with
 * the header and still sits relative to Add Template, and the drag is a nudge
 * from there. It is also the only thing a sandboxed iframe can measure: it
 * cannot learn where it sits in the host viewport, but `screenX`/`screenY`
 * deltas mean the same in both documents.
 *
 * Deliberately does NOT set `position`. The inline placement below is
 * `position: absolute` for the anchoring, and this block is emitted after it at
 * equal specificity, so declaring position here would silently win and drop the
 * pill back out of the title row. The caller passes `positioned` for the flow
 * placements, where the container is static and needs a position for z-index
 * to mean anything.
 */
function offsetCSS(offset: PillOffset | undefined, positioned: boolean): string {
  if (!hasOffset(offset)) return '';
  return `
${CONTAINER} {
  transform: translate(${clampOffset(offset.x)}px, ${clampOffset(offset.y)}px);
  /* Above the editor, or a dragged pill ends up behind the text it overlaps. */
  z-index: 30;${positioned ? '\n  position: relative;' : ''}
}
`;
}

/**
 * Build the whole host stylesheet.
 *
 * `widthPx` is measured by the widget and passed across through session
 * storage, because the host cannot measure inside a cross-origin iframe and the
 * widget cannot write host CSS. It keeps the reserved gap exactly as wide as
 * the pill actually is, including when the lap chip appears mid-run.
 */
/**
 * Width of the lifted slot, in pixels.
 *
 * A FIXED width, after two failed attempts at measuring it.
 *
 * The widget lives in an iframe, and an iframe clips anything wider than
 * itself, so the host has to size the container before the content can fit.
 * That meant the widget measuring itself and shipping the number over storage,
 * which failed in two different ways: flex items shrank to fit and reported the
 * squeezed width, and a full width wrapper reported the iframe's own width.
 * Both produced a stable loop at the wrong size, and neither announced itself.
 *
 * The row's widest state is the running controls at roughly 300px. Reserving a
 * constant more than covers it, costs a predictable amount of the title row,
 * and cannot converge on a wrong answer. The widget right-aligns inside it, so
 * the idle pill and the open controls both sit flush against the same edge.
 */
const LIFTED_WIDTH = 360;

export function hostCSS(placement: Placement, _widthPx: number, offset?: PillOffset): string {
  // Own-row placements need no host CSS beyond the drag transform: the widget
  // renders in normal flow and justifies itself.
  if (placement !== 'under' && placement !== 'inline') return offsetCSS(offset, true);

  return `
/* The plugin container is a SIBLING of the header, so the shared parent has to
   become the positioning context before anything can be lifted into the row. */
:where(div):has(> .rn-doc-header) { position: relative; }

/* Reserve the slot at the right end of the title row, but ONLY on a document
   that has an Add Template pill. Scoped with :has() because the last child of
   #doc-title is the title itself on an ordinary document, and giving THAT a
   margin would shove the heading around. NOTE: no backticks in these comments,
   they terminate the surrounding template literal. */
#doc-title > div:last-child:has([data-test="Daily Doc Add Template Pill Trigger"]) {
  margin-right: ${LIFTED_WIDTH + 14}px;
}

${CONTAINER} {
  position: absolute;
  /* Level with the title row rather than a row below it. The nudge lines the
     28px pill up against the heading's line box instead of its top edge. */
  top: 2px;
  right: 0;
  width: ${LIFTED_WIDTH}px;
  /* RemNote sets overflow:hidden inline on this container, which would clip the
     focus ring and hover shadow. */
  overflow: visible !important;
  z-index: 20;
}
${offsetCSS(offset, false)}
`;
}
