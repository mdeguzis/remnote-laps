import {
  AppEvents,
  PluginCommandMenuLocation,
  WidgetLocation,
  declareIndexPlugin,
} from '@remnote/plugin-sdk';
import type { ReactRNPlugin } from '@remnote/plugin-sdk';

import { hostCSS } from '../lib/hostcss.ts';
import type { Placement } from '../lib/hostcss.ts';
import { STORAGE_KEYS } from '../lib/types.ts';
import type { PillOffset } from '../lib/types.ts';

import { formatCoarse } from '../lib/format.ts';
import { resolvePath } from '../lib/hierarchy.ts';
import { flagIconUrl, stopwatchIconUrl, stopwatchSVG } from '../lib/icon.ts';
import { buildRollup, findNode } from '../lib/rollup.ts';
import { loadData, loadRunning, sessionList } from '../lib/store.ts';
import { SETTING_IDS, readOptions, registerSettings } from '../lib/settings.ts';

const STATS_WIDGET = 'laps_stats';

/**
 * Open the stats page scoped to a Rem.
 *
 * The scope is that Rem AND everything below it, which is the whole point of
 * putting this on a folder's menu: right clicking a folder answers "how long
 * have I spent anywhere under here" without the user picking anything.
 */
async function openStats(plugin: ReactRNPlugin, remId: string | undefined, openGoal = false): Promise<void> {
  const resolved = remId ? await resolvePath(plugin, remId) : undefined;

  // The scope travels through session storage rather than as widget context
  // data. Each surface exposes context differently (RightSidebar exposes none
  // at all), and a storage key works from all of them, so the stats page does
  // not care where it was opened.
  await plugin.storage.setSession(STORAGE_KEYS.scope, {
    scopeKey: remId ?? '',
    scopeName: resolved?.name ?? (remId ? 'Selected item' : 'Everything'),
    at: Date.now(),
    openGoal,
  });

  // The RIGHT SIDEBAR, after trying both alternatives.
  //
  // A popup ignores its width: '92%' and then 900 both came out around 370px,
  // portrait and far too narrow for a chart, while the height was honoured.
  // `openWidgetInPane` is wide enough but corrupts RemNote's own window tree,
  // which then throws "Cannot parse window string: (doc-slug)_(widget~id)_50"
  // repeatedly for the rest of the session. The sidebar is wide, resizable,
  // stays put while you move between documents, and touches neither.
  await plugin.window.openWidgetInRightSidebar(STATS_WIDGET);
}

/**
 * The Rem the user is acting on.
 *
 * `registerRemMenuItem` hands its action no arguments at all, unlike
 * `registerMenuItem`, so the rem context menu has to be resolved from focus.
 * Falls back to whatever document the focused pane has open, which is the right
 * answer for the omnibar commands.
 */
async function currentRemId(plugin: ReactRNPlugin): Promise<string | undefined> {
  const focused = await plugin.focus.getFocusedRem();
  if (focused?._id) return focused._id;
  const paneId = await plugin.window.getFocusedPaneId();
  return await plugin.window.getOpenPaneRemId(paneId);
}

/**
 * Run one registration without letting it take the rest of the plugin down.
 *
 * Wrapping the whole of `onActivate` in a single try/catch was not enough. One
 * rejected registration aborted every registration after it, so a menu item
 * that RemNote refused also cost the stopwatch, the stats page and every
 * command. These are independent features and they fail independently.
 */
async function optional(plugin: ReactRNPlugin, label: string, register: () => Promise<void>): Promise<boolean> {
  try {
    await register();
    return true;
  } catch (error) {
    console.warn(`[Laps] could not register ${label}:`, error);
    return false;
  }
}

/**
 * Add "Laps" to the right click menu of a Rem, working around a broken SDK.
 *
 * `plugin.app.registerRemMenuItem` is unusable in @remnote/plugin-sdk 0.0.46,
 * which is the latest release. The SDK destructures the command and forwards
 * only two fields:
 *
 *   const { id, name, action } = command;
 *   this.plugin.model[id] = action;
 *   this._call('registerRemMenuItem', { id, name });
 *
 * The host then rejects that payload with "registerRemMenuItem html parameter:
 * Required". So the host wants an `html` field the SDK has no way to send, and
 * no argument passed to the public method can reach it. GitHub code search
 * finds zero callers of this method anywhere, which fits: it is not usable as
 * shipped.
 *
 * This talks to the host directly instead, replicating exactly what the SDK
 * does and adding the missing field. It reaches past the public API, so it is
 * treated as strictly best effort: if the internals move or the host wants
 * something else again, the item quietly does not appear and everything else
 * still works. The document menu below is the supported route and always
 * registers.
 */
