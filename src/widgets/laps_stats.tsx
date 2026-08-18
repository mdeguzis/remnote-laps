import * as React from 'react';
import {
  AppEvents,
  renderWidget,
  useAPIEventListener,
  usePlugin,
  useLocalStorageState,
  useSessionStorageState,
  useTrackerPlugin,
} from '@remnote/plugin-sdk';

import { dailyTotals, lapSeries, statsOf } from '../lib/chartdata.ts';
import {
  formatCoarse,
  formatHMS,
  fromDateInputEnd,
  fromDateInputStart,
  toDateInput,
} from '../lib/format.ts';
import { buildRollup, filterSessions, findNode, topRecorded } from '../lib/rollup.ts';
import { clearGoal, normalizeGoals, setGoal } from '../lib/goals.ts';
import {
  deleteLap,
  editLap,
  elapsedOf,
  finishTimer,
  loadData,
  normalizeData,
  recordedRange,
  saveData,
  sessionList,
  upsertSession,
} from '../lib/store.ts';
import { STORAGE_KEYS, emptyData } from '../lib/types.ts';
import type { RollupNode } from '../lib/rollup.ts';
import type { Goals, LapsData, RunningTimers } from '../lib/types.ts';
import { Chart } from '../ui/Chart.tsx';
import type { ChartMode } from '../ui/Chart.tsx';
import { LapTable } from '../ui/LapTable.tsx';
import { Stopwatch } from '../ui/Stopwatch.tsx';
import { GoalPanel } from '../ui/GoalPanel.tsx';
import { Tree } from '../ui/Tree.tsx';
import { LapsStyle, useNow, useOptions } from '../ui/hooks.tsx';

type Tab = 'laps' | 'chart';

/**
 * The stats page.
 *
 * Opened from the right click menu of whatever the user pointed at, and scoped
 * to that Rem AND everything below it. Right clicking a folder therefore
 * answers "how long have I spent anywhere under here", and right clicking a
 * document answers it for that document alone, from the same screen.
 */
