import {
  DEFAULT_ACCENT,
  DEFAULT_BEST,
  DEFAULT_INTENSITY,
  DEFAULT_WORST,
  INTENSITIES,
  SHADES,
  findIntensity,
  findShade,
  scaleAlpha,
} from './palette.ts';

export const SETTING_IDS = {
  useDefaults: 'laps-use-defaults',
  accent: 'laps-accent-shade',
  best: 'laps-best-shade',
  worst: 'laps-worst-shade',
  intensity: 'laps-shade-intensity',
  highlightExtremes: 'laps-highlight-extremes',
  timerPlacement: 'laps-timer-placement',
  // Versioned id, deliberately. RemNote only applies `defaultValue` the first
  // time it sees a setting, so changing the default of `laps-pill-align` from
  // "center" to "inline" would never reach anyone who had already loaded the
  // plugin once. A new id is the only way to move an existing install's default.
  // Bumped again: the default moved from "inline" to "under" after the title
  // row turned out to be too cramped to share. Same reason as the v2 bump,
  // RemNote only honours `defaultValue` the first time it sees an id.
  pillAlign: 'laps-pill-align-v3',
  showMs: 'laps-show-ms',
  chipShows: 'laps-chip-shows',
} as const;

export const CHIP_MODES = [
  { key: 'lap', label: 'Time on the current lap', value: 'lap' },
  { key: 'total', label: 'Total elapsed since start', value: 'total' },
];

export const PLACEMENTS = [
  { key: 'document', label: 'In the document, under the title', value: 'document' },
  { key: 'topbar', label: 'In the top bar', value: 'topbar' },
  { key: 'both', label: 'Both', value: 'both' },
];

export const ALIGNMENTS = [
  // 'under' keeps its stored value but now means "level with the title". The
  // meaning was changed rather than a new value added, because RemNote only
  // applies `defaultValue` the first time it sees a setting id, so a new value
  // would never reach anyone who already had this one stored.
  { key: 'under', label: 'Level with the document title, on the right', value: 'under' },
  { key: 'center', label: 'Its own row below the title, centred', value: 'center' },
  { key: 'left', label: 'Its own row below the title, left', value: 'left' },
  { key: 'right', label: 'Its own row below the title, right', value: 'right' },
];

export interface Options {
  accent: string;
  best: string;
  worst: string;
  intensity: string;
  highlightExtremes: boolean;
  timerPlacement: string;
  pillAlign: string;
  showMs: boolean;
  chipShows: string;
}

export const DEFAULT_OPTIONS: Options = {
  accent: DEFAULT_ACCENT,
  best: DEFAULT_BEST,
  worst: DEFAULT_WORST,
  intensity: DEFAULT_INTENSITY,
  highlightExtremes: true,
  timerPlacement: 'document',
  pillAlign: 'under',
  showMs: false,
  chipShows: 'lap',
};

/**
 * Register every setting.
 *
 * `useDefaults` is registered first on purpose so it lands at the top of the
 * panel. RemNote gives a plugin no way to WRITE a setting, so a real "reset"
 * button is impossible; a flag that makes the reader ignore stored values is
 * the workable substitute, and ignoring rather than erasing means turning it
 * back off returns the user's own choices.
 */