async function registerRemContextMenu(plugin: ReactRNPlugin, id: string, name: string, action: () => Promise<void>) {
  const internals = plugin as unknown as {
    model?: Record<string, unknown>;
    app: { _call?: (method: string, args: Record<string, unknown>) => Promise<void> };
  };

  if (!internals.model || typeof internals.app?._call !== 'function') {
    throw new Error('SDK internals not in the expected shape');
  }

  // The action is looked up by id out of this map when the item is clicked;
  // it never crosses the wire.
  internals.model[id] = action;

  await internals.app._call('registerRemMenuItem', {
    id,
    name,
    // Best guess at the field's meaning: the rendered label. Kept to an inline
    // stopwatch and the word, so that if it IS interpreted as markup the item
    // reads "Laps" with the timer icon, and if it is escaped and shown as text
    // the worst case is a visible tag rather than a broken menu.
    html: `<span style="display:inline-flex;align-items:center;gap:6px">${stopwatchSVG('currentColor', 16)}<span>${name}</span></span>`,
  });
}

/**
 * Rewrite the host stylesheet that lifts the pill into the document title row.
 *
 * This lives in the index plugin because RemNote allows `registerCSS` from
 * nowhere else: calling it from the document widget is refused outright with
 * "You can only register CSS from the index widget". The index plugin has no
 * DOM of its own, so the width comes from the widget over session storage.
 *
 * Re-registering the same id replaces the sheet and an empty string clears it,
 * so switching away from inline placement tidies up after itself.
 */
async function applyHostCSS(plugin: ReactRNPlugin): Promise<void> {
  const options = await readOptions(plugin);
  const offset = (await plugin.storage.getLocal<PillOffset | null>(STORAGE_KEYS.position)) ?? undefined;
  // The width argument is vestigial: the lifted slot is a fixed width now. See
  // the note on LIFTED_WIDTH for why measuring it did not work.
  await plugin.app.registerCSS('laps-inline-placement', hostCSS(options.pillAlign as Placement, 0, offset ?? undefined));
}

