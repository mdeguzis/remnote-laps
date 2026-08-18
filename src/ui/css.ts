/**
 * The whole stylesheet, as a string.
 *
 * Widgets render in their own iframes, so there is no shared document to attach
 * a stylesheet to and no benefit in a separate CSS build step. Each widget
 * drops this into a `<style>` tag, and the palette block from
 * `settings.paletteCSS` goes in alongside it so a settings change repaints
 * without a reload.
 *
 * Surfaces lean on RemNote's own `rn-clr-*` classes wherever one exists, which
 * is why there is so little colour here: those classes already track the app's
 * light and dark palettes, and anything hardcoded would drift the first time
 * the user switched theme.
 */
export const BASE_CSS = `
/* The widget document is ours alone, and the browser default 8px body margin
   would offset every lifted row by 8px against the slot the host reserved. */
html, body { margin: 0; padding: 0; }

.laps-root {
  font-family: Inter, -apple-system, BlinkMacSystemFont, Roboto, Helvetica, sans-serif;
  font-size: 14px;
  line-height: 20px;
  box-sizing: border-box;
}
.laps-root *, .laps-root *::before, .laps-root *::after { box-sizing: inherit; }

/* ---------------------------------------------------------------- stopwatch */

.laps-watch { display: block; overflow: visible; }
.laps-watch__case { fill: none; stroke: currentColor; stroke-width: 5; opacity: 0.55; }
.laps-watch__tick { stroke: currentColor; stroke-width: 3; opacity: 0.35; }
.laps-watch__tick--major { stroke-width: 5; opacity: 0.6; }
.laps-watch__crown { fill: currentColor; opacity: 0.55; }
.laps-watch__pin { fill: currentColor; }
.laps-watch__hand { stroke: currentColor; stroke-linecap: round; }
.laps-watch__subdial { fill: none; stroke: currentColor; stroke-width: 2.5; opacity: 0.3; }

/* The hands are driven by two CSS animations rather than by React state.
   A 60fps re-render to move a line is wasteful, and the browser keeps a CSS
   animation running smoothly while the widget is doing something else. */
.laps-watch__second, .laps-watch__minute {
  transform-box: view-box;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  animation-name: laps-sweep;
}
/* Origins must match the pivots the SVG actually draws: the case centre at
   (50, 54) and the subdial centre at (50, 34). A hand rotating about a point it
   is not attached to orbits instead of sweeping, which looks like a broken
   animation rather than a wrong number. */
.laps-watch__second { transform-origin: 50px 54px; animation-duration: 60s; }
.laps-watch__minute { transform-origin: 50px 34px; animation-duration: 3600s; }

@keyframes laps-sweep {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Someone who has asked not to see motion should not be handed a spinning
   second hand. The readout still counts, so no information is lost. */
@media (prefers-reduced-motion: reduce) {
  .laps-watch__second, .laps-watch__minute { animation: none; }
}

.laps-watch--running { color: var(--laps-accent); }

/* --------------------------------------------------------------------- pill */

/* Deliberately shaped to match RemNote's own "Add Template" pill: same radius,
   same 14px/20px label, same 18px icon box, same 4px/12px padding. It sits
   directly beside that control, and a near-match reads worse than either a
   copy or something obviously different. */
.laps-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid;
  cursor: pointer;
  user-select: none;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  white-space: nowrap;
  transition: background-color 200ms cubic-bezier(0.2, 0.8, 0.4, 1), color 200ms cubic-bezier(0.2, 0.8, 0.4, 1);
}
.laps-pill:hover { background-color: var(--laps-accent-soft); }
.laps-pill--running { border-color: var(--laps-accent); color: var(--laps-accent); }
/* Icon only, for the running state where the label would be dead weight in a
   control that has to share the title row with the document name. */
.laps-pill--icon { padding: 4px 7px; gap: 0; }
/* The run belongs to a different document. Dimmed rather than labelled: naming
   it inline costs more width than every other control put together. */
.laps-pill--elsewhere { opacity: 0.72; }
/* The running watch is a status indicator, not a control: no pointer cursor and
   no hover response, so it does not invite a click that does nothing. */
.laps-pill--static { cursor: default; }
.laps-pill--static:hover { background-color: transparent; }

/* The three squares are the same shape, so colour is what tells them apart at a
   glance. Go on the one that starts, stop on the one that ends it, neutral on
   the one in between. Tinted on hover rather than always, so a resting row stays
   quiet. */
.laps-btn--go:hover { background-color: var(--laps-best-soft); color: var(--laps-best); border-color: var(--laps-best); }
.laps-btn--stop:hover { background-color: var(--laps-worst-soft); color: var(--laps-worst); border-color: var(--laps-worst); }
.laps-btn--chart:hover { background-color: var(--laps-accent-soft); color: var(--laps-accent); border-color: var(--laps-accent); }
.laps-pill__time {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  min-width: 62px;
  text-align: right;
}

/* --------------------------------------------------------------- lap chip */

/* The two tone box that appears beside the stopwatch once it is running: lap
   number on the left in the accent, elapsed time on the right on the plain
   surface. Split with a border rather than a gap so the two halves read as one
   object, the way a lap timer's display does.

   It is a readout, not a control. Nothing happens when you click it, so it
   carries no pointer cursor and no hover state to suggest otherwise; the lap
   history lives in the right click menu. */
.laps-chip {
  display: inline-flex;
  align-items: stretch;
  border-radius: 999px;
  border: 1px solid var(--laps-accent);
  overflow: hidden;
  user-select: none;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  line-height: 20px;
}
.laps-chip__lap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  padding: 3px 7px;
  background-color: var(--laps-accent);
  color: var(--laps-accent-on);
  font-weight: 700;
  font-size: 13px;
}
.laps-chip__time {
  display: flex;
  align-items: center;
  padding: 3px 9px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
/* Reserve the widest readout each mode can produce, so the digits changing
   never resizes the box and nudges everything beside it. */
.laps-chip__time--hms { min-width: 68px; }
.laps-chip__time--ms { min-width: 98px; }
.laps-chip--paused { opacity: 0.65; }

/* Full width so justify-content has room to push the row to one end, with a
   min-width floor so it can never squeeze its own contents. Nothing inside may
   shrink either: a squeezed control row is the failure that made the clipping
   so hard to pin down. */
.laps-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  width: 100%;
  min-width: max-content;
}
.laps-bar > * { flex-shrink: 0; }
.laps-bar--center { justify-content: center; }
.laps-bar--left { justify-content: flex-start; }
.laps-bar--right { justify-content: flex-end; }

.laps-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid;
  cursor: pointer;
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  white-space: nowrap;
  background: transparent;
  transition: background-color 150ms ease, opacity 150ms ease;
}
.laps-btn:hover { background-color: var(--laps-accent-soft); }
.laps-btn--primary { background-color: var(--laps-accent); color: var(--laps-accent-on); border-color: var(--laps-accent); }
.laps-btn--primary:hover { background-color: var(--laps-accent); opacity: 0.86; }
/* Compact, but still padded: the popup uses this for text buttons like Save
   and Cancel, so it must not drop horizontal padding. */
.laps-btn--icon { padding: 4px 6px; line-height: 1; }

/* A fixed square, for a button whose whole content is one glyph. Play and pause
   come out exactly the same size as each other AND the same height as the Lap
   button beside them. 28px is what .laps-btn works out to under border-box:
   18px line-height, 4px padding each side, 1px border each side. */
.laps-btn--square {
  padding: 0;
  min-width: 34px;
  height: 28px;
  justify-content: center;
  line-height: 1;
}
/* Same fixed height on the labelled buttons, so a row of them lines up exactly
   rather than nearly. */
.laps-bar .laps-btn { height: 28px; }
.laps-btn[disabled] { opacity: 0.45; cursor: default; }

/* -------------------------------------------------------------------- popup */

/* 100vh, not 100%. The widget is registered with height:'auto', so a height:100%
   here resolves against nothing and collapses the flex column, which takes the
   scrolling body with it. Inside an iframe vh is the iframe's own height, which
   is exactly the box this needs to fill. */
.laps-popup {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-height: 100vh;
  padding: 14px 16px 12px;
}
.laps-popup__head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.laps-popup__title { font-size: 17px; line-height: 22px; font-weight: 600; }
.laps-popup__sub { font-size: 12px; line-height: 16px; opacity: 0.7; }
.laps-popup__spacer { flex: 1; }
.laps-popup__body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }

.laps-tabs { display: flex; gap: 4px; border-bottom: 1px solid; border-color: inherit; margin-bottom: 10px; }
.laps-tab {
  padding: 6px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  opacity: 0.65;
}
.laps-tab:hover { opacity: 0.9; }
.laps-tab--active { opacity: 1; border-bottom-color: var(--laps-accent); color: var(--laps-accent); }

/* ----------------------------------------------------------------- lap rows */

.laps-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.laps-table th {
  text-align: left;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.55;
  font-weight: 600;
  padding: 4px 8px;
  position: sticky;
  top: 0;
}
.laps-table td { padding: 5px 8px; font-size: 14px; border-top: 1px solid; border-color: rgba(128, 128, 128, 0.18); }
.laps-table tr:hover td { background-color: rgba(128, 128, 128, 0.07); }
.laps-row--best td { background-color: var(--laps-best-soft); }
.laps-row--best .laps-cell-time { color: var(--laps-best); font-weight: 600; }
.laps-row--worst td { background-color: var(--laps-worst-soft); }
.laps-row--worst .laps-cell-time { color: var(--laps-worst); font-weight: 600; }
.laps-cell-num { width: 42px; opacity: 0.6; }
.laps-cell-actions { width: 74px; text-align: right; white-space: nowrap; }
.laps-cell-note { opacity: 0.75; font-size: 13px; }

.laps-input {
  width: 100%;
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid var(--laps-accent);
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
}
.laps-input--bad { border-color: var(--laps-worst); }
.laps-hint { font-size: 11px; opacity: 0.6; margin-top: 2px; }

.laps-session { margin-bottom: 18px; }
.laps-session__head { display: flex; align-items: baseline; gap: 8px; padding: 4px 8px; }
.laps-session__name { font-weight: 600; font-size: 14px; }
.laps-session__meta { font-size: 12px; opacity: 0.6; }

/* ----------------------------------------------------------------- controls */

.laps-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.laps-field { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
.laps-field label { opacity: 0.7; }
.laps-date, .laps-select {
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid rgba(128, 128, 128, 0.35);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
}

/* -------------------------------------------------------------------- chart */

.laps-chart { width: 100%; display: block; overflow: visible; touch-action: none; }
.laps-chart__grid { stroke: currentColor; opacity: 0.14; stroke-width: 1; }
.laps-chart__axis { stroke: currentColor; opacity: 0.35; stroke-width: 1; }
.laps-chart__label { fill: currentColor; opacity: 0.6; font-size: 10px; }
.laps-chart__area { fill: var(--laps-accent-soft); }
.laps-chart__line { fill: none; stroke: var(--laps-accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.laps-chart__bar { fill: var(--laps-accent); opacity: 0.8; }
.laps-chart__bar:hover { opacity: 1; }
.laps-chart__dot { fill: var(--laps-accent); stroke: none; }
.laps-chart__dot--best { fill: var(--laps-best); }
.laps-chart__dot--worst { fill: var(--laps-worst); }
.laps-chart__hit { fill: transparent; cursor: crosshair; }
.laps-chart__cursor { stroke: var(--laps-accent); stroke-width: 1; stroke-dasharray: 3 3; opacity: 0.7; }

.laps-tooltip {
  position: absolute;
  pointer-events: none;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(128, 128, 128, 0.35);
  font-size: 12px;
  line-height: 16px;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  z-index: 10;
}
.laps-chart-wrap { position: relative; }

.laps-legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; margin-top: 6px; opacity: 0.75; }
.laps-legend__swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: baseline; }

/* --------------------------------------------------------------------- tree */

/* Capped and scrollable. A knowledge base with a deep tree would otherwise push
   the date filters and the tab strip off the bottom of the sidebar, and those
   are the controls the tree exists to drive. */
.laps-tree {
  font-size: 13px;
  max-height: 240px;
  overflow-y: auto;
  overflow-x: hidden;
}
.laps-tree__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
}
.laps-tree__row:hover { background-color: rgba(128, 128, 128, 0.09); }
.laps-tree__row--scoped { background-color: var(--laps-accent-soft); }
.laps-tree__twisty { width: 14px; text-align: center; opacity: 0.55; font-size: 10px; }
.laps-tree__name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.laps-tree__hidden { opacity: 0.5; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.laps-tree__total { font-variant-numeric: tabular-nums; opacity: 0.85; }
.laps-tree__count { font-variant-numeric: tabular-nums; opacity: 0.5; width: 62px; text-align: right; }
.laps-tree__bar { width: 70px; height: 5px; border-radius: 3px; background-color: rgba(128, 128, 128, 0.18); overflow: hidden; }
.laps-tree__bar span { display: block; height: 100%; background-color: var(--laps-accent); }

.laps-empty { padding: 26px 10px; text-align: center; opacity: 0.6; font-size: 13px; }

/* Explains a stopwatch that is running but has banked nothing yet. Accent
   coloured because it is describing something live, not a warning. */
.laps-running-note {
  border-left: 3px solid var(--laps-accent);
  background-color: var(--laps-accent-soft);
  border-radius: 0 6px 6px 0;
  padding: 7px 10px;
  margin-bottom: 10px;
  font-size: 12px;
  line-height: 17px;
}
.laps-running-note__head { opacity: 0.85; }
.laps-running-note__list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.laps-running-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px 2px 8px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 999px;
  max-width: 100%;
}
.laps-running-chip__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
.laps-running-chip__time { font-variant-numeric: tabular-nums; opacity: 0.75; }

/* --------------------------------------------------------------------- goal */

.laps-goal {
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.laps-goal--met { border-color: var(--laps-best); background-color: var(--laps-best-soft); }
/* Present but not actionable: still visible so the feature does not look
   missing, dimmed so it does not look clickable. */
.laps-goal--inert { opacity: 0.6; }
.laps-goal--editing { border-color: var(--laps-accent); }
.laps-goal__head { display: flex; align-items: center; gap: 8px; }
/* Truncated rather than wrapped: a long document title would otherwise push the
   Edit button off the row. The full name is in the title attribute. */
.laps-goal__title {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.laps-goal__meta {
  font-size: 12px;
  opacity: 0.75;
  margin-top: 5px;
  font-variant-numeric: tabular-nums;
}
/* The countdown reads as the answer, so it carries a touch more weight than the
   X of Y line above it. */
.laps-goal__meta--remaining { margin-top: 2px; opacity: 0.95; font-weight: 500; }
.laps-goal--met .laps-goal__meta--remaining { color: var(--laps-best); }
.laps-goal__bar {
  height: 7px;
  border-radius: 4px;
  background-color: rgba(128, 128, 128, 0.2);
  overflow: hidden;
  margin-top: 8px;
}
.laps-goal__bar span {
  display: block;
  height: 100%;
  background-color: var(--laps-accent);
  transition: width 300ms cubic-bezier(0.2, 0.8, 0.4, 1);
}
/* Met: the whole track goes green and the (now zero width) fill is irrelevant.
   An empty bar alone would read as "nothing done" rather than "nothing left". */
.laps-goal__bar--met { background-color: var(--laps-best); }
.laps-goal__bar--met span { background-color: transparent; }

/* Dimmed while the goal is outstanding, coloured once met, so the change of
   state is itself the reward. */
.laps-flag { color: currentColor; opacity: 0.4; flex-shrink: 0; }
.laps-flag--met { color: var(--laps-best); opacity: 1; }

.laps-input--inline { width: 110px; }
`;
