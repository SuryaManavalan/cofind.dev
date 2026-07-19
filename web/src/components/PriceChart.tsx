import { useMemo, useRef, useState } from "react";

// Kalshi-style probability chart, pure SVG. Step-after line (prices only move
// on trades — steps are honest), gradient area, 25/50/75 gridlines, magnetic
// crosshair with a price+time tooltip, animated draw-in, pulsing live dot.

export interface ChartPoint {
  t: number;
  p: number; // 0..1
}

function fmtTime(t: number, spanMs: number): string {
  const d = new Date(t);
  if (spanMs < 36 * 3600 * 1000) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PriceChart({
  points,
  settled,
  outcome,
  height = 150,
}: {
  points: ChartPoint[];
  settled: boolean;
  outcome: "yes" | "no" | null;
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; idx: number } | null>(null);

  const W = 600;
  const H = height;
  const PAD_T = 8;
  const PAD_B = 18;
  const plotH = H - PAD_T - PAD_B;

  const data = useMemo(() => {
    const pts = points.length > 0 ? points : [{ t: Date.now() - 1, p: 0.5 }];
    // extend the last price to "now" so the line always reaches the right edge
    const last = pts[pts.length - 1]!;
    const extended = settled ? pts : [...pts, { t: Date.now(), p: last.p }];
    const t0 = extended[0]!.t;
    const t1 = extended[extended.length - 1]!.t;
    const span = Math.max(t1 - t0, 1);
    // adaptive y-domain (Kalshi-style): zoom to the data, keep a minimum
    // span of 20 points so a quiet market doesn't look like an earthquake
    const ps = extended.map((d) => d.p);
    let lo = Math.min(...ps);
    let hi = Math.max(...ps);
    const mid = (lo + hi) / 2;
    const half = Math.max((hi - lo) * 0.65, 0.1);
    lo = Math.max(0, mid - half);
    hi = Math.min(1, mid + half);
    const x = (t: number) => ((t - t0) / span) * W;
    const y = (p: number) => PAD_T + (1 - (p - lo) / (hi - lo)) * plotH;
    // gridlines at nice 5-point steps inside the domain, max 3 lines
    const step = Math.max(5, Math.ceil(((hi - lo) * 100) / 3 / 5) * 5);
    const grid: number[] = [];
    for (let g = Math.ceil((lo * 100) / step) * step; g <= hi * 100 + 0.01; g += step) grid.push(g / 100);
    return { pts: extended, x, y, t0, t1, span, grid };
  }, [points, settled, plotH]);

  const { path, area } = useMemo(() => {
    const { pts, x, y } = data;
    let d = `M ${x(pts[0]!.t).toFixed(1)} ${y(pts[0]!.p).toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      // step-after: hold previous price until the trade lands
      d += ` H ${x(pts[i]!.t).toFixed(1)} V ${y(pts[i]!.p).toFixed(1)}`;
    }
    const lastX = x(pts[pts.length - 1]!.t).toFixed(1);
    return { path: d, area: `${d} L ${lastX} ${H - PAD_B} L ${x(pts[0]!.t).toFixed(1)} ${H - PAD_B} Z` };
  }, [data, H]);

  const color = settled ? (outcome === "yes" ? "#10b981" : "#ef4444") : "var(--brand)";
  const last = data.pts[data.pts.length - 1]!;
  const gid = useMemo(() => `pg${Math.floor(last.t % 100000)}`, [last.t]);

  function locate(clientX: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((clientX - rect.left) / rect.width) * W;
    // snap to the point whose step covers px (last point with x <= px)
    let idx = 0;
    for (let i = 0; i < data.pts.length; i++) if (data.x(data.pts[i]!.t) <= px) idx = i;
    setHover({ x: Math.max(0, Math.min(px, W)), idx });
  }

  const hoverPt = hover ? data.pts[hover.idx]! : null;

  return (
    <div
      ref={wrapRef}
      data-no-swipe
      className="relative w-full select-none"
      style={{ touchAction: "pan-y" }}
      onMouseMove={(e) => locate(e.clientX)}
      onMouseLeave={() => setHover(null)}
      onTouchStart={(e) => e.touches[0] && locate(e.touches[0].clientX)}
      onTouchMove={(e) => e.touches[0] && locate(e.touches[0].clientX)}
      onTouchEnd={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {data.grid.map((g) => (
          <g key={g}>
            <line
              x1="0"
              x2={W}
              y1={data.y(g)}
              y2={data.y(g)}
              stroke="currentColor"
              strokeOpacity={Math.abs(g - 0.5) < 0.001 ? 0.16 : 0.07}
              strokeDasharray={Math.abs(g - 0.5) < 0.001 ? "4 4" : undefined}
              strokeWidth="1"
            />
            <text x={W - 4} y={data.y(g) - 3} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.35">
              {Math.round(g * 100)}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#${gid})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" pathLength={1} className="chart-draw" />
        {/* live dot */}
        <circle cx={data.x(last.t)} cy={data.y(last.p)} r="3.5" fill={color}>
          {!settled && <animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite" />}
        </circle>
        {!settled && <circle cx={data.x(last.t)} cy={data.y(last.p)} r="8" fill={color} opacity="0.15" />}
        {/* crosshair */}
        {hover && hoverPt && (
          <g>
            <line x1={hover.x} x2={hover.x} y1={PAD_T} y2={H - PAD_B} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={data.x(hoverPt.t) <= hover.x ? hover.x : data.x(hoverPt.t)} cy={data.y(hoverPt.p)} r="4" fill={color} stroke="var(--background)" strokeWidth="1.5" />
          </g>
        )}
        {/* time labels */}
        <text x="2" y={H - 6} fontSize="9" fill="currentColor" opacity="0.4">
          {fmtTime(data.t0, data.span)}
        </text>
        <text x={W - 2} y={H - 6} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.4">
          {settled ? fmtTime(data.t1, data.span) : "now"}
        </text>
      </svg>
      {hover && hoverPt && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-center shadow-md"
          style={{ left: `${(hover.x / W) * 100}%` }}
        >
          <div className="text-sm font-bold tabular-nums leading-tight" style={{ color }}>
            {Math.round(hoverPt.p * 100)}%
          </div>
          <div className="text-[9px] text-muted-foreground">{fmtTime(hoverPt.t, data.span)}</div>
        </div>
      )}
    </div>
  );
}
