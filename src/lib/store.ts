import { DATA_VERSION, STORAGE_KEYS, emptyData } from './types.ts';
import type { Lap, LapId, LapsData, RunningTimer, Session, SessionId } from './types.ts';

/**
 * The storage surface Laps needs.
 *
 * Declared structurally rather than importing `ReactRNPlugin` so the pure
 * functions below can be exercised against a plain object in the tests. The
 * SDK's plugin satisfies this shape as-is.
 */
export interface StorageHost {
  storage: {
    getSynced: <T = unknown>(key: string) => Promise<T | undefined>;
    setSynced: (key: string, value: any) => Promise<void>;
    getLocal: <T = unknown>(key: string) => Promise<T | undefined>;
    setLocal: (key: string, value: any) => Promise<void>;
  };
}

/**
 * Coerce whatever came back from storage into a `LapsData`.
 *
 * Storage is synced, so a newer build on another device can put a shape here
 * that this one has never seen. Salvaging what parses beats discarding it, and
 * discarding it beats crashing the widget with a stale object.
 */
export function normalizeData(raw: unknown): LapsData {
  if (!raw || typeof raw !== 'object') return emptyData();
  const candidate = raw as Partial<LapsData>;
  if (!candidate.sessions || typeof candidate.sessions !== 'object') return emptyData();

  const sessions: Record<SessionId, Session> = {};
  for (const [id, value] of Object.entries(candidate.sessions)) {
    const session = value as Partial<Session>;
    if (!session || typeof session !== 'object') continue;
    if (typeof session.key !== 'string') continue;
    if (!Array.isArray(session.laps)) continue;
    sessions[id] = {
      id,
      key: session.key,
      name: typeof session.name === 'string' ? session.name : 'Untitled',
      path: Array.isArray(session.path) ? session.path : [session.key],
      pathNames: Array.isArray(session.pathNames) ? session.pathNames : [],
      pathOrders: Array.isArray(session.pathOrders) ? session.pathOrders : undefined,
      startedAt: typeof session.startedAt === 'number' ? session.startedAt : 0,
      endedAt: typeof session.endedAt === 'number' ? session.endedAt : undefined,
      laps: session.laps.filter(
        (lap): lap is Lap => !!lap && typeof (lap as Lap).ms === 'number' && typeof (lap as Lap).at === 'number',
      ),
    };
  }

  return { version: DATA_VERSION, sessions };
}

export async function loadData(plugin: StorageHost): Promise<LapsData> {
  return normalizeData(await plugin.storage.getSynced(STORAGE_KEYS.data));
}

export async function saveData(plugin: StorageHost, data: LapsData): Promise<void> {
  await plugin.storage.setSynced(STORAGE_KEYS.data, data);
}

export function sessionList(data: LapsData): Session[] {
  return Object.values(data.sessions).sort((a, b) => a.startedAt - b.startedAt);
}

/** Insert or replace one session, leaving the rest of the store alone. */
export function upsertSession(data: LapsData, session: Session): LapsData {
  return { ...data, sessions: { ...data.sessions, [session.id]: session } };
}

export function removeSession(data: LapsData, sessionId: SessionId): LapsData {
  const sessions = { ...data.sessions };
  delete sessions[sessionId];
  return { ...data, sessions };
}

/**
 * Change one lap's duration or note.
 *
 * Editing a lap does NOT shift the laps around it. A lap time is the number the
 * user cares about; the wall clock timestamps are provenance. Rewriting the
 * neighbours to keep the arithmetic tidy would silently change data the user
 * did not touch, which is the worse of the two inconsistencies.
 */
export function editLap(data: LapsData, sessionId: SessionId, lapId: LapId, patch: Partial<Pick<Lap, 'ms' | 'note'>>): LapsData {
  const session = data.sessions[sessionId];
  if (!session) return data;

  const laps = session.laps.map((lap) =>
    lap.id === lapId
      ? { ...lap, ...(patch.ms === undefined ? {} : { ms: Math.max(0, patch.ms) }), ...(patch.note === undefined ? {} : { note: patch.note }) }
      : lap,
  );

  return upsertSession(data, { ...session, laps });
}