function LapsStats(): JSX.Element {
  const options = useOptions();

  // Where the page was opened on, published by the menu item. Reactive, so
  // invoking Laps on a different Rem re-scopes the sidebar that is already open
  // instead of quietly showing the previous item.
  const [scopeRequest] = useSessionStorageState<{
    scopeKey: string;
    scopeName: string;
    at: number;
    openGoal?: boolean;
  } | null>(
    STORAGE_KEYS.scope,
    null,
  );

  const plugin = usePlugin();

  /*
   * Read through the tracker AND a storage event, not `useSyncedStorageState`.
   *
   * The sidebar is a different iframe from the stopwatch that writes the laps,
   * and the hook was not picking up writes made in that other frame: everything
   * recorded before the sidebar opened appeared, everything after it silently
   * did not. A stats page quietly a few minutes out of date is worse than one
   * that is obviously broken, because the numbers look plausible.
   *
   * The event listener is the belt to the tracker's braces. Either alone would
   * probably do; together the page cannot sit on stale numbers.
   */
  const [refresh, setRefresh] = React.useState(0);
  const bump = React.useCallback(() => setRefresh((value) => value + 1), []);
  useAPIEventListener(AppEvents.StorageSyncedChange, STORAGE_KEYS.data, bump);
  useAPIEventListener(AppEvents.StorageSyncedChange, STORAGE_KEYS.goals, bump);

  const data =
    useTrackerPlugin(async (p) => normalizeData(await p.storage.getSynced<LapsData>(STORAGE_KEYS.data)), [refresh]) ??
    emptyData();
  const goals =
    useTrackerPlugin(async (p) => normalizeGoals(await p.storage.getSynced<Goals>(STORAGE_KEYS.goals)), [refresh]) ?? {};

  const sessions = React.useMemo(() => sessionList(data), [data]);

  // In-flight runs, so the page can explain itself when a stopwatch is going
  // but has recorded nothing yet. Time only lands in the store on Lap or Stop,
  // which otherwise looks exactly like the plugin having lost the run.
  const [runningTimers] = useLocalStorageState<RunningTimers | null>(STORAGE_KEYS.running, null);
  // Only ticks while something is actually running, so an idle stats page does
  // no work. 500ms is plenty for a readout measured in minutes.
  const now = useNow(Object.keys(runningTimers ?? {}).length > 0, 500);

  const setStored = React.useCallback(
    async (next: LapsData) => {
      await plugin.storage.setSynced(STORAGE_KEYS.data, next);
      bump();
    },
    [plugin, bump],
  );

  const setStoredGoals = React.useCallback(
    async (next: Goals) => {
      await plugin.storage.setSynced(STORAGE_KEYS.goals, next);
      bump();
    },
    [plugin, bump],
  );

  // Whatever document the focused pane has open, used when the sidebar is
  // opened from its own tab rather than from a menu item. Landing on
  // "Everything" there means the goal panel has nothing to attach to, and the
  // page opens on a question the user did not ask.
  const openDoc = useTrackerPlugin(async (p) => {
    const paneId = await p.window.getFocusedPaneId();
    return await p.window.getOpenPaneRemId(paneId);
  }, []);

  const openedOn: string | undefined = scopeRequest?.scopeKey || undefined;
  const openedName: string | undefined = scopeRequest?.scopeName;
  const openedAt = scopeRequest?.at;

  const [scopeKey, setScopeKey] = React.useState<string>('');
  const [scopeName, setScopeName] = React.useState<string>('Everything');
  const [tab, setTab] = React.useState<Tab>('laps');
  const [mode, setMode] = React.useState<ChartMode>('daily');
  const [pickingScope, setPickingScope] = React.useState(false);
  const [fromText, setFromText] = React.useState('');
  const [toText, setToText] = React.useState('');

  // Adopt the invoking Rem on each NEW request, keyed by timestamp. Adopting on
  // every render would stamp on the scope the user picked in the tree; adopting
  // only once would ignore a second invocation on a different Rem while the
  // sidebar stayed open.
  const adopted = React.useRef<number | undefined>(undefined);
  React.useEffect(() => {
    if (openedAt === undefined || adopted.current === openedAt) return;
    adopted.current = openedAt;
    setScopeKey(openedOn ?? '');
    setScopeName(openedOn ? openedName || 'Selected item' : 'Everything');
  }, [openedAt, openedOn, openedName]);

  // No menu request at all: fall back to the open document, once.
  const defaulted = React.useRef(false);
  React.useEffect(() => {
    if (defaulted.current || openedAt !== undefined || !openDoc) return;
    defaulted.current = true;
    setScopeKey(openDoc);
  }, [openDoc, openedAt]);

  const from = fromDateInputStart(fromText);
  const to = fromDateInputEnd(toText);
  const filter = React.useMemo(
    () => ({ from, to, scopeKey: scopeKey || undefined }),
    [from, to, scopeKey],
  );

  const rollup = React.useMemo(() => buildRollup(sessions, { from, to }), [sessions, from, to]);
  const scopedSessions = React.useMemo(() => filterSessions(sessions, filter), [sessions, filter]);
  const days = React.useMemo(() => dailyTotals(sessions, filter), [sessions, filter]);
  const laps = React.useMemo(() => lapSeries(sessions, filter), [sessions, filter]);
  const summary = React.useMemo(() => statsOf(laps.map((lap) => lap.ms)), [laps]);

  // Same scope, no date filter. Separating the two reasons a page can be empty
  // is what lets it say which one applies instead of always blaming the dates.
  const scopedIgnoringDates = React.useMemo(
    () => filterSessions(sessions, { scopeKey: scopeKey || undefined }),
    [sessions, scopeKey],
  );

  const emptyReason: 'none' | 'nothing-recorded' | 'nothing-here' | 'nothing-in-range' =
    scopedSessions.length > 0
      ? 'none'
      : sessions.length === 0
        ? 'nothing-recorded'
        : scopedIgnoringDates.length === 0
          ? 'nothing-here'
          : 'nothing-in-range';

  const scopeNode = scopeKey ? findNode(rollup, scopeKey) : rollup;
  // The stopwatch's stats button passes an id without a name, and a scope with
  // no recorded laps has no node to read one from either.
  const shownScopeName = scopeKey ? scopeNode?.name || scopeName || 'This document' : 'Everything';
  const scopedTotal = scopeNode?.totalMs ?? 0;
  const scopedSelf = scopeNode?.selfMs ?? 0;

  const range = recordedRange(data);

  /**
   * Stop a run from here, using the same `finishTimer` the stopwatch uses.
   *
   * Reaches into local storage directly rather than through `useTimer`, which
   * is scoped to a single document; this page has to be able to stop a run on
   * any of them.
   */
  const stopRunning = React.useCallback(
    async (key: string) => {
      const map = (await plugin.storage.getLocal<RunningTimers>(STORAGE_KEYS.running)) ?? {};
      const timer = map[key];
      if (!timer) return;

      const { session } = finishTimer(timer);
      if (session) await saveData(plugin, upsertSession(await loadData(plugin), session));

      const next = { ...map };
      delete next[key];
      await plugin.storage.setLocal(STORAGE_KEYS.running, next);
      bump();
    },
    [plugin, bump],
  );

  // A run counts as "in scope" on the same rule as everything else: the scoped
  // key anywhere in its path, so a folder covers runs on documents beneath it.
  const runningHere = React.useMemo(
    () =>
      Object.values(runningTimers ?? {}).filter(
        (timer) => !scopeKey || timer.path.includes(scopeKey) || timer.key === scopeKey,
      ),
    [runningTimers, scopeKey],
  );

  const applyQuickRange = (days: number | undefined) => {
    if (days === undefined) {
      setFromText('');
      setToText('');
      return;
    }
    const now = Date.now();
    setFromText(toDateInput(now - (days - 1) * 24 * 60 * 60 * 1000));
    setToText(toDateInput(now));
  };

  const onEdit = (sessionId: string, lapId: string, patch: { ms?: number; note?: string }) =>
    void setStored(editLap(data, sessionId, lapId, patch));

  const onDelete = (sessionId: string, lapId: string) => void setStored(deleteLap(data, sessionId, lapId));

  return (
    <div className="laps-root laps-popup rn-clr-background-primary rn-clr-content-primary">
      <LapsStyle options={options} />

      <div className="laps-popup__head">
        <Stopwatch size={34} running={false} anchorElapsedMs={0} title="Laps" />
        <div>
          <div className="laps-popup__title">Laps</div>
          <div className="laps-popup__sub">
            {shownScopeName} · {formatCoarse(scopedTotal)} total
            {scopedTotal !== scopedSelf ? ` · ${formatCoarse(scopedSelf)} on this item itself` : ''}
          </div>
        </div>
        <div className="laps-popup__spacer" />
        <button
          className="laps-btn laps-btn--square"
          onClick={bump}
          title="Re-read the recorded laps"
          aria-label="Refresh"
        >
          <RefreshIcon />
        </button>
        <button
          className="laps-btn"
          onClick={() => setPickingScope((value) => !value)}
          title="Choose which document, folder or level to report on"
        >
          {pickingScope ? 'Hide levels' : 'Change scope'}
        </button>
      </div>

      {pickingScope ? (
        <div style={{ marginBottom: 10 }}>
          <Tree
            root={rollup}
            scopeKey={scopeKey}
            onScope={(key, name) => {
              setScopeKey(key);
              setScopeName(key === '' ? 'Everything' : name);
            }}
          />
        </div>
      ) : null}

      <div className="laps-controls">
        <span className="laps-field">
          <label htmlFor="laps-from">From</label>
          <input
            id="laps-from"
            className="laps-date"
            type="date"
            value={fromText}
            min={range ? toDateInput(range.from) : undefined}
            onChange={(event) => setFromText(event.target.value)}
          />
        </span>
        <span className="laps-field">
          <label htmlFor="laps-to">To</label>
          <input
            id="laps-to"
            className="laps-date"
            type="date"
            value={toText}
            max={range ? toDateInput(range.to) : undefined}
            onChange={(event) => setToText(event.target.value)}
          />
        </span>
        <button className="laps-btn" onClick={() => applyQuickRange(7)}>
          7 days
        </button>
        <button className="laps-btn" onClick={() => applyQuickRange(30)}>
          30 days
        </button>
        <button className="laps-btn" onClick={() => applyQuickRange(undefined)}>
          All time
        </button>
        {range ? (
          <span className="laps-popup__sub">
            Recorded {toDateInput(range.from)} to {toDateInput(range.to)}
          </span>
        ) : null}
      </div>

      <div className="laps-tabs rn-clr-border-opaque">
        <button className={`laps-tab${tab === 'laps' ? ' laps-tab--active' : ''}`} onClick={() => setTab('laps')}>
          Laps
        </button>
        <button className={`laps-tab${tab === 'chart' ? ' laps-tab--active' : ''}`} onClick={() => setTab('chart')}>
          Chart
        </button>
      </div>

      <GoalPanel
        scopeKey={scopeKey}
        scopeName={shownScopeName}
        goal={goals[scopeKey]}
        node={scopeNode}
        startOpen={scopeRequest?.openGoal === true}
        onSave={(next) => void setStoredGoals(setGoal(goals, scopeKey, next))}
        onClear={() => void setStoredGoals(clearGoal(goals, scopeKey))}
      />

      {/* Named, with their elapsed time and a Stop each. A bare count answers
          "how many" when the question is "which one did I leave going". */}
      {runningHere.length > 0 ? (
        <div className="laps-running-note">
          <div className="laps-running-note__head">
            {runningHere.length === 1 ? 'A stopwatch is running' : `${runningHere.length} stopwatches are running`}
            {' · time since the last Lap is not recorded yet'}
          </div>
          <div className="laps-running-note__list">
            {runningHere.map((timer) => (
              <span key={timer.key} className="laps-running-chip">
                <span className="laps-running-chip__name" title={timer.name}>
                  {timer.name}
                </span>
                <span className="laps-running-chip__time">
                  {formatHMS(elapsedOf(timer, now), false)}
                  {timer.pausedAt !== undefined ? ' paused' : ''}
                </span>
                <button
                  className="laps-btn laps-btn--icon"
                  onClick={() => void stopRunning(timer.key)}
                  title={`Stop the run on "${timer.name}" and record it`}
                >
                  Stop
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="laps-popup__body">
        {emptyReason !== 'none' ? (
          <Empty
            reason={emptyReason}
            scopeName={shownScopeName}
            elsewhere={topRecorded(buildRollup(sessions))}
            onScope={(key, name) => {
              setScopeKey(key);
              setScopeName(name);
            }}
            onClearDates={() => applyQuickRange(undefined)}
          />
        ) : tab === 'laps' ? (
          <LapTable
            sessions={scopedSessions}
            highlightExtremes={options.highlightExtremes}
            showMs={options.showMs}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : (
          <>
            <div className="laps-controls">
              <span className="laps-field">
                <label htmlFor="laps-mode">Show</label>
                <select
                  id="laps-mode"
                  className="laps-select"
                  value={mode}
                  onChange={(event) => setMode(event.target.value as ChartMode)}
                >
                  <option value="daily">Time per day</option>
                  <option value="laps">Individual lap times</option>
                </select>
              </span>
              {mode === 'daily' ? <span className="laps-popup__sub">Click a bar to filter to that day.</span> : null}
            </div>

            <Chart
                  mode={mode}
                  days={days}
                  laps={laps}
                  onPickDay={(day) => {
                    const text = toDateInput(day.day);
                    setFromText(text);
                    setToText(text);
                  }}
                />
                <div className="laps-legend">
                  <span>
                    <i className="laps-legend__swatch" style={{ background: 'var(--laps-accent)' }} />
                    {mode === 'daily' ? 'Time recorded' : 'Lap time'}
                  </span>
                  {mode === 'laps' ? (
                    <>
                      <span>
                        <i className="laps-legend__swatch" style={{ background: 'var(--laps-best)' }} />
                        Fastest
                      </span>
                      <span>
                        <i className="laps-legend__swatch" style={{ background: 'var(--laps-worst)' }} />
                        Slowest
                      </span>
                    </>
                  ) : null}
                </div>

                {summary ? (
                  <div className="laps-controls" style={{ marginTop: 12 }}>
                    <Stat label="Laps" value={String(summary.count)} />
                    <Stat label="Total" value={formatCoarse(summary.totalMs)} />
                    <Stat label="Mean" value={formatHMS(summary.meanMs, options.showMs)} />
                    <Stat label="Median" value={formatHMS(summary.medianMs, options.showMs)} />
                    <Stat label="Fastest" value={formatHMS(summary.bestMs, options.showMs)} />
                    <Stat label="Slowest" value={formatHMS(summary.worstMs, options.showMs)} />
                  </div>
                ) : null}
          </>
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

/**
 * Why the page is empty, and the way out of it.
 *
 * "No laps in this range" is the wrong thing to say when the date boxes are
 * blank and the real answer is that this document has never been timed. Each
 * case gets the button that actually fixes it.
 */
function Empty({
  reason,
  scopeName,
  elsewhere,
  onScope,
  onClearDates,
}: {
  reason: 'nothing-recorded' | 'nothing-here' | 'nothing-in-range';
  scopeName: string;
  elsewhere: RollupNode[];
  onScope: (key: string, name: string) => void;
  onClearDates: () => void;
}): JSX.Element {
  if (reason === 'nothing-recorded') {
    return (
      <div className="laps-empty">
        Nothing recorded yet. Start the stopwatch on a document and press Lap.
      </div>
    );
  }

  if (reason === 'nothing-here') {
    return (
      <div className="laps-empty">
        <div>Nothing recorded under "{scopeName}", or anything below it.</div>

        {/* Saying where the time IS turns a dead end into a next step. Without
            this the page states a fact and leaves the reader to go hunting. */}
        {elsewhere.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Time is recorded on:</div>
            {elsewhere.map((node) => (
              <button
                key={node.key}
                className="laps-btn"
                style={{ margin: '3px 3px' }}
                onClick={() => onScope(node.key, node.name)}
              >
                {node.name} · {formatCoarse(node.selfMs)}
              </button>
            ))}
          </div>
        ) : null}

        <div>
          <button className="laps-btn" style={{ marginTop: 12 }} onClick={() => onScope('', 'Everything')}>
            Show everything
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="laps-empty">
      <div>There are laps under "{scopeName}", but none in this date range.</div>
      <button className="laps-btn" style={{ marginTop: 10 }} onClick={onClearDates}>
        Clear the dates
      </button>
    </div>
  );
}

/** A plain circular arrow. Same fixed box as the other square buttons. */
function RefreshIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" strokeLinecap="round" />
      <path d="M13.7 1.8v3.1h-3.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <span className="laps-field">
      <label>{label}</label>
      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
    </span>
  );
}

renderWidget(LapsStats);
