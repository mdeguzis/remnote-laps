import type { RollupNode } from './rollup.ts';
import type { Goal, Goals, RemId } from './types.ts';

/**
 * Goals: a target time, a target number of laps, or both, set on any document
 * or folder.
 *
 * Progress is measured against the ROLLED UP total, not the item's own time, so
 * a goal on a folder is met by work done anywhere beneath it. That is the same
 * rule the rest of the plugin uses for a folder, and having goals disagree with
 * the totals shown right beside them would be worse than any convenience.
 */

export interface GoalProgress {
  goal: Goal;
  /** What has actually been recorded, so the UI can show progress as X of Y. */
  currentMs: number;
  currentLaps: number;
  /** 0 to 1, and never above 1 even when the target is beaten. */
  timeFraction?: number;
  lapFraction?: number;
  /** The single bar the UI draws: the least complete half of the goal. */
  overall: number;
  met: boolean;
  msRemaining?: number;
  lapsRemaining?: number;
}

export function normalizeGoals(raw: unknown): Goals {
  if (!raw || typeof raw !== 'object') return {};
  const out: Goals = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const goal = value as Partial<Goal>;
    if (!goal || typeof goal !== 'object') continue;
    const targetMs = typeof goal.targetMs === 'number' && goal.targetMs > 0 ? goal.targetMs : undefined;
    const targetLaps = typeof goal.targetLaps === 'number' && goal.targetLaps > 0 ? Math.round(goal.targetLaps) : undefined;
    // A goal with neither target is not a goal, and would otherwise render as
    // an empty progress bar that can never be met.
    if (targetMs === undefined && targetLaps === undefined) continue;
    out[key] = { targetMs, targetLaps, setAt: typeof goal.setAt === 'number' ? goal.setAt : 0 };
  }
  return out;
}

export function setGoal(goals: Goals, key: RemId, goal: Omit<Goal, 'setAt'>, now = Date.now()): Goals {
  const next = { ...goals };
  if (goal.targetMs === undefined && goal.targetLaps === undefined) {
    delete next[key];
    return next;
  }
  next[key] = { ...goal, setAt: now };
  return next;
}

export function clearGoal(goals: Goals, key: RemId): Goals {
  const next = { ...goals };
  delete next[key];
  return next;
}

/**
 * Measure a goal against a node of the rollup tree.
 *
 * Returns undefined when there is no goal, so the caller can render nothing
 * rather than an empty bar.
 *
 * When both targets are set, the goal is met only when BOTH are, and the bar
 * shows the lesser of the two. Showing the greater would let a goal read as
 * nearly finished while the half that is actually behind is barely started.
 */
export function measureGoal(goal: Goal | undefined, node: RollupNode | undefined): GoalProgress | undefined {
  if (!goal) return undefined;

  const totalMs = node?.totalMs ?? 0;
  const totalLaps = node?.totalLaps ?? 0;

  const timeFraction = goal.targetMs ? Math.min(1, totalMs / goal.targetMs) : undefined;
  const lapFraction = goal.targetLaps ? Math.min(1, totalLaps / goal.targetLaps) : undefined;

  const parts = [timeFraction, lapFraction].filter((value): value is number => value !== undefined);
  const overall = parts.length === 0 ? 0 : Math.min(...parts);

  return {
    goal,
    currentMs: totalMs,
    currentLaps: totalLaps,
    timeFraction,
    lapFraction,
    overall,
    met: parts.length > 0 && parts.every((value) => value >= 1),
    msRemaining: goal.targetMs ? Math.max(0, goal.targetMs - totalMs) : undefined,
    lapsRemaining: goal.targetLaps ? Math.max(0, goal.targetLaps - totalLaps) : undefined,
  };
}