/**
 * Delete a lap, and the session with it when that was the last one.
 *
 * An empty session would otherwise sit in every rollup contributing a session
 * count and no time, which reads as a bug in the totals.
 */
export function deleteLap(data: LapsData, sessionId: SessionId, lapId: LapId): LapsData {
  const session = data.sessions[sessionId];
  if (!session) return data;

  const laps = session.laps.filter((lap) => lap.id !== lapId);
  if (laps.length === 0) return removeSession(data, sessionId);
  return upsertSession(data, { ...session, laps });
}

/** Every lap in the store, flattened, with its owning session attached. */
export function allLaps(data: LapsData): { session: Session; lap: Lap }[] {
  const out: { session: Session; lap: Lap }[] = [];
  for (const session of sessionList(data)) {
    for (const lap of session.laps) out.push({ session, lap });
  }
  return out.sort((a, b) => a.lap.at - b.lap.at);
}

/** The earliest and latest lap timestamps in the store, if there are any. */
export function recordedRange(data: LapsData): { from: number; to: number } | undefined {
  const laps = allLaps(data);
  if (laps.length === 0) return undefined;
  return { from: laps[0].lap.at, to: laps[laps.length - 1].lap.at };
}

export async function loadRunning(plugin: StorageHost): Promise<RunningTimer | undefined> {
  const raw = await plugin.storage.getLocal<RunningTimer>(STORAGE_KEYS.running);
  if (!raw || typeof raw !== 'object') return undefined;
  if (typeof raw.startedAt !== 'number' || typeof raw.key !== 'string') return undefined;
  return raw;
}

export async function saveRunning(plugin: StorageHost, running: RunningTimer | undefined): Promise<void> {
  await plugin.storage.setLocal(STORAGE_KEYS.running, running ?? null);
}

/** Elapsed time of a running timer, frozen at `pausedAt` while paused. */
export function elapsedOf(running: RunningTimer, now: number): number {
  return Math.max(0, (running.pausedAt ?? now) - running.startedAt);
}

/** Elapsed time of the CURRENT lap, which is what the pill counts up. */
export function currentLapElapsed(running: RunningTimer, now: number): number {
  return Math.max(0, (running.pausedAt ?? now) - running.lapStartedAt);
}

/** The running timer as a Session, so an in-flight run appears in the rollup. */
export function runningAsSession(running: RunningTimer): Session {
  return {
    id: running.sessionId,
    key: running.key,
    name: running.name,
    path: running.path,
    pathNames: running.pathNames,
    pathOrders: running.pathOrders,
    startedAt: running.startedAt,
    laps: running.laps,
  };
}

/**
 * Close a run, folding in the part lap that was still in progress.
 *
 * Shared by the stopwatch's own Stop button and by the stats page, which can
 * stop a run it did not start. Two implementations of "what does Stop mean"
 * would eventually disagree about whether the tail counts, and the tail is the
 * whole measurement for a timer used to time one continuous stretch.
 *
 * Returns no session when the run banked nothing at all, so a stopwatch started
 * and immediately stopped leaves no empty record behind.
 */
export function finishTimer(running: RunningTimer, now = Date.now()): { session?: Session; endedAt: number } {
  // A paused run ended when it was paused, not when Stop was finally pressed.
  const endedAt = running.pausedAt ?? now;
  const tail = endedAt - running.lapStartedAt;
  const laps = tail > 0 ? [...running.laps, { id: makeId('l'), ms: tail, at: endedAt }] : running.laps;

  if (laps.length === 0) return { endedAt };
  return { session: { ...runningAsSession({ ...running, laps }), endedAt }, endedAt };
}

export function makeId(prefix: string): string {
  // Good enough for local ids and available in the widget sandbox, where
  // crypto.randomUUID is not guaranteed to be.
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
