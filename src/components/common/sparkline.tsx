import React, { useId } from "react";

interface SparklineProps {
  points: number[];
  trend?: "down" | "up" | "flat";
  width?: number;
  height?: number;
}

/**
 * Clean cubic-smoothed SVG sparkline with gradient wash and endpoint dot.
 */
export function Sparkline({
  points,
  trend = "flat",
  width = 92,
  height = 34,
}: SparklineProps) {
  const gradId = useId();

  if (!points || points.length < 2) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-end text-[13px] text-[var(--text-muted)] shrink-0"
        aria-hidden="true"
      >
        —
      </div>
    );
  }

  const padX = 4;
  const padY = 5;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const coords: Array<[number, number]> = points.map((val, idx) => {
    const x = padX + (idx / (points.length - 1)) * innerW;
    const y = padY + innerH - ((val - min) / range) * innerH;
    return [x, y];
  });

  let lineD = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`;
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1];
    const [x1, y1] = coords[i];
    const cx = ((x0 + x1) / 2).toFixed(1);
    lineD += ` C ${cx} ${y0.toFixed(1)}, ${cx} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }

  const last = coords[coords.length - 1];
  const first = coords[0];
  const areaD = `${lineD} L ${last[0].toFixed(1)} ${height} L ${first[0].toFixed(1)} ${height} Z`;

  const stroke =
    trend === "down"
      ? "var(--positive)"
      : trend === "up"
        ? "var(--negative)"
        : "var(--text-muted)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className="shrink-0 overflow-visible"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.2" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <path
        d={lineD}
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={last[0].toFixed(1)}
        cy={last[1].toFixed(1)}
        r="2.75"
        fill={stroke}
      />
    </svg>
  );
}
