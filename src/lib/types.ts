/**
 * The shape of everything Laps stores.
 *
 * The organising idea is that a lap belongs to a *key*, a key belongs to a
 * *path*, and a path is the chain of Rem from the top of the knowledge base
 * down to the document the lap was recorded in. Rolling up is then just
 * grouping by successively shorter prefixes of that path, which is what
 * `rollup.ts` does.
 */

export type RemId = string;
export type LapId = string;
export type SessionId = string;

/** One lap: the slice of time between the previous lap and this one. */
export interface Lap {
  id: LapId;
  /** Duration of this lap alone, in milliseconds. Editable by the user. */
  ms: number;
  /** Wall clock time the lap was taken. Drives every date filter and the chart. */
  at: number;
  /** Optional label the user typed when editing the lap. */
  note?: string;
}

/**
 * One run of the stopwatch, always anchored to exactly one document.
 *
 * `path` is snapshotted at record time rather than looked up on read. A
 * document that later moves, or is deleted outright, would otherwise silently
 * change or lose its history, and the whole point of the rollup is that last
 * month's totals stay put.
 */
export interface Session {
  id: SessionId;
  /** The document's unique key. This is the Rem's stable UUID. */
  key: RemId;
  /** The document's name when the session was recorded. */
  name: string;
  /** Root first, document last. `path[path.length - 1] === key`. */
  path: RemId[];
  /** Names parallel to `path`, so the tree renders without touching the KB. */
  pathNames: string[];
  /**
   * Each path entry's index among its siblings, so the tree can be ordered the
   * way RemNote's sidebar orders it. Absent on sessions recorded before this
   * was captured, which fall back to ordering by time.
   */
  pathOrders?: number[];
  startedAt: number;
  /** Absent while the session is still running. */
  endedAt?: number;
  laps: Lap[];
}

/** The whole synced store, under one storage key. */
export interface LapsData {
  version: number;
  sessions: Record<SessionId, Session>;
}

/**
 * The in-flight session.
 *
 * Held in *local* storage, not synced: a stopwatch running on the laptop should
 * not read as running on the phone. Each lap still flushes the session into the
 * synced store, so a crash costs the current partial lap and nothing else.
 */
export interface RunningTimer {
  sessionId: SessionId;
  key: RemId;
  name: string;
  path: RemId[];
  pathNames: string[];
  pathOrders?: number[];
  /** Epoch ms the stopwatch started. Elapsed is always derived from this. */
  startedAt: number;
  /** Epoch ms the current lap started. */
  lapStartedAt: number;
  laps: Lap[];
  /** Set while paused; elapsed freezes at this value until resumed. */
  pausedAt?: number;
}

export const STORAGE_KEYS = {
  /** Synced. Every completed and in-progress session. */
  data: 'laps.data.v1',
  /** Synced. Per document goals, keyed by Rem id. */
  goals: 'laps.goals.v1',
  /** Session. The scope the stats page was opened on. */
  scope: 'laps.scope',
  /**
   * Local. In-flight sessions, keyed by document.
   *
   * A map rather than a single timer: opening a different document has to show
   * a fresh stopwatch for THAT document, not the one still counting somewhere
   * else. Each document owns its own run.
   */
  running: 'laps.running.v2',
  /**
   * Local. Where the user dragged the stopwatch to, as an OFFSET.
   *
   * Stored as a delta from wherever the placement setting would have put it,
   * not as an absolute point, because a widget in a sandboxed iframe cannot
   * learn its own position in the host viewport. A delta it can measure, from
   * `screenX`/`screenY`, which mean the same thing in both documents.
   *
   * Local rather than synced: one position for the whole knowledge base, as
   * asked, but a pixel offset that suits a desktop would be wrong on a phone.
   */
  position: 'laps.position',
} as const;

/** A drag offset in CSS pixels, relative to the anchored placement. */
export interface PillOffset {
  x: number;
  y: number;
}

export const DATA_VERSION = 1;

export function emptyData(): LapsData {
  return { version: DATA_VERSION, sessions: {} };
}

/**
 * A target for a document: finish in this long, or do this many laps.
 *
 * Both are optional and both can be set at once, in which case the goal is met
 * only when both are. Stored per Rem key, synced, because a goal is a decision
 * about the material rather than about the device you set it on.
 */
export interface Goal {
  targetMs?: number;
  targetLaps?: number;
  /** When the goal was set, so the stats page can say how long it has stood. */
  setAt: number;
}

export type Goals = Record<RemId, Goal>;

/** Every in-flight run, keyed by the document it belongs to. */
export type RunningTimers = Record<RemId, RunningTimer>;
