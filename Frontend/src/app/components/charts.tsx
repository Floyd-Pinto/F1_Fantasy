import { useEffect, useRef, useState, type ReactNode } from "react";

/*
 * Small dependency-free SVG charts.
 * Categorical palette: validated for this app's dark surface (#18181b) — all six checks pass.
 * Slots are assigned in fixed order to entities (never by rank) and never cycled.
 */
export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"];
export const MAX_SERIES = SERIES_COLORS.length;

const INK = { primary: "#f4f4f5", secondary: "#a1a1aa", muted: "#71717a", grid: "#27272a", surface: "#18181b" };
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

// "Nice" upper bound and ~4 gridlines.
function niceTicks(max: number, min = 0) {
  const span = Math.max(1, max - min);
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { lo, hi, ticks };
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x + 12, 0), width - 190);
  return (
    <div
      className="absolute pointer-events-none z-10 min-w-40 rounded-lg border border-zinc-700 bg-zinc-950/95 px-3 py-2 text-xs shadow-xl"
      style={{ left, top: Math.max(0, y - 10) }}
    >
      {children}
    </div>
  );
}

function ChartFrame({ title, table, children }: { title: string; table: ReactNode; children: ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-zinc-400 font-bold">{title}</div>
        <button onClick={() => setShowTable(!showTable)} className="text-xs text-zinc-500 hover:text-zinc-200">
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {showTable ? <div className="overflow-x-auto max-h-80">{table}</div> : children}
    </div>
  );
}

export type LineSeries = { id: string | number; name: string; values: number[]; color: string; emphasis?: boolean };

/** Multi-series line chart with crosshair tooltip, legend, and direct end labels (≤4 series). */
export function LineChart({
  title,
  categories,
  series,
  height = 260,
  format = (v: number) => String(v),
  zeroBased = true,
}: {
  title: string;
  categories: string[];
  series: LineSeries[];
  height?: number;
  format?: (v: number) => string;
  zeroBased?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const directLabels = series.length <= 4;
  const right = directLabels ? 96 : PAD.right;

  const all = series.flatMap((s) => s.values);
  const dataMax = Math.max(1, ...all);
  const dataMin = zeroBased ? 0 : Math.min(...all);
  const { lo, hi, ticks } = niceTicks(dataMax, dataMin);
  const innerW = width - PAD.left - right;
  const innerH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (categories.length <= 1 ? innerW / 2 : (i / (categories.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - lo) / (hi - lo || 1)) * innerH;
  const labelEvery = Math.ceil(categories.length / Math.max(2, Math.floor(innerW / 44)));

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const i = categories.length <= 1 ? 0 : Math.round((px / box.width) * (categories.length - 1));
    setHover(Math.max(0, Math.min(categories.length - 1, i)));
  };

  const table = (
    <table className="w-full text-xs text-left">
      <thead>
        <tr className="text-zinc-400 border-b border-zinc-800">
          <th className="py-1 pr-3">Race</th>
          {series.map((s) => (
            <th key={s.id} className="py-1 pr-3">{s.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {categories.map((c, i) => (
          <tr key={c} className="border-b border-zinc-800/50 text-zinc-300">
            <td className="py-1 pr-3">{c}</td>
            {series.map((s) => (
              <td key={s.id} className="py-1 pr-3 font-mono">{format(s.values[i])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame title={title} table={table}>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-zinc-300">
          {series.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded" style={{ background: s.color, height: 2 }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div ref={ref} className="relative w-full">
        <svg width={width} height={height} role="img" aria-label={title}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - right} y1={y(t)} y2={y(t)} stroke={INK.grid} strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={INK.muted}>
                {format(t)}
              </text>
            </g>
          ))}
          {categories.map((c, i) =>
            i % labelEvery === 0 || i === categories.length - 1 ? (
              <text key={c} x={x(i)} y={height - 8} textAnchor="middle" fontSize={10} fill={INK.muted}>
                {c}
              </text>
            ) : null
          )}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke={INK.secondary} strokeDasharray="3 3" />}
          {series.map((s) => (
            <polyline
              key={s.id}
              fill="none"
              stroke={s.color}
              strokeWidth={s.emphasis ? 3 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            />
          ))}
          {categories.length === 1 &&
            series.map((s) => <circle key={s.id} cx={x(0)} cy={y(s.values[0])} r={4} fill={s.color} stroke={INK.surface} strokeWidth={2} />)}
          {hover !== null &&
            series.map((s) => <circle key={s.id} cx={x(hover)} cy={y(s.values[hover])} r={4.5} fill={s.color} stroke={INK.surface} strokeWidth={2} />)}
          {directLabels &&
            series.map((s) => (
              <text key={s.id} x={x(categories.length - 1) + 8} y={y(s.values.at(-1) ?? 0)} dy="0.32em" fontSize={11} fill={INK.secondary}>
                {s.name.length > 11 ? `${s.name.slice(0, 10)}…` : s.name}
              </text>
            ))}
          <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
        {hover !== null && (
          <Tooltip x={x(hover)} y={PAD.top} width={width}>
            <div className="text-zinc-400 mb-1">{categories[hover]}</div>
            {[...series]
              .sort((a, b) => b.values[hover] - a.values[hover])
              .map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-zinc-300">
                    <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </span>
                  <span className="font-mono text-zinc-100">{format(s.values[hover])}</span>
                </div>
              ))}
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}

/** Single-series bar chart (one color, no legend) with per-bar hover tooltip. */
export function BarChart({
  title,
  categories,
  values,
  details,
  color = SERIES_COLORS[0],
  height = 220,
}: {
  title: string;
  categories: string[];
  values: number[];
  details?: (i: number) => ReactNode;
  color?: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const { hi, ticks } = niceTicks(Math.max(1, ...values));
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(1, categories.length);
  const barW = Math.max(4, Math.min(28, slot - 2)); // ≥2px gap between bars
  const y = (v: number) => PAD.top + innerH - (v / (hi || 1)) * innerH;
  const labelEvery = Math.ceil(categories.length / Math.max(2, Math.floor(innerW / 36)));

  const table = (
    <table className="w-full text-xs text-left">
      <tbody>
        {categories.map((c, i) => (
          <tr key={c} className="border-b border-zinc-800/50 text-zinc-300">
            <td className="py-1 pr-3">{c}</td>
            <td className="py-1 font-mono">{values[i]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame title={title} table={table}>
      <div ref={ref} className="relative w-full">
        <svg width={width} height={height} role="img" aria-label={title}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={INK.grid} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={INK.muted}>
                {t}
              </text>
            </g>
          ))}
          {values.map((v, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const h = Math.max(0, PAD.top + innerH - y(v));
            const r = Math.min(4, barW / 2, h);
            const x0 = cx - barW / 2;
            const top = PAD.top + innerH - h;
            // Rounded data-end, square baseline.
            const d = h > 0
              ? `M${x0},${PAD.top + innerH} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${PAD.top + innerH} Z`
              : "";
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={innerH} fill="transparent" />
                {d && <path d={d} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />}
                {(i % labelEvery === 0 || i === categories.length - 1) && (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize={10} fill={INK.muted}>
                    {categories[i]}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} stroke={INK.muted} />
        </svg>
        {hover !== null && (
          <Tooltip x={PAD.left + slot * hover + slot / 2} y={y(values[hover]) - 30} width={width}>
            <div className="text-zinc-400 mb-1">{categories[hover]}</div>
            <div className="font-mono text-zinc-100 text-sm">{values[hover]} pts</div>
            {details?.(hover)}
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}
