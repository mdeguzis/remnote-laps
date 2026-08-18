import * as React from 'react';

import { formatCoarse, formatDate, formatHMS, formatTimeOfDay, parseDuration } from '../lib/format.ts';
import type { FilteredSession } from '../lib/rollup.ts';
import type { Lap } from '../lib/types.ts';

export interface LapTableProps {
  sessions: FilteredSession[];
  /** Thousandths on the recorded times. Off by default: this is study time. */
  showMs: boolean;
  highlightExtremes: boolean;
  onEdit: (sessionId: string, lapId: string, patch: { ms?: number; note?: string }) => void;
  onDelete: (sessionId: string, lapId: string) => void;
}

/**
 * The lap list, grouped by session.
 *
 * Everything that describes the RUN is computed from the unfiltered session:
 * lap numbers, split times, which lap was fastest, the session total. Only the
 * set of ROWS comes from the filter. Narrowing the date range therefore hides
 * rows without renumbering the ones that remain or moving the fastest lap badge
 * onto a different row.
 */
export function LapTable({ sessions, highlightExtremes, showMs, onEdit, onDelete }: LapTableProps): JSX.Element {
  if (sessions.length === 0) {
    return <div className="laps-empty">No laps recorded in this range.</div>;
  }

  return (
    <>
      {sessions.map((session) => (
        <SessionBlock
          key={session.id}
          session={session}
          highlightExtremes={highlightExtremes}
          showMs={showMs}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

function SessionBlock({
  session,
  highlightExtremes,
  showMs,
  onEdit,
  onDelete,
}: {
  session: FilteredSession;
  highlightExtremes: boolean;
  showMs: boolean;
  onEdit: LapTableProps['onEdit'];
  onDelete: LapTableProps['onDelete'];
}): JSX.Element {
  const full = session.original.laps;
  const durations = full.map((lap) => lap.ms);

  // A single lap has no fastest and no slowest, and neither does a run where
  // every lap came out the same. Marking one anyway is noise.
  const best = durations.length > 1 ? Math.min(...durations) : undefined;
  const worst = durations.length > 1 ? Math.max(...durations) : undefined;
  const total = durations.reduce((sum, ms) => sum + ms, 0);

  const splits = React.useMemo(() => {
    const out: Record<string, number> = {};
    let running = 0;
    for (const lap of full) {
      running += lap.ms;
      out[lap.id] = running;
    }
    return out;
  }, [full]);

  const hidden = full.length - session.laps.length;

  return (
    <div className="laps-session">
      <div className="laps-session__head">
        <span className="laps-session__name">{session.name}</span>
        <span className="laps-session__meta">
          {formatDate(session.startedAt)} {formatTimeOfDay(session.startedAt)} · {full.length} lap
          {full.length === 1 ? '' : 's'} · {formatCoarse(total)}
          {session.endedAt === undefined ? ' · running' : ''}
          {hidden > 0 ? ` · ${hidden} outside the date range` : ''}
        </span>
      </div>

      <table className="laps-table">
        <thead>
          <tr>
            <th className="laps-cell-num">Lap</th>
            <th>Time</th>
            <th>Split</th>
            <th>Recorded</th>
            <th>Note</th>
            <th className="laps-cell-actions" />
          </tr>
        </thead>
        <tbody>
          {session.laps.map((lap) => {
            const flag =
              !highlightExtremes || best === undefined || best === worst
                ? ''
                : lap.ms === best
                  ? ' laps-row--best'
                  : lap.ms === worst
                    ? ' laps-row--worst'
                    : '';
            return (
              <LapRow
                key={lap.id}
                lap={lap}
                index={session.lapNumbers[lap.id] ?? 0}
                split={splits[lap.id] ?? lap.ms}
                rowClass={flag}
                showMs={showMs}
                onEdit={(patch) => onEdit(session.id, lap.id, patch)}
                onDelete={() => onDelete(session.id, lap.id)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LapRow({
  lap,
  index,
  split,
  rowClass,
  showMs,
  onEdit,
  onDelete,
}: {
  lap: Lap;
  index: number;
  split: number;
  rowClass: string;
  showMs: boolean;
  onEdit: (patch: { ms?: number; note?: string }) => void;
  onDelete: () => void;
}): JSX.Element {
  const [editing, setEditing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [draftTime, setDraftTime] = React.useState(() => formatHMS(lap.ms, showMs));
  const [draftNote, setDraftNote] = React.useState(lap.note ?? '');

  // Whatever `formatHMS` prints, `parseDuration` must read back. The field is
  // seeded from the former and validated by the latter, so a mismatch shows up
  // immediately as a row that refuses its own value.
  const parsed = parseDuration(draftTime);
  const valid = parsed !== undefined;

  const begin = () => {
    setDraftTime(formatHMS(lap.ms, showMs));
    setDraftNote(lap.note ?? '');
    setEditing(true);
  };

  const commit = () => {
    if (!valid) return;
    onEdit({ ms: parsed, note: draftNote });
    setEditing(false);
  };

  if (editing) {
    return (
      <tr className={`laps-row${rowClass}`}>
        <td className="laps-cell-num">{index}</td>
        {/* One cell per column, so the inputs sit under the headings they
            belong to. A colSpan on the time cell pushed the note input into the
            RECORDED column and nothing lined up. */}
        <td>
          <input
            className={`laps-input${valid ? '' : ' laps-input--bad'}`}
            value={draftTime}
            autoFocus
            onChange={(event) => setDraftTime(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') setEditing(false);
            }}
            aria-label="Lap time"
          />
          {/* Echo back what the input was understood as. "60" meaning a minute
              is convenient but not obvious, and the echo removes the doubt
              without a second field. */}
          <div className="laps-hint">
            {valid ? formatHMS(parsed as number, showMs) : 'Cannot read that as a time'}
          </div>
        </td>
        <td colSpan={2} />
        <td>
          <input
            className="laps-input"
            value={draftNote}
            placeholder="Note"
            onChange={(event) => setDraftNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') setEditing(false);
            }}
            aria-label="Lap note"
          />
        </td>
        <td className="laps-cell-actions">
          <button className="laps-btn laps-btn--primary laps-btn--icon" onClick={commit} disabled={!valid}>
            Save
          </button>{' '}
          <button className="laps-btn laps-btn--icon" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`laps-row${rowClass}`}>
      <td className="laps-cell-num">{index}</td>
      <td className="laps-cell-time">{formatHMS(lap.ms, showMs)}</td>
      <td style={{ opacity: 0.65 }}>{formatHMS(split, showMs)}</td>
      <td style={{ opacity: 0.65 }}>
        {formatDate(lap.at)} {formatTimeOfDay(lap.at)}
      </td>
      <td className="laps-cell-note">{lap.note ?? ''}</td>
      <td className="laps-cell-actions">
        {confirming ? (
          <>
            {/* Two steps rather than a modal. A lap is cheap to lose and
                expensive to reconstruct, but not worth stealing focus for. */}
            <button className="laps-btn laps-btn--icon" onClick={onDelete} title="Confirm delete">
              Delete
            </button>{' '}
            <button className="laps-btn laps-btn--icon" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </>
        ) : (
          <>
            <button className="laps-btn laps-btn--icon" onClick={begin} title="Edit this lap" aria-label="Edit lap">
              Edit
            </button>{' '}
            <button
              className="laps-btn laps-btn--icon"
              onClick={() => setConfirming(true)}
              title="Delete this lap"
              aria-label="Delete lap"
            >
              ✕
            </button>
          </>
        )}
      </td>
    </tr>
  );
}
