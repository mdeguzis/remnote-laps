import * as React from 'react';
import { usePlugin } from '@remnote/plugin-sdk';

import { formatHMS } from '../lib/format.ts';
import { STORAGE_KEYS } from '../lib/types.ts';
import type { Options } from '../lib/settings.ts';
import { currentLapElapsed, elapsedOf } from '../lib/store.ts';
import { Stopwatch } from './Stopwatch.tsx';
import { useNow } from './hooks.tsx';
import type { DragApi } from './useDragPosition.ts';
import type { TimerApi } from './useTimer.ts';

export interface TimerBarProps {
  timer: TimerApi;
  options: Options;
  /** The document this bar belongs to. Undefined in the top bar. */
  documentId?: string;
  /** How to justify the row. The document copy lines up with Add Template. */
  align?: string;
  watchSize?: number;
  /**
   * Drag-to-reposition, when the surface supports it.
   *
   * The stopwatch doubles as the grab handle: it is the one control that is
   * always present, and adding a separate grip would cost width in a row that
   * has none to spare.
   */
  drag?: DragApi;
}

/**
 * The stopwatch and its controls.
 *
 * Built to be as narrow as it can be while still being usable, because it sits
 * in the document title row beside Add Template and every pixel it takes is one
 * the title loses. Nothing here spells out which document the run belongs to:
 * a document name is unbounded in length, and "August 17th, 2026" alone was
 * wider than the entire rest of the control. That belongs in a tooltip.
 *
 * Shared by the in-document pill and the top bar so the two cannot drift apart
 * in behaviour.
 */
export function TimerBar({ timer, options, documentId, align = 'center', watchSize = 18, drag }: TimerBarProps): JSX.Element {
  // `timer.running` is already scoped to this document, so a document that has
  // never been started shows a fresh stopwatch even while another one counts.
  const { running, others } = timer;
  const active = !!running && running.pausedAt === undefined;

  const now = useNow(active);

  // Re-anchored only when the run's timing actually changes, never on a tick.
  // See the note on `Stopwatch.anchorElapsedMs`.
  const anchor = React.useMemo(
    () => (running ? elapsedOf(running, Date.now()) : 0),
    [running?.startedAt, running?.pausedAt, running?.sessionId],
  );

  const chipMs = !running
    ? 0
    : options.chipShows === 'total'
      ? elapsedOf(running, now)
      : currentLapElapsed(running, now);

  const lapNumber = running ? running.laps.length + 1 : 1;
  const rowClass = `laps-bar laps-bar--${align === 'left' || align === 'right' ? align : 'center'}`;

  // "Laps" opens the controls; it does NOT start the clock. Starting on the
  // same click that reveals the controls means every accidental click banks a
  // run, and there is no undo for a stopwatch you did not mean to start.
  const [armed, setArmed] = React.useState(false);

  if (!running) {
    if (!armed) {
      return (
        <div className={`laps-root ${rowClass}`}>
          <button
            className="laps-pill rn-clr-border-opaque rn-clr-background-primary rn-clr-content-tertiary"
            {...(drag?.handleProps ?? {})}
            onClick={() => {
              // A press that turned into a drag must not also open the controls.
              if (drag?.consumedClick()) return;
              setArmed(true);
            }}
            disabled={!documentId}
            title="Show the stopwatch controls for this document"
            data-test="laps-stopwatch-trigger"
          >
            <Stopwatch size={watchSize} running={false} anchorElapsedMs={0} />
            <span>Laps</span>
          </button>
        </div>
      );
    }

    // Armed: the full row, at zero, waiting for play.
    return (
      <div className={`laps-root ${rowClass}`}>
        <span
          className="laps-pill laps-pill--icon laps-pill--static rn-clr-border-opaque rn-clr-background-primary rn-clr-content-tertiary"
          {...(drag?.handleProps ?? {})}
          title="Ready to start"
        >
          <Stopwatch size={watchSize} running={false} anchorElapsedMs={0} />
        </span>

        <Chip lapNumber={1} ms={0} options={options} paused={false} where="" />

        <button className="laps-btn laps-btn--primary" disabled title="Start the stopwatch first">
          Lap
        </button>

        <button
          className="laps-btn laps-btn--square laps-btn--go"
          onClick={() => (documentId ? void timer.start(documentId) : undefined)}
          disabled={timer.busy || !documentId}
          title="Start the stopwatch"
          aria-label="Start the stopwatch"
          data-test="laps-start"
        >
          <PlayIcon />
        </button>

        {/* Stop on an unstarted timer just puts the controls away. Nothing has
            been recorded, so there is nothing to bank. */}
        <button
          className="laps-btn laps-btn--square laps-btn--stop"
          onClick={() => setArmed(false)}
          title="Close the stopwatch controls"
          aria-label="Close the stopwatch controls"
        >
          <StopIcon />
        </button>

        <StatsButton documentId={documentId} />
      </div>
    );
  }

  // Runs on other documents are mentioned in the tooltips only. Naming them
  // inline costs more width than every other control put together, and a
  // document name has no upper bound on length.
  const where = others.length > 0 ? ` (${others.length} other run${others.length === 1 ? '' : 's'} going)` : '';

  return (
    <div className={`laps-root ${rowClass}`}>
      {/* While running the stopwatch is a STATUS INDICATOR, not a control.
          Stop used to be hidden behind clicking it, which is not discoverable
          and is easy to hit by accident; there is an explicit Stop button now,
          so the watch does not need to double as one. */}
      <span
        className="laps-pill laps-pill--icon laps-pill--running laps-pill--static rn-clr-background-primary"
        title={`Running${where}`}
        {...(drag?.handleProps ?? {})}
        data-test="laps-stopwatch-indicator"
      >
        <Stopwatch size={watchSize} running={active} anchorElapsedMs={anchor} />
      </span>

      <Chip lapNumber={lapNumber} ms={chipMs} options={options} paused={!active} where={where} />

      <button
        className="laps-btn laps-btn--primary"
        onClick={() => void timer.lap(running.key)}
        disabled={timer.busy || !active}
        title={`Record this lap and start the next${where}`}
      >
        Lap
      </button>

      <button
        className={`laps-btn laps-btn--square${active ? '' : ' laps-btn--go'}`}
        onClick={() => (active ? void timer.pause(running.key) : void timer.resume(running.key))}
        disabled={timer.busy}
        title={active ? `Pause${where}` : `Resume${where}`}
        aria-label={active ? 'Pause the stopwatch' : 'Resume the stopwatch'}
      >
        {active ? <PauseIcon /> : <PlayIcon />}
      </button>

      {/* Stop, as its own square. Finishing for the day is a distinct action
          from pausing, and it is the one that actually banks the time. */}
      <button
        className="laps-btn laps-btn--square laps-btn--stop"
        onClick={() => void timer.stop(running.key)}
        disabled={timer.busy}
        title={`Stop and record this run${where}`}
        aria-label="Stop the stopwatch and record the run"
        data-test="laps-stop"
      >
        <StopIcon />
      </button>

      <StatsButton documentId={running.key} />
    </div>
  );
}

