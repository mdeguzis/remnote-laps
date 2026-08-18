import * as React from 'react';

export interface StopwatchProps {
  size?: number;
  /** Hands sweep while true, freeze in place while false. */
  running: boolean;
  /**
   * Elapsed milliseconds AT THE MOMENT `running` last changed.
   *
   * Not the live elapsed time. The hands are carried by a CSS animation that
   * keeps real time on its own once started, so this value is only needed to
   * decide where the animation picks up. Feeding the live figure in here would
   * rewrite `animation-delay` on every frame, and rewriting that property
   * restarts the animation, which pins both hands at twelve.
   */
  anchorElapsedMs: number;
  title?: string;
}

/**
 * Below this the dial detail turns to mud, so the small rendering drops the
 * minute subdial and the minor ticks and keeps the silhouette. The pill icon
 * sits at 18px, where a sixty tick face reads as a grey smudge.
 */
const DETAIL_THRESHOLD = 28;

const CENTER_X = 50;
const CENTER_Y = 54;

/**
 * The stopwatch face.
 *
 * The hands are CSS animations rather than React state: a second hand that
 * completes one revolution per minute is exactly a 60s linear animation, and
 * the browser keeps that smooth without re-rendering anything. Syncing it to
 * real elapsed time uses a NEGATIVE `animation-delay`, which starts an
 * animation partway through rather than postponing it, so a stopwatch reopened
 * ninety seconds into a run picks the hand up at the half minute mark.
 *
 * Memoised because the parent re-renders about twenty times a second to move
 * the digits, and none of that needs to reach the SVG.
 */
export const Stopwatch = React.memo(function Stopwatch({ size = 18, running, anchorElapsedMs, title }: StopwatchProps) {
  const detailed = size >= DETAIL_THRESHOLD;
  const seconds = anchorElapsedMs / 1000;

  const handStyle = (offsetSeconds: number): React.CSSProperties => ({
    animationDelay: `${(-offsetSeconds).toFixed(2)}s`,
    animationPlayState: running ? 'running' : 'paused',
  });

  const tickCount = detailed ? 60 : 12;
  const tickStep = 360 / tickCount;

  return (
    <svg
      className={`laps-watch${running ? ' laps-watch--running' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={title ?? (running ? 'Stopwatch running' : 'Stopwatch')}
    >
      {title ? <title>{title}</title> : null}

      {/* Crown and side button, so the shape reads as a stopwatch rather than a
          clock even at the size where the dial detail is gone. */}
      <rect className="laps-watch__crown" x="43" y="2" width="14" height="9" rx="3" />
      <rect className="laps-watch__crown" x="72" y="14" width="10" height="7" rx="3" transform="rotate(42 77 17)" />

      <circle className="laps-watch__case" cx={CENTER_X} cy={CENTER_Y} r="38" />

      {Array.from({ length: tickCount }, (_, tick) => {
        const major = detailed ? tick % 5 === 0 : true;
        const angle = (tick * tickStep * Math.PI) / 180;
        const outer = 34;
        const inner = major ? 27 : 30;
        return (
          <line
            key={tick}
            className={`laps-watch__tick${major ? ' laps-watch__tick--major' : ''}`}
            x1={CENTER_X + Math.sin(angle) * inner}
            y1={CENTER_Y - Math.cos(angle) * inner}
            x2={CENTER_X + Math.sin(angle) * outer}
            y2={CENTER_Y - Math.cos(angle) * outer}
          />
        );
      })}

      {/* Minute subdial. One revolution an hour, so a long session still shows
          progress on a face whose main hand has looped dozens of times. */}
      {detailed ? (
        <>
          <circle className="laps-watch__subdial" cx={CENTER_X} cy="34" r="10" />
          <g className="laps-watch__minute" style={handStyle(seconds % 3600)}>
            <line className="laps-watch__hand" x1={CENTER_X} y1="34" x2={CENTER_X} y2="26" strokeWidth="3" />
          </g>
          <circle className="laps-watch__pin" cx={CENTER_X} cy="34" r="1.8" />
        </>
      ) : null}

      <g className="laps-watch__second" style={handStyle(seconds % 60)}>
        <line
          className="laps-watch__hand"
          x1={CENTER_X}
          y1={CENTER_Y + 8}
          x2={CENTER_X}
          y2={detailed ? 24 : 22}
          strokeWidth={detailed ? 3.5 : 5}
        />
      </g>

      <circle className="laps-watch__pin" cx={CENTER_X} cy={CENTER_Y} r={detailed ? 3.5 : 5} />
    </svg>
  );
});
