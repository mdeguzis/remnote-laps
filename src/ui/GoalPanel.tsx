import * as React from 'react';

import { formatHMS, parseDuration } from '../lib/format.ts';
import { measureGoal } from '../lib/goals.ts';
import type { Goal } from '../lib/types.ts';
import type { RollupNode } from '../lib/rollup.ts';

export interface GoalPanelProps {
  scopeKey: string;
  scopeName: string;
  goal: Goal | undefined;
  node: RollupNode | undefined;
  startOpen?: boolean;
  onSave: (goal: { targetMs?: number; targetLaps?: number }) => void;
  onClear: () => void;
}

/**
 * A target for this document or folder, and how far along it is.
 *
 * Progress runs against the ROLLED UP total, so a goal on a folder is met by
 * work anywhere beneath it. The checkered flag is the reward, and it is the
 * only place in the plugin that uses one.
 */
export function GoalPanel({
  scopeKey,
  scopeName,
  goal,
  node,
  startOpen,
  onSave,
  onClear,
}: GoalPanelProps): JSX.Element | null {
  const [editing, setEditing] = React.useState(!!startOpen);
  const [timeText, setTimeText] = React.useState('');
  const [lapsText, setLapsText] = React.useState('');

  // Re-seed the draft whenever the goal or the scope changes, or editing a
  // second document shows the first one's numbers.
  React.useEffect(() => {
    setTimeText(goal?.targetMs ? formatHMS(goal.targetMs, false) : '');
    setLapsText(goal?.targetLaps ? String(goal.targetLaps) : '');
  }, [goal?.targetMs, goal?.targetLaps, scopeKey]);

  React.useEffect(() => {
    if (startOpen) setEditing(true);
  }, [startOpen, scopeKey]);

  // "Everything" has nothing to hang a goal on, but the panel still shows,
  // saying so. Disappearing entirely reads as the feature being missing rather
  // than being out of scope, and the row is where the eye already goes.
  if (!scopeKey) {
    return (
      <div className="laps-goal laps-goal--inert">
        <div className="laps-goal__head">
          <CheckeredFlag met={false} />
          <span className="laps-goal__title">Goals belong to a document or folder</span>
        </div>
        <div className="laps-goal__meta">Pick one with Change scope to set a target for it.</div>
      </div>
    );
  }

  const progress = measureGoal(goal, node);

  const trimmedTime = timeText.trim();
  const trimmedLaps = lapsText.trim();
  const parsedTime = trimmedTime ? parseDuration(trimmedTime) : undefined;
  const parsedLaps = trimmedLaps ? Number(trimmedLaps) : undefined;

  const timeBad = trimmedTime !== '' && parsedTime === undefined;
  const lapsBad = trimmedLaps !== '' && (!Number.isFinite(parsedLaps) || (parsedLaps as number) <= 0);
  const nothingSet = !trimmedTime && !trimmedLaps;

  if (editing) {
    return (
      <div className="laps-goal laps-goal--editing">
        <div className="laps-goal__head">
          <CheckeredFlag met={false} />
          <span className="laps-goal__title">Goal for "{scopeName}"</span>
        </div>

        <div className="laps-controls" style={{ marginBottom: 6 }}>
          <span className="laps-field">
            <label htmlFor="laps-goal-time">Target time</label>
            <input
              id="laps-goal-time"
              className={`laps-input laps-input--inline${timeBad ? ' laps-input--bad' : ''}`}
              value={timeText}
              placeholder="01:30:00"
              onChange={(event) => setTimeText(event.target.value)}
            />
            {/* Echo the interpretation. A bare "60" is read as sixty seconds,
                which is worth confirming rather than leaving the user to guess
                whether it meant minutes. */}
            {trimmedTime ? (
              <span className="laps-hint">{timeBad ? 'Not a time' : formatHMS(parsedTime as number, false)}</span>
            ) : null}
          </span>
          <span className="laps-field">
            <label htmlFor="laps-goal-laps">Target laps</label>
            <input
              id="laps-goal-laps"
              className={`laps-input laps-input--inline${lapsBad ? ' laps-input--bad' : ''}`}
              value={lapsText}
              placeholder="10"
              inputMode="numeric"
              onChange={(event) => setLapsText(event.target.value)}
            />
          </span>
        </div>

        <div className="laps-controls">
          <button
            className="laps-btn laps-btn--primary"
            disabled={timeBad || lapsBad || nothingSet}
            onClick={() => {
              onSave({ targetMs: parsedTime, targetLaps: lapsBad ? undefined : parsedLaps });
              setEditing(false);
            }}
          >
            Save goal
          </button>
          <button className="laps-btn" onClick={() => setEditing(false)}>
            Cancel
          </button>
          {goal ? (
            <button
              className="laps-btn"
              onClick={() => {
                onClear();
                setEditing(false);
              }}
            >
              Remove goal
            </button>
          ) : null}
          <span className="laps-hint">
            {nothingSet
              ? 'Set a time, a number of laps, or both.'
              : 'Both set means the goal is met only when both are.'}
          </span>
        </div>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="laps-goal">
        <button className="laps-btn" onClick={() => setEditing(true)}>
          Set a goal for "{scopeName}"
        </button>
      </div>
    );
  }

  return (
    <div className={`laps-goal${progress.met ? ' laps-goal--met' : ''}`}>
      <div className="laps-goal__head">
        <CheckeredFlag met={progress.met} />
        {/* The document is named on the goal itself. The panel sits above a
            page whose scope can be changed from the tree, so "Goal" on its own
            leaves you guessing which item the target belongs to. */}
        <span className="laps-goal__title" title={scopeName}>
          {progress.met ? 'Goal met' : 'Goal'} for "{scopeName}"
        </span>
        <span className="laps-popup__spacer" />
        <button className="laps-btn laps-btn--icon" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>

      {/* The bar DEPLETES. A goal is an amount of time left to put in, so it
          starts full and empties as the work is done; a bar that fills up is
          measuring the opposite thing. Empty therefore means finished, which is
          why the met state paints the whole track rather than the fill. */}
      <div className={`laps-goal__bar${progress.met ? ' laps-goal__bar--met' : ''}`}>
        <span style={{ width: `${((1 - progress.overall) * 100).toFixed(1)}%` }} />
      </div>

      {/* Progress as X of Y, and the target as a countdown. A goal is a target
          to reach, so "47m remaining" answers the question being asked far more
          directly than "47m to go" tacked onto a total. */}
      <div className="laps-goal__meta">
        {[
          progress.goal.targetMs
            ? `${formatHMS(progress.currentMs, false)} / ${formatHMS(progress.goal.targetMs, false)}`
            : undefined,
          progress.goal.targetLaps ? `${progress.currentLaps} / ${progress.goal.targetLaps} laps` : undefined,
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>

      <div className="laps-goal__meta laps-goal__meta--remaining">
        {progress.met
          ? 'Target reached, including everything below this item.'
          : [
              progress.msRemaining !== undefined
                ? `Time remaining ${formatHMS(progress.msRemaining, false)}`
                : undefined,
              progress.lapsRemaining !== undefined
                ? `${progress.lapsRemaining} lap${progress.lapsRemaining === 1 ? '' : 's'} remaining`
                : undefined,
            ]
              .filter(Boolean)
              .join(' · ')}
      </div>
    </div>
  );
}

/**
 * The checkered flag.
 *
 * Greyed while the goal is outstanding and coloured once it is met, so the
 * change is the reward. Drawn rather than an emoji: emoji render differently on
 * every platform and cannot be dimmed.
 */
function CheckeredFlag({ met }: { met: boolean }): JSX.Element {
  const squares: JSX.Element[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      if ((row + col) % 2 === 0) continue;
      squares.push(<rect key={`${row}-${col}`} x={6 + col * 5} y={2 + row * 4} width="5" height="4" />);
    }
  }

  return (
    <svg
      className={`laps-flag${met ? ' laps-flag--met' : ''}`}
      width="22"
      height="22"
      viewBox="0 0 28 28"
      aria-hidden="true"
    >
      {/* Pole */}
      <rect x="2" y="1" width="2.6" height="26" rx="1.2" fill="currentColor" />
      {/* Flag field, then the dark squares over it */}
      <rect x="6" y="2" width="20" height="12" fill="currentColor" opacity="0.22" />
      <g fill="currentColor">{squares}</g>
    </svg>
  );
}