/**
 * Opens the stats sidebar for this document.
 *
 * Publishes the scope the same way the menu items do, so the sidebar shows this
 * document rather than whatever it was last pointed at.
 */
function StatsButton({ documentId }: { documentId?: string }): JSX.Element {
  const plugin = usePlugin();

  return (
    <button
      className="laps-btn laps-btn--square laps-btn--chart"
      title="Show lap times and charts for this document"
      aria-label="Show lap times and charts"
      data-test="laps-open-stats"
      onClick={async () => {
        if (documentId) {
          await plugin.storage.setSession(STORAGE_KEYS.scope, {
            scopeKey: documentId,
            scopeName: '',
            at: Date.now(),
          });
        }
        await plugin.window.openWidgetInRightSidebar('laps_stats');
      }}
    >
      <ChartIcon />
    </button>
  );
}

/**
 * Three bars at uneven heights.
 *
 * Deliberately NOT ascending: a staircase reads as a growth arrow or a signal
 * strength meter. Staggering them, with the tallest in the middle, is what makes
 * it read as data rather than as progress.
 */
function ChartIcon(): JSX.Element {
  return (
    <svg width="11" height="10" viewBox="0 0 11 10" fill="currentColor" aria-hidden="true">
      <rect x="0.3" y="4.2" width="2.6" height="5.8" rx="0.6" />
      <rect x="4.2" y="0.6" width="2.6" height="9.4" rx="0.6" />
      <rect x="8.1" y="6.4" width="2.6" height="3.6" rx="0.6" />
    </svg>
  );
}

/** Play: one triangle in a fixed viewBox, so it cannot resize between states. */
function PlayIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <path d="M1.6 0.7 L9 5 L1.6 9.3 Z" />
    </svg>
  );
}

function PauseIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <rect x="1" y="0.5" width="3" height="9" rx="0.6" />
      <rect x="6" y="0.5" width="3" height="9" rx="0.6" />
    </svg>
  );
}

function StopIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <rect x="0.8" y="0.8" width="8.4" height="8.4" rx="1.4" />
    </svg>
  );
}

/**
 * The two tone readout.
 *
 * Lap number on the accent, time on the plain surface, one rounded box. It is
 * not a control: the lap history and the stats live in the right click menu,
 * so giving this a click target would only teach a gesture that does nothing.
 */
function Chip({
  lapNumber,
  ms,
  options,
  paused,
  where,
}: {
  lapNumber: number;
  ms: number;
  options: Options;
  paused: boolean;
  where: string;
}): JSX.Element {
  return (
    <span
      className={`laps-chip rn-clr-background-primary rn-clr-content-primary${paused ? ' laps-chip--paused' : ''}`}
      title={`${options.chipShows === 'total' ? 'Total elapsed' : `Time on lap ${lapNumber}`}${where}`}
      aria-label={`Lap ${lapNumber}, ${formatHMS(ms, options.showMs)}`}
      data-test="laps-chip"
    >
      <span className="laps-chip__lap">{lapNumber}</span>
      <span className={`laps-chip__time laps-chip__time--${options.showMs ? 'ms' : 'hms'}`}>
        {formatHMS(ms, options.showMs)}
      </span>
    </span>
  );
}