async function onActivate(plugin: ReactRNPlugin) {
  try {
    await registerSettings(plugin);

    // Placement follows both the setting and the pill's measured width, and the
    // width changes mid-run when the lap chip appears.
    await optional(plugin, 'the inline placement stylesheet', () => applyHostCSS(plugin));

    plugin.event.addListener(AppEvents.SettingChanged, SETTING_IDS.pillAlign, () => {
      void applyHostCSS(plugin);
    });
    // Fires continuously while the user drags the stopwatch around.
    plugin.event.addListener(AppEvents.StorageLocalChange, STORAGE_KEYS.position, () => {
      void applyHostCSS(plugin);
    });

    // Both stopwatch surfaces are registered unconditionally and each hides
    // itself according to the placement setting. Registering conditionally
    // would mean a reload every time the user changed that setting.
    await plugin.app.registerWidget('document_timer', WidgetLocation.DocumentBelowTitle, {
      dimensions: { height: 'auto', width: '100%' },
    });

    await plugin.app.registerWidget('topbar_timer', WidgetLocation.TopBar, {
      dimensions: { height: 'auto', width: 'auto' },
    });

    await plugin.app.registerWidget('laps_stats', WidgetLocation.RightSidebar, {
      // `height` only accepts a number or 'auto', unlike `width`.
      dimensions: { height: 'auto', width: '100%' },
      widgetTabTitle: 'Laps',
      widgetTabIcon: stopwatchIconUrl(),
    });

    // The right click menu on any Rem. Best effort: see the note on
    // registerRemContextMenu for why the public API cannot do this.
    await optional(plugin, 'the Rem right click menu', () =>
      registerRemContextMenu(plugin, 'laps-open-stats-rem', 'Laps', async () => {
        await openStats(plugin, await currentRemId(plugin));
      }),
    );

    // The document "..." menu. This is the supported route, and unlike the rem
    // menu its action receives the Rem id directly rather than relying on
    // focus, so it is the reliable one when the two disagree.
    await optional(plugin, 'the document menu', () =>
      plugin.app.registerMenuItem({
        id: 'laps-open-stats-document',
        name: 'Laps',
        location: PluginCommandMenuLocation.DocumentMenu,
        iconUrl: stopwatchIconUrl(),
        action: async (args: { remId?: string }) => {
          await openStats(plugin, args?.remId ?? (await currentRemId(plugin)));
        },
      }),
    );

    // Goals get their own entry rather than being buried a click deeper. The
    // stats page is where you read progress; this is where you set the target.
    await optional(plugin, 'the goal menu item', () =>
      plugin.app.registerMenuItem({
        id: 'laps-set-goal-document',
        name: 'Laps goal',
        location: PluginCommandMenuLocation.DocumentMenu,
        iconUrl: flagIconUrl(),
        action: async (args: { remId?: string }) => {
          await openStats(plugin, args?.remId ?? (await currentRemId(plugin)), true);
        },
      }),
    );

    await plugin.app.registerCommand({
      id: 'laps-open-stats',
      name: 'Laps: Show lap times and charts',
      description: 'Open the Laps stats page for the current item',
      keywords: 'laps stopwatch timer chart stats',
      action: async () => {
        await openStats(plugin, await currentRemId(plugin));
      },
    });

    await plugin.app.registerCommand({
      id: 'laps-open-stats-all',
      name: 'Laps: Show everything',
      description: 'Open the Laps stats page across the whole knowledge base',
      keywords: 'laps stopwatch timer chart stats all',
      action: async () => {
        await openStats(plugin, undefined);
      },
    });

    // Diagnostics. Commands live in the omnibar, not in the settings panel,
    // which is where people look for them, so both are named to be findable by
    // typing "laps".
    await plugin.app.registerCommand({
      id: 'laps-set-goal',
      name: 'Laps: Set a goal for this item',
      description: 'Target a time, a number of laps, or both, for this item and everything below it',
      keywords: 'laps goal target flag',
      action: async () => {
        await openStats(plugin, await currentRemId(plugin), true);
      },
    });

    await plugin.app.registerCommand({
      id: 'laps-reset-position',
      name: 'Laps: Reset the stopwatch position',
      description: 'Undo a drag and put the stopwatch back where the placement setting says',
      keywords: 'laps position reset move drag',
      action: async () => {
        await plugin.storage.setLocal(STORAGE_KEYS.position, null);
        await applyHostCSS(plugin);
        await plugin.app.toast('Laps: stopwatch position reset.');
      },
    });

    await plugin.app.registerCommand({
      id: 'laps-show-settings',
      name: 'Laps: Show current settings',
      description: 'Toast the settings actually in effect',
      keywords: 'laps debug settings',
      action: async () => {
        const options = await readOptions(plugin);
        await plugin.app.toast(
          `Laps: accent ${options.accent}, best ${options.best}, worst ${options.worst}, ` +
            `${options.intensity}, ${options.showMs ? 'ms on' : 'ms off'}, chip shows ${options.chipShows}, ` +
            `placement ${options.timerPlacement}/${options.pillAlign}`,
        );
      },
    });

    await plugin.app.registerCommand({
      id: 'laps-copy-debug',
      name: 'Laps: Copy debug info',
      description: 'Put a full report on the clipboard for a bug report',
      keywords: 'laps debug report',
      action: async () => {
        const options = await readOptions(plugin);
        const data = await loadData(plugin);
        const running = await loadRunning(plugin);
        const sessions = sessionList(data);
        const rollup = buildRollup(sessions);

        const report = JSON.stringify(
          {
            options,
            sessionCount: sessions.length,
            lapCount: sessions.reduce((sum, session) => sum + session.laps.length, 0),
            totalMs: rollup.totalMs,
            running: running ? { name: running.name, startedAt: running.startedAt, laps: running.laps.length } : null,
            topLevel: Object.values(rollup.children).map((node) => ({ name: node.name, totalMs: node.totalMs })),
          },
          null,
          2,
        );

        try {
          // Often unavailable in the sandboxed iframe, so say which of the two
          // routes actually happened rather than claiming success either way.
          await navigator.clipboard.writeText(report);
          await plugin.app.toast('Laps: debug info copied to the clipboard.');
        } catch {
          console.log('[Laps] debug report\n' + report);
          await plugin.app.toast('Laps: clipboard unavailable, report written to the developer console.');
        }
      },
    });

    await plugin.app.registerCommand({
      id: 'laps-total-here',
      name: 'Laps: Total time on this item',
      description: 'Toast the rolled up total for the current item and everything below it',
      keywords: 'laps total time',
      action: async () => {
        const remId = await currentRemId(plugin);
        if (!remId) {
          await plugin.app.toast('Laps: nothing is selected.');
          return;
        }
        const rollup = buildRollup(sessionList(await loadData(plugin)));
        const node = findNode(rollup, remId);
        const resolved = await resolvePath(plugin, remId);
        if (!node) {
          await plugin.app.toast(`Laps: nothing recorded under "${resolved?.name ?? 'that item'}" yet.`);
          return;
        }
        await plugin.app.toast(
          `Laps: ${formatCoarse(node.totalMs)} under "${node.name}" across ${node.totalLaps} lap` +
            `${node.totalLaps === 1 ? '' : 's'} (${formatCoarse(node.selfMs)} on the item itself).`,
        );
      },
    });
  } catch (error) {
    // A throw here otherwise leaves the plugin loaded but inert, with nothing
    // in the UI to explain why the stopwatch never appeared.
    console.error('[Laps] onActivate failed', error);
    await plugin.app.toast(`Laps failed to start: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
