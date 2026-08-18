/**
 * Colour shades.
 *
 * Every shade carries its own light and dark pair rather than being derived by
 * lightening or darkening one value. A single hue run through a generic
 * transform lands somewhere different in each mode: amber goes muddy on a dark
 * ground, and the deep blues lose all separation on a light one. Two authored
 * pairs cost a few hex values and remove the whole problem.
 *
 * `on` is the text colour to use ON the accent, and it is authored too, because
 * "white on the accent" is wrong for amber in both modes.
 */

export interface ShadeVariant {
  /** The solid colour. Hands, chart line, active pill border. */
  accent: string;
  /** The same colour as a wash, for row highlights and chart fills. */
  soft: string;
  /** Text drawn on top of `accent`. */
  on: string;
}

export interface Shade {
  key: string;
  label: string;
  light: ShadeVariant;
  dark: ShadeVariant;
}

export const SHADES: Shade[] = [
  {
    key: 'graphite',
    label: 'Graphite',
    light: { accent: '#3f4756', soft: 'rgba(63, 71, 86, 0.10)', on: '#ffffff' },
    dark: { accent: '#a9b4c6', soft: 'rgba(169, 180, 198, 0.16)', on: '#171a20' },
  },
  {
    key: 'blue',
    label: 'Blue',
    light: { accent: '#2563eb', soft: 'rgba(37, 99, 235, 0.12)', on: '#ffffff' },
    dark: { accent: '#7aa5ff', soft: 'rgba(122, 165, 255, 0.18)', on: '#0d1526' },
  },
  {
    key: 'indigo',
    label: 'Indigo',
    light: { accent: '#4f46e5', soft: 'rgba(79, 70, 229, 0.12)', on: '#ffffff' },
    dark: { accent: '#9b93ff', soft: 'rgba(155, 147, 255, 0.18)', on: '#141133' },
  },
  {
    key: 'violet',
    label: 'Violet',
    light: { accent: '#7c3aed', soft: 'rgba(124, 58, 237, 0.12)', on: '#ffffff' },
    dark: { accent: '#c0a2ff', soft: 'rgba(192, 162, 255, 0.18)', on: '#1c1233' },
  },
  {
    key: 'teal',
    label: 'Teal',
    light: { accent: '#0d9488', soft: 'rgba(13, 148, 136, 0.14)', on: '#ffffff' },
    dark: { accent: '#5fd6c6', soft: 'rgba(95, 214, 198, 0.18)', on: '#05201d' },
  },
  {
    key: 'emerald',
    label: 'Emerald',
    light: { accent: '#059669', soft: 'rgba(5, 150, 105, 0.14)', on: '#ffffff' },
    dark: { accent: '#5fd39b', soft: 'rgba(95, 211, 155, 0.18)', on: '#052117' },
  },
  {
    key: 'amber',
    label: 'Amber',
    light: { accent: '#d97706', soft: 'rgba(217, 119, 6, 0.16)', on: '#241300' },
    dark: { accent: '#f2b955', soft: 'rgba(242, 185, 85, 0.20)', on: '#241300' },
  },
  {
    key: 'orange',
    label: 'Orange',
    light: { accent: '#ea580c', soft: 'rgba(234, 88, 12, 0.14)', on: '#ffffff' },
    dark: { accent: '#ff9a63', soft: 'rgba(255, 154, 99, 0.18)', on: '#2b1005' },
  },
  {
    key: 'rose',
    label: 'Rose',
    light: { accent: '#e11d48', soft: 'rgba(225, 29, 72, 0.12)', on: '#ffffff' },
    dark: { accent: '#ff8098', soft: 'rgba(255, 128, 152, 0.18)', on: '#2c0711' },
  },
  {
    key: 'crimson',
    label: 'Crimson',
    light: { accent: '#b91c1c', soft: 'rgba(185, 28, 28, 0.12)', on: '#ffffff' },
    dark: { accent: '#ff8a80', soft: 'rgba(255, 138, 128, 0.18)', on: '#2a0808' },
  },
];

export const DEFAULT_ACCENT = 'blue';
export const DEFAULT_BEST = 'emerald';
export const DEFAULT_WORST = 'crimson';

export function findShade(key: string | undefined, fallback: string): Shade {
  return SHADES.find((shade) => shade.key === key) ?? SHADES.find((shade) => shade.key === fallback) ?? SHADES[0];
}

/**
 * How strongly the soft washes are painted.
 *
 * A multiplier on alpha rather than a second set of colours: the hue is the
 * user's choice, the weight is a separate one, and mixing the two into ten more
 * shades makes the dropdown unusable.
 */
export const INTENSITIES = [
  { key: 'soft', label: 'Soft', multiplier: 0.55 },
  { key: 'normal', label: 'Normal', multiplier: 1 },
  { key: 'vivid', label: 'Vivid', multiplier: 1.7 },
];

export const DEFAULT_INTENSITY = 'normal';

export function findIntensity(key: string | undefined): number {
  return (INTENSITIES.find((i) => i.key === key) ?? INTENSITIES[1]).multiplier;
}

/**
 * Rescale the alpha of an `rgba(...)` string.
 *
 * Only handles the rgba form this file authors, and returns the input
 * unchanged for anything else, so a hand-edited colour degrades to "not
 * scaled" rather than to "invalid CSS and no colour at all".
 */
export function scaleAlpha(rgba: string, multiplier: number): string {
  const match = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(rgba);
  if (!match) return rgba;
  const [, r, g, b, a] = match;
  const alpha = Math.min(1, Math.max(0, Number(a) * multiplier));
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}
