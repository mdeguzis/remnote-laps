/**
 * The stopwatch mark, as a standalone SVG.
 *
 * Menu icons are handed to RemNote as a URL, and an SVG behind a `data:` URI is
 * a separate document: it cannot read `currentColor` or any of the app's custom
 * properties. So this one is drawn in a mid tone chosen to hold up on both a
 * light and a dark ground rather than inheriting anything. The in-widget
 * stopwatch is a real React component and does inherit colour; the two are kept
 * visually in step by hand.
 */
const NEUTRAL = '#7c8798';

/**
 * Every shape carries its own `fill`, rather than relying on `fill="none"` on
 * the root.
 *
 * The logo generator inlines this drawing into a larger SVG by stripping the
 * outer tag, which silently takes any presentation attribute on it with it. A
 * circle that inherited its transparency that way came out filled solid black.
 */
export function stopwatchSVG(color: string = NEUTRAL, size = 100): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" fill="none">
  <rect x="43" y="2" width="14" height="9" rx="3" fill="${color}"/>
  <rect x="72" y="14" width="10" height="7" rx="3" transform="rotate(42 77 17)" fill="${color}"/>
  <circle cx="50" cy="54" r="38" fill="none" stroke="${color}" stroke-width="6"/>
  <line x1="50" y1="20" x2="50" y2="27" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
  <line x1="84" y1="54" x2="77" y2="54" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
  <line x1="50" y1="88" x2="50" y2="81" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
  <line x1="16" y1="54" x2="23" y2="54" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
  <line x1="50" y1="54" x2="66" y2="38" stroke="${color}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="50" cy="54" r="5" fill="${color}"/>
</svg>`;
}

/**
 * The same mark as a `data:` URI.
 *
 * Percent-encoded rather than base64: it stays readable in a diff, and it
 * avoids depending on `btoa`, which is not guaranteed in every sandbox the
 * index plugin runs in.
 */
export function stopwatchDataUri(color?: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stopwatchSVG(color))}`;
}

/**
 * An absolute URL to the stopwatch, served from the plugin's own files.
 *
 * RemNote's menus would not render `stopwatchDataUri()` and fell back to the
 * generic plugin icon, so a `data:` URI is not accepted there. A real file is,
 * but the path has to be absolute, and the plugin's origin differs between the
 * dev server and an installed build.
 *
 * The index widget runs at `<origin>/index.html?widgetName=index`, so resolving
 * against its own location gives the right absolute URL in both cases without
 * anything being hardcoded.
 */
export function stopwatchIconUrl(): string {
  if (typeof window === 'undefined') return 'stopwatch.svg';
  try {
    return new URL('stopwatch.svg', window.location.href).href;
  } catch {
    return 'stopwatch.svg';
  }
}

/**
 * The checkered flag, for the goal menu item.
 *
 * Same absolute-URL trick as the stopwatch: menus refuse a `data:` URI and fall
 * back to the generic plugin icon.
 */
export function flagIconUrl(): string {
  if (typeof window === 'undefined') return 'flag.svg';
  try {
    return new URL('flag.svg', window.location.href).href;
  } catch {
    return 'flag.svg';
  }
}

/** The checkered flag as standalone SVG, for the generated icon file. */
export function flagSVG(color: string = NEUTRAL, size = 24): string {
  const squares: string[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      if ((row + col) % 2 === 0) continue;
      squares.push(`<rect x="${6 + col * 5}" y="${2 + row * 4}" width="5" height="4" fill="${color}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 28 28" fill="none">
  <rect x="2" y="1" width="2.6" height="26" rx="1.2" fill="${color}"/>
  <rect x="6" y="2" width="20" height="12" fill="${color}" opacity="0.22"/>
  ${squares.join('\n  ')}
</svg>`;
}
