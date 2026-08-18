import * as React from 'react';
import { AppEvents, useAPIEventListener, usePlugin, useTrackerPlugin } from '@remnote/plugin-sdk';

import { DEFAULT_OPTIONS, paletteCSS, readOptions } from '../lib/settings.ts';
import type { Options } from '../lib/settings.ts';
import { BASE_CSS } from './css.ts';

/**
 * The current settings, re-read whenever the user changes one.
 *
 * `useTrackerPlugin` subscribes to whatever the function touches, so a settings
 * change repaints the widget with no reload. Falls back to the shipped defaults
 * while the first read is in flight, which is a frame or two.
 */
export function useOptions(): Options {
  const options = useTrackerPlugin(async (plugin) => readOptions(plugin), []);
  return options ?? DEFAULT_OPTIONS;
}

/**
 * Whether RemNote is in dark mode.
 *
 * RemNote injects its stylesheet and the `dark` class into widget iframes, so
 * CSS alone handles nearly everything. This exists for the parts that cannot
 * be expressed as a descendant selector, and as a belt-and-braces fallback:
 * `setDarkMode` is a real listenable event, so if the class ever fails to
 * arrive the widget still knows.
 */
export function useDarkMode(): boolean {
  const [dark, setDark] = React.useState<boolean>(() => detectDark());

  useAPIEventListener(AppEvents.setDarkMode, undefined, (payload: { darkMode?: boolean }) => {
    if (typeof payload?.darkMode === 'boolean') setDark(payload.darkMode);
  });

  // The event only fires on a CHANGE, so the class has to be read once at mount
  // to learn the state the widget opened in.
  React.useEffect(() => setDark(detectDark()), []);

  return dark;
}

function detectDark(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark') || !!document.querySelector('.dark');
}

/**
 * A clock that ticks while `active`.
 *
 * 50ms is fast enough that tenths look continuous and slow enough that the
 * widget is idle most of the time. Nothing here drives the stopwatch hands;
 * those are a CSS animation. This only moves the digits.
 */
export function useNow(active: boolean, intervalMs = 50): number {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    // Take one reading even when stopped, so a widget that mounts after the
    // timer was paused shows the right frozen value instead of a stale one.
    setNow(Date.now());
    if (!active) return;
    const handle = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(handle);
  }, [active, intervalMs]);

  return now;
}

/**
 * The stylesheet for a widget: the static rules plus the palette from settings.
 *
 * Returned as an element rather than injected into `document.head` so React
 * owns its lifetime. Two widgets in two iframes each get their own copy, which
 * is the point: they are separate documents.
 */
export function LapsStyle({ options }: { options: Options }): JSX.Element {
  return <style dangerouslySetInnerHTML={{ __html: BASE_CSS + paletteCSS(options) }} />;
}

/** Convenience: the plugin handle, typed. */
export function useLapsPlugin() {
  return usePlugin();
}
