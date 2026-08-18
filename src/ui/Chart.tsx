import * as React from 'react';

import { niceCeiling } from '../lib/chartdata.ts';
import type { DayPoint, LapPoint } from '../lib/chartdata.ts';
import { formatCoarse, formatDate, formatHMS, formatTimeOfDay } from '../lib/format.ts';

const VIEW_W = 820;
const VIEW_H = 280;
const PAD_LEFT = 58;
const PAD_RIGHT = 14;
const PAD_TOP = 16;
const PAD_BOTTOM = 34;

const PLOT_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM;

export type ChartMode = 'daily' | 'laps';

export interface ChartProps {
  mode: ChartMode;
  days: DayPoint[];
  laps: LapPoint[];
  /** Called when a day bar is clicked, so the chart can drive the date filter. */
  onPickDay?: (day: DayPoint) => void;
}

interface Hover {
  /** Pixel position inside the wrapper, for placing the tooltip. */
  left: number;
  top: number;
  lines: string[];
  markerX: number;
}

/**
 * The chart.
 *
 * Hand drawn SVG rather than a charting library: the whole thing is two series
 * and a tooltip, and a library would be a megabyte of bundle plus a second
 * theming system to keep in step with RemNote's light and dark palettes. Colour
 * comes entirely from the CSS custom properties in `paletteCSS`, so the user's
 * shade settings reach it without this file knowing they exist.
 */