export async function registerSettings(plugin: {
  settings: {
    registerBooleanSetting: (s: any) => Promise<void>;
    registerDropdownSetting: (s: any) => Promise<void>;
  };
}): Promise<void> {
  await plugin.settings.registerBooleanSetting({
    id: SETTING_IDS.useDefaults,
    title: 'Use default colours',
    description: 'Ignore the choices below and use the shipped palette. Turn it back off to get your own settings back.',
    defaultValue: false,
  });

  const shadeOptions = SHADES.map((shade) => ({ key: shade.key, label: shade.label, value: shade.key }));

  await plugin.settings.registerDropdownSetting({
    id: SETTING_IDS.accent,
    title: 'Accent shade',
    description: 'The running stopwatch, the chart line and the primary buttons.',
    defaultValue: DEFAULT_ACCENT,
    options: shadeOptions,
  });

  await plugin.settings.registerDropdownSetting({
    id: SETTING_IDS.best,
    title: 'Fastest lap shade',
    description: 'Highlight colour for the quickest lap in a session.',
    defaultValue: DEFAULT_BEST,
    options: shadeOptions,
  });

  await plugin.settings.registerDropdownSetting({
    id: SETTING_IDS.worst,
    title: 'Slowest lap shade',
    description: 'Highlight colour for the slowest lap in a session.',
    defaultValue: DEFAULT_WORST,
    options: shadeOptions,
  });

  await plugin.settings.registerDropdownSetting({
    id: SETTING_IDS.intensity,
    title: 'Shade intensity',
    description: 'How strongly the row highlights and chart fills are painted.',
    defaultValue: DEFAULT_INTENSITY,
    options: INTENSITIES.map((i) => ({ key: i.key, label: i.label, value: i.key })),
  });

  await plugin.settings.registerBooleanSetting({
    id: SETTING_IDS.highlightExtremes,
    title: 'Highlight fastest and slowest laps',
    defaultValue: true,
  });

  await plugin.settings.registerDropdownSetting({
    id: SETTING_IDS.timerPlacement,
    title: 'Where to show the stopwatch',
    defaultValue: 'document',
    options: PLACEMENTS,
  });

  await plugin.settings.registerDropdownSetting({
    id: SETTING_IDS.pillAlign,
    title: 'Stopwatch placement in the document',
    description: 'Level with the title keeps it out of the document body. The row options give it a line of its own underneath.',
    defaultValue: 'under',
    options: ALIGNMENTS,
  });

  await plugin.settings.registerBooleanSetting({
    id: SETTING_IDS.showMs,
    title: 'Show milliseconds',
    description: 'Adds thousandths to the running lap chip. Recorded lap times always keep full precision either way.',
    defaultValue: false,
  });

  await plugin.settings.registerDropdownSetting({
    id: SETTING_IDS.chipShows,
    title: 'The lap chip counts',
    defaultValue: 'lap',
    options: CHIP_MODES,
  });
}

/**
 * Read every setting through ONE function.
 *
 * Both the widgets and the diagnostic commands go through here. Two readers
 * that each pick their own defaults eventually disagree about what is in
 * effect, and that gap is exactly where the confusing bugs live.
 */
export async function readOptions(plugin: {
  settings: { getSetting: <T>(id: string) => Promise<T> };
}): Promise<Options> {
  const useDefaults = await plugin.settings.getSetting<boolean>(SETTING_IDS.useDefaults);
  if (useDefaults) return { ...DEFAULT_OPTIONS };

  const read = async <T>(id: string, fallback: T): Promise<T> => {
    const value = await plugin.settings.getSetting<T>(id);
    return value === undefined || value === null ? fallback : value;
  };

  return {
    accent: await read(SETTING_IDS.accent, DEFAULT_OPTIONS.accent),
    best: await read(SETTING_IDS.best, DEFAULT_OPTIONS.best),
    worst: await read(SETTING_IDS.worst, DEFAULT_OPTIONS.worst),
    intensity: await read(SETTING_IDS.intensity, DEFAULT_OPTIONS.intensity),
    highlightExtremes: await read(SETTING_IDS.highlightExtremes, DEFAULT_OPTIONS.highlightExtremes),
    timerPlacement: await read(SETTING_IDS.timerPlacement, DEFAULT_OPTIONS.timerPlacement),
    pillAlign: await read(SETTING_IDS.pillAlign, DEFAULT_OPTIONS.pillAlign),
    showMs: await read(SETTING_IDS.showMs, DEFAULT_OPTIONS.showMs),
    chipShows: await read(SETTING_IDS.chipShows, DEFAULT_OPTIONS.chipShows),
  };
}

/**
 * Emit the palette as CSS custom properties for both modes.
 *
 * Light values go on `:root` and dark values follow on selectors that also
 * match the root, so ordering alone would settle it; `:root.dark` is spelled
 * out as well in case RemNote hangs the class lower down the widget document.
 * A `.laps-dark` escape hatch is included for the JS fallback in `useDarkMode`.
 */
export function paletteCSS(options: Options): string {
  const multiplier = findIntensity(options.intensity);
  const accent = findShade(options.accent, DEFAULT_ACCENT);
  const best = findShade(options.best, DEFAULT_BEST);
  const worst = findShade(options.worst, DEFAULT_WORST);

  const block = (mode: 'light' | 'dark') => `
    --laps-accent: ${accent[mode].accent};
    --laps-accent-soft: ${scaleAlpha(accent[mode].soft, multiplier)};
    --laps-accent-on: ${accent[mode].on};
    --laps-best: ${best[mode].accent};
    --laps-best-soft: ${scaleAlpha(best[mode].soft, multiplier)};
    --laps-worst: ${worst[mode].accent};
    --laps-worst-soft: ${scaleAlpha(worst[mode].soft, multiplier)};
  `;

  return `
:root { ${block('light')} }
.dark, :root.dark, .laps-dark { ${block('dark')} }
`;
}
