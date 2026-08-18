/**
 * Duration formatting and parsing.
 *
 * Parsing matters as much as formatting here: the lap editor hands the user a
 * text field pre-filled with whatever `formatDuration` produced, so anything
 * this module can print it must also be able to read back unchanged.
 */

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

function pad(value: number, width: number): string {
  return String(Math.floor(value)).padStart(width, '0');
}

/**
 * `4.062`, `1:04.062`, `2:01:04.062` - the hours field only appears when there
 * are hours, so short laps stay readable.
 */
export function formatDuration(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const hours = Math.floor(safe / MS_PER_HOUR);
  const minutes = Math.floor((safe % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((safe % MS_PER_MINUTE) / MS_PER_SECOND);
  const millis = safe % MS_PER_SECOND;

  const tail = `${pad(seconds, 2)}.${pad(millis, 3)}`;
  if (hours > 0) return `${hours}:${pad(minutes, 2)}:${tail}`;
  if (minutes > 0) return `${minutes}:${tail}`;
  return `${seconds}.${pad(millis, 3)}`;
}

/**
 * The readout on the pill. Tenths rather than thousandths, because the
 * thousandths digit at 20fps is noise that reads as a rendering fault.
 */
export function formatClock(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const hours = Math.floor(safe / MS_PER_HOUR);
  const minutes = Math.floor((safe % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((safe % MS_PER_MINUTE) / MS_PER_SECOND);
  const tenths = Math.floor((safe % MS_PER_SECOND) / 100);

  if (hours > 0) return `${hours}:${pad(minutes, 2)}:${pad(seconds, 2)}`;
  return `${pad(minutes, 2)}:${pad(seconds, 2)}.${tenths}`;
}

/**
 * The chip readout: always `h:mm:ss`, optionally with milliseconds.
 *
 * Unlike `formatClock` this never drops the hours field. The chip is a fixed
 * width two tone box sitting next to the stopwatch, and a readout that grows a
 * segment at the one hour mark would shove the layout sideways mid-run.
 */
export function formatHMS(ms: number, showMs: boolean): string {
  const safe = Math.max(0, Math.floor(ms));
  const hours = Math.floor(safe / MS_PER_HOUR);
  const minutes = Math.floor((safe % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((safe % MS_PER_MINUTE) / MS_PER_SECOND);
  const base = `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}`;
  return showMs ? `${base}.${pad(safe % MS_PER_SECOND, 3)}` : base;
}

/** Coarse duration for totals in the tree, where milliseconds are just noise. */
export function formatCoarse(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  if (safe < MS_PER_MINUTE) return `${(safe / MS_PER_SECOND).toFixed(1)}s`;
  if (safe < MS_PER_HOUR) return `${Math.floor(safe / MS_PER_MINUTE)}m ${pad((safe % MS_PER_MINUTE) / MS_PER_SECOND, 2)}s`;
  return `${Math.floor(safe / MS_PER_HOUR)}h ${pad((safe % MS_PER_HOUR) / MS_PER_MINUTE, 2)}m`;
}

/**
 * Read a duration back out of the edit field.
 *
 * Returns undefined rather than 0 for anything unparseable, so the caller can
 * refuse the edit instead of silently zeroing a lap the user meant to nudge.
 */
export function parseDuration(input: string): number | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  // Optional hours, optional minutes, then seconds with an optional fraction.
  const match = /^(?:(\d+):)?(?:(\d+):)?(\d+)(?:[.,](\d{1,3}))?$/.exec(trimmed);
  if (!match) return undefined;

  const [, a, b, secondsRaw, fractionRaw] = match;

  // With two colons the groups are hours:minutes:seconds. With one they are
  // minutes:seconds, and the regex fills the FIRST group, so shift it down.
  const hours = b === undefined ? 0 : Number(a ?? 0);
  const minutes = b === undefined ? Number(a ?? 0) : Number(b);
  const seconds = Number(secondsRaw);

  // ".5" is five hundred milliseconds, not five. Pad on the right.
  const millis = fractionRaw ? Number(fractionRaw.padEnd(3, '0')) : 0;

  // A field is only capped when something bigger sits to its left. Typing "60"
  // on its own means sixty seconds, not an error, and "90:00" means ninety
  // minutes. The cap exists to catch "1:75" where the 75 clearly cannot be
  // seconds, not to refuse a plain count.
  const hasMinutes = a !== undefined;
  const hasHours = b !== undefined;
  if (hasMinutes && seconds > 59) return undefined;
  if (hasHours && minutes > 59) return undefined;

  return hours * MS_PER_HOUR + minutes * MS_PER_MINUTE + seconds * MS_PER_SECOND + millis;
}

/** `YYYY-MM-DD` in LOCAL time, which is what an `<input type="date">` expects. */
export function toDateInput(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

/** Start of the local day named by a `YYYY-MM-DD` string. */
export function fromDateInputStart(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0).getTime();
}

/**
 * End of the local day named by a `YYYY-MM-DD` string.
 *
 * Inclusive, because a user who types the same date in both boxes means "that
 * day", not "an empty instant".
 */
export function fromDateInputEnd(value: string): number | undefined {
  const start = fromDateInputStart(value);
  if (start === undefined) return undefined;
  const d = new Date(start);
  d.setDate(d.getDate() + 1);
  return d.getTime() - 1;
}

/** Short human date for lap rows and chart ticks. */
export function formatDate(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

export function formatTimeOfDay(epochMs: number): string {
  const d = new Date(epochMs);
  return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
}