export function Chart({ mode, days, laps, onPickDay }: ChartProps): JSX.Element {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = React.useState<Hover | undefined>();

  const values = mode === 'daily' ? days.map((d) => d.ms) : laps.map((l) => l.ms);
  const yMax = niceCeiling(Math.max(1, ...values));

  const toY = (ms: number) => PAD_TOP + PLOT_H - (ms / yMax) * PLOT_H;

  // The x scale differs by mode: bars are evenly spaced slots, laps are placed
  // on a real time axis so a burst of laps in one afternoon clusters the way it
  // actually happened.
  const timeFrom = laps.length > 0 ? laps[0].at : 0;
  const timeTo = laps.length > 0 ? laps[laps.length - 1].at : 1;
  const timeSpan = Math.max(1, timeTo - timeFrom);
  const lapX = (at: number) => PAD_LEFT + ((at - timeFrom) / timeSpan) * PLOT_W;

  const slotWidth = days.length > 0 ? PLOT_W / days.length : PLOT_W;
  const barWidth = Math.max(1.5, Math.min(28, slotWidth * 0.68));
  const dayX = (index: number) => PAD_LEFT + slotWidth * (index + 0.5);

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  /** Map a pointer event to wrapper-relative pixels and to SVG user units. */
  const readPointer = (event: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return undefined;
    // The SVG scales to the container, so pixels and user units are not the
    // same thing. Everything drawn is in user units; the tooltip is positioned
    // in pixels.
    const scale = VIEW_W / rect.width;
    return {
      pixelX: event.clientX - rect.left,
      pixelY: event.clientY - rect.top,
      userX: (event.clientX - rect.left) * scale,
      scale,
    };
  };

  const handleMove = (event: React.MouseEvent) => {
    const pointer = readPointer(event);
    if (!pointer) return;

    if (mode === 'daily') {
      if (days.length === 0) return setHover(undefined);
      const index = Math.min(days.length - 1, Math.max(0, Math.floor((pointer.userX - PAD_LEFT) / slotWidth)));
      const point = days[index];
      setHover({
        left: dayX(index) / pointer.scale,
        top: toY(point.ms) / pointer.scale,
        markerX: dayX(index),
        lines: [
          formatDate(point.day),
          `${formatCoarse(point.ms)} over ${point.laps} lap${point.laps === 1 ? '' : 's'}`,
        ],
      });
      return;
    }

    if (laps.length === 0) return setHover(undefined);
    let nearest = laps[0];
    let nearestDistance = Infinity;
    for (const lap of laps) {
      const distance = Math.abs(lapX(lap.at) - pointer.userX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = lap;
      }
    }
    setHover({
      left: lapX(nearest.at) / pointer.scale,
      top: toY(nearest.ms) / pointer.scale,
      markerX: lapX(nearest.at),
      lines: [
        `Lap ${nearest.index} - ${formatHMS(nearest.ms, false)}`,
        `${nearest.sessionName}`,
        `${formatDate(nearest.at)} ${formatTimeOfDay(nearest.at)}`,
      ],
    });
  };

  const handleClick = (event: React.MouseEvent) => {
    if (mode !== 'daily' || !onPickDay || days.length === 0) return;
    const pointer = readPointer(event);
    if (!pointer) return;
    const index = Math.min(days.length - 1, Math.max(0, Math.floor((pointer.userX - PAD_LEFT) / slotWidth)));
    onPickDay(days[index]);
  };

  // Six or so x labels regardless of range, so a year of bars does not turn the
  // axis into a black smear.
  const xLabelStep = Math.max(1, Math.ceil(days.length / 6));

  const linePath = laps
    .map((lap, index) => `${index === 0 ? 'M' : 'L'}${lapX(lap.at).toFixed(1)} ${toY(lap.ms).toFixed(1)}`)
    .join(' ');

  const areaPath =
    laps.length > 1
      ? `${linePath} L${lapX(laps[laps.length - 1].at).toFixed(1)} ${PAD_TOP + PLOT_H} L${lapX(laps[0].at).toFixed(1)} ${PAD_TOP + PLOT_H} Z`
      : '';

  const bestMs = laps.length > 0 ? Math.min(...laps.map((l) => l.ms)) : 0;
  const worstMs = laps.length > 0 ? Math.max(...laps.map((l) => l.ms)) : 0;

  return (
    <div className="laps-chart-wrap">
      <svg
        ref={svgRef}
        className="laps-chart"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        style={{ width: '100%', height: 'auto' }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(undefined)}
        onClick={handleClick}
        role="img"
        aria-label={mode === 'daily' ? 'Time recorded per day' : 'Lap times over time'}
      >
        {gridLines.map((fraction) => {
          const y = PAD_TOP + PLOT_H * (1 - fraction);
          return (
            <g key={fraction}>
              <line className="laps-chart__grid" x1={PAD_LEFT} y1={y} x2={VIEW_W - PAD_RIGHT} y2={y} />
              <text className="laps-chart__label" x={PAD_LEFT - 8} y={y + 3} textAnchor="end">
                {formatCoarse(yMax * fraction)}
              </text>
            </g>
          );
        })}

        <line className="laps-chart__axis" x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={PAD_TOP + PLOT_H} />
        <line
          className="laps-chart__axis"
          x1={PAD_LEFT}
          y1={PAD_TOP + PLOT_H}
          x2={VIEW_W - PAD_RIGHT}
          y2={PAD_TOP + PLOT_H}
        />

        {mode === 'daily'
          ? days.map((point, index) => {
              const y = toY(point.ms);
              return (
                <rect
                  key={point.day}
                  className="laps-chart__bar"
                  x={dayX(index) - barWidth / 2}
                  y={y}
                  width={barWidth}
                  // A day with a tiny total should still show as a mark rather
                  // than vanish into the axis line.
                  height={Math.max(point.ms > 0 ? 1.5 : 0, PAD_TOP + PLOT_H - y)}
                  rx={Math.min(3, barWidth / 2)}
                />
              );
            })
          : null}

        {mode === 'laps' && laps.length > 1 ? <path className="laps-chart__area" d={areaPath} /> : null}
        {mode === 'laps' && laps.length > 1 ? <path className="laps-chart__line" d={linePath} /> : null}
        {mode === 'laps'
          ? laps.map((lap) => (
              <circle
                key={lap.lapId}
                className={`laps-chart__dot${lap.ms === bestMs ? ' laps-chart__dot--best' : lap.ms === worstMs ? ' laps-chart__dot--worst' : ''}`}
                cx={lapX(lap.at)}
                cy={toY(lap.ms)}
                r={laps.length > 200 ? 1.6 : 3}
              />
            ))
          : null}

        {mode === 'daily'
          ? days.map((point, index) =>
              index % xLabelStep === 0 ? (
                <text
                  key={`label-${point.day}`}
                  className="laps-chart__label"
                  x={dayX(index)}
                  y={PAD_TOP + PLOT_H + 16}
                  textAnchor="middle"
                >
                  {formatDate(point.day).slice(5)}
                </text>
              ) : null,
            )
          : [0, 0.5, 1].map((fraction) => (
              <text
                key={`label-${fraction}`}
                className="laps-chart__label"
                x={PAD_LEFT + PLOT_W * fraction}
                y={PAD_TOP + PLOT_H + 16}
                textAnchor={fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'}
              >
                {laps.length > 0 ? formatDate(timeFrom + timeSpan * fraction) : ''}
              </text>
            ))}

        {hover ? (
          <line className="laps-chart__cursor" x1={hover.markerX} y1={PAD_TOP} x2={hover.markerX} y2={PAD_TOP + PLOT_H} />
        ) : null}
      </svg>

      {hover ? (
        <div
          className="laps-tooltip rn-clr-background-primary rn-clr-content-primary"
          style={{
            // Nudged up and clamped so the box never hangs off the left edge of
            // the popup, where it would be clipped away entirely.
            left: Math.max(0, Math.min(hover.left + 10, 1000)),
            top: Math.max(0, hover.top - 12),
          }}
        >
          {hover.lines.map((line, index) => (
            <div key={index} style={index === 0 ? { fontWeight: 600 } : { opacity: 0.75 }}>
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
