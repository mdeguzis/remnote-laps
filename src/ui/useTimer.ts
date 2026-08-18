import * as React from 'react';
import { useLocalStorageState, usePlugin } from '@remnote/plugin-sdk';

import { resolvePath } from '../lib/hierarchy.ts';
import { finishTimer, loadData, makeId, runningAsSession, saveData, upsertSession } from '../lib/store.ts';
import { STORAGE_KEYS } from '../lib/types.ts';
import type { Lap, RunningTimer, RunningTimers } from '../lib/types.ts';

export interface TimerApi {
  /** The run belonging to the document this surface is showing, if any. */
  running: RunningTimer | undefined;
  /** Runs on OTHER documents. Zero of them is the normal case. */
  others: RunningTimer[];
  start: (documentId: string) => Promise<void>;
  lap: (documentId: string) => Promise<void>;
  pause: (documentId: string) => Promise<void>;
  resume: (documentId: string) => Promise<void>;
  stop: (documentId: string) => Promise<void>;
  busy: boolean;
}

/**
 * One stopwatch PER DOCUMENT.
 *
 * Originally a single global timer, which meant opening a new document showed
 * the run still counting on the old one. A stopwatch under a document title
 * reads as belonging to that document, so it now does: each document owns its
 * own run and they can overlap.
 *
 * In-flight runs live in LOCAL storage. They persist across a reload, which is
 * what you want when RemNote restarts mid-session, but they do not sync,
 * because a stopwatch running on the laptop should not read as running on the
 * phone. `useLocalStorageState` is reactive, so every surface sees the same map
 * without talking to each other.
 *
 * Completed laps are flushed into SYNCED storage as they happen rather than
 * only at stop, so a crash costs the current partial lap and nothing more.
 */
export function useTimer(documentId: string | undefined): TimerApi {
  const plugin = usePlugin();
  const [timers, setTimers] = useLocalStorageState<RunningTimers | null>(STORAGE_KEYS.running, null);
  const [busy, setBusy] = React.useState(false);

  const all = timers ?? {};
  const running = documentId ? all[documentId] : undefined;
  const others = React.useMemo(
    () => Object.values(all).filter((timer) => timer.key !== documentId),
    [timers, documentId],
  );

  /**
   * Serialise the mutations.
   *
   * Every action is read-modify-write against storage and the buttons sit next
   * to each other. Two clicks landing inside one round trip would have the
   * second overwrite the first, which shows up as a lap that never happened.
   */
  const guard = React.useCallback(
    async (fn: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      try {
        await fn();
      } catch (error) {
        await plugin.app.toast(`Laps: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [busy, plugin],
  );

  /** Replace or remove one document's run, leaving every other one alone. */
  const write = React.useCallback(
    async (key: string, next: RunningTimer | undefined) => {
      const map = { ...all };
      if (next) map[key] = next;
      else delete map[key];
      await setTimers(map);
    },
    [all, setTimers],
  );

  /** Write the in-flight session into the synced store so nothing is at risk. */
  const flush = React.useCallback(
    async (timer: RunningTimer, endedAt?: number) => {
      const data = await loadData(plugin);
      const session = runningAsSession(timer);
      await saveData(plugin, upsertSession(data, endedAt === undefined ? session : { ...session, endedAt }));
    },
    [plugin],
  );

  const start = React.useCallback(
    async (id: string) =>
      guard(async () => {
        if (all[id]) return;

        const resolved = await resolvePath(plugin, id);
        if (!resolved) {
          await plugin.app.toast('Laps could not find that document.');
          return;
        }

        const now = Date.now();
        await write(id, {
          sessionId: makeId('s'),
          key: resolved.key,
          name: resolved.name,
          path: resolved.path,
          pathNames: resolved.pathNames,
          pathOrders: resolved.pathOrders,
          startedAt: now,
          lapStartedAt: now,
          laps: [],
        });
      }),
    [all, guard, plugin, write],
  );

  const lap = React.useCallback(
    async (id: string) =>
      guard(async () => {
        const timer = all[id];
        if (!timer || timer.pausedAt !== undefined) return;
        const now = Date.now();
        const entry: Lap = { id: makeId('l'), ms: now - timer.lapStartedAt, at: now };
        const next: RunningTimer = { ...timer, laps: [...timer.laps, entry], lapStartedAt: now };
        await write(id, next);
        await flush(next);
      }),
    [all, flush, guard, write],
  );

  const pause = React.useCallback(
    async (id: string) =>
      guard(async () => {
        const timer = all[id];
        if (!timer || timer.pausedAt !== undefined) return;
        await write(id, { ...timer, pausedAt: Date.now() });
      }),
    [all, guard, write],
  );

  /**
   * Resuming shifts both anchors forward by the length of the pause.
   *
   * Elapsed time is always derived from `startedAt`, never accumulated, so the
   * only way to not count a pause is to move the start. Shifting `lapStartedAt`
   * by the same amount keeps the current lap honest too.
   */
  const resume = React.useCallback(
    async (id: string) =>
      guard(async () => {
        const timer = all[id];
        if (!timer || timer.pausedAt === undefined) return;
        const paused = Date.now() - timer.pausedAt;
        await write(id, {
          ...timer,
          startedAt: timer.startedAt + paused,
          lapStartedAt: timer.lapStartedAt + paused,
          pausedAt: undefined,
        });
      }),
    [all, guard, write],
  );

  /**
   * Stop, recording the part lap that was in progress.
   *
   * Discarding it would quietly lose the tail of every run, which for a timer
   * measuring one continuous stretch is the entire measurement.
   */
  const stop = React.useCallback(
    async (id: string) =>
      guard(async () => {
        const timer = all[id];
        if (!timer) return;
        // `finishTimer` owns what Stop means, including the part lap, and the
        // stats page uses the same function to stop a run it did not start.
        const { session } = finishTimer(timer);
        if (session) {
          const data = await loadData(plugin);
          await saveData(plugin, upsertSession(data, session));
        }
        await write(id, undefined);
      }),
    [all, guard, plugin, write],
  );

  return { running, others, start, lap, pause, resume, stop, busy };
}
