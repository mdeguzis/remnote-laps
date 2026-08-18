import { filterSessions } from './rollup.ts';
import type { RollupFilterOptions } from './rollup.ts';
import type { Session } from './types.ts';

/** One bar: everything recorded on a single local day. */
export interface DayPoint {
  /** Epoch ms at the start of that local day. */
  day: number;
  ms: number;
  laps: number;
  sessions: number;
}

/** One dot: a single lap, positioned by when it was taken. */
export interface LapPoint {
  at: number;
  ms: number;
  /** 1-based position within its own session, which is the number the user sees. */
  index: number;
  sessionId: string;
  sessionName: string;
  lapId: string;
}

function startOfLocalDay(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Total time per calendar day.
 *
 * Days with no laps are filled in with zero rather than skipped. A bar chart
 * that closes the gaps makes a fortnight off look like a fortnight of steady
 * work, which is the opposite of what the data says.
 */
export function dailyTotals(sessions: Session[], options: RollupFilterOptions = {}): DayPoint[] {
  const buckets = new Map<number, DayPoint>();

  for (const session of filterSessions(sessions, options)) {
    const seenDays = new Set<number>();
    for (const lap of session.laps) {
      const day = startOfLocalDay(lap.at);
      const bucket = buckets.get(day) ?? { day, ms: 0, laps: 0, sessions: 0 };
      bucket.ms += lap.ms;
      bucket.laps += 1;
      if (!seenDays.has(day)) {
        bucket.sessions += 1;
        seenDays.add(day);
      }
      buckets.set(day, bucket);
    }
  }

  if (buckets.size === 0) return [];

  const days = [...buckets.keys()].sort((a, b) => a - b);
  const first = options.from !== undefined ? startOfLocalDay(options.from) : days[0];
  const last = options.to !== undefined ? startOfLocalDay(options.to) : days[days.length - 1];

  const out: DayPoint[] = [];
  const cursor = new Date(first);
  // Guard against a range so wide that filling it would build a runaway array;
  // beyond a few years of bars the chart is unreadable anyway.
  const MAX_DAYS = 2000;
  while (cursor.getTime() <= last && out.length < MAX_DAYS) {
    const key = cursor.getTime();
    out.push(buckets.get(key) ?? { day: key, ms: 0, laps: 0, sessions: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
}

/** Every lap in range, oldest first, as chartable points. */
export function lapSeries(sessions: Session[], options: RollupFilterOptions = {}): LapPoint[] {
  const out: LapPoint[] = [];

  for (const session of filterSessions(sessions, options)) {
    for (const lap of session.laps) {
      out.push({
        at: lap.at,
        ms: lap.ms,
        // `lapNumbers` is built from the unfiltered session, so a lap keeps the
        // number the lap list gives it even when a date range hides the laps
        // before it.
        index: session.lapNumbers[lap.id] ?? 0,
        sessionId: session.id,
        sessionName: session.name,
        lapId: lap.id,
      });
    }
  }

  return out.sort((a, b) => a.at - b.at);
}

export interface SeriesStats {
  count: number;
  totalMs: number;
  meanMs: number;
  bestMs: number;
  worstMs: number;
  medianMs: number;
}

/** Summary numbers under the chart. Returns undefined for an empty series. */
export function statsOf(values: number[]): SeriesStats | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const mid = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    totalMs: total,
    meanMs: total / sorted.length,
    bestMs: sorted[0],
    worstMs: sorted[sorted.length - 1],
    medianMs: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
  };
}

/**
 * Round a maximum up to something a person would choose for an axis top.
 *
 * A y axis topping out at "4.062s" reads as noise; one topping out at 5s reads
 * as a scale. Steps are 1, 2 and 5 per decade, the usual set.
 */
export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}
