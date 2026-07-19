import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Coins, TrendingUp } from "lucide-react";
import type { FloorMarket, TapeEvent, Wallet } from "../types";
import { api } from "../api";
import { cn, timeAgo } from "@/lib/utils";
import { burst } from "@/lib/juice";
import { useSlotNumber } from "@/lib/useSlotNumber";
import PullToRefresh from "../components/PullToRefresh";

// The Floor (ADR-023), Kalshi-browse style: a live ticker tape of every
// trade, the wallet, and market cards with mini charts and dual-price
// YES/NO buttons. Conviction is minted by building; here it's staked.

const REASON_LABELS: Record<string, string> = {
  welcome: "joined the room",
  daily: "showed up today",
  stop: "posted a stop",
  post: "posted",
  reaction: "got a reaction",
  ship: "shipped a track",
  settle: "line settled — payout",
  void: "shipper's stake refunded",
  trade_buy: "staked the line",
  trade_sell: "sold back",
};

// Infinite scrolling tape of recent trades — the room's pulse, doubled for a
// seamless loop, pauses on hover.
function Tape({ events }: { events: TapeEvent[] }) {
  if (events.length === 0) return null;
  const items = [...events, ...events];
  return (
    <div className="overflow-hidden border-b bg-secondary/30">
      <div className="tape-track flex w-max items-center gap-6 px-4 py-1.5">
        {items.map((e, i) => (
          <span key={i} className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn("size-1.5 rounded-full", e.side === "yes" ? "bg-emerald-500" : "bg-destructive")} />
            <b className="font-medium text-foreground">@{e.handle}</b>
            {e.action === "buy" ? "staked" : "sold"} {Math.abs(e.cost)} {e.side.toUpperCase()} on
            <span className="font-medium text-brand">#{e.slug}</span>
            <span className="tabular-nums">→ {Math.round(e.p * 100)}%</span>
            <span className="opacity-60">{timeAgo(e.t)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Balance-over-time: step chart of the ledger, adaptive domain, crosshair.
function CapitalChart({ history }: { history: { t: number; v: number }[] }) {
  const [hover, setHover] = useState<{ x: number; idx: number } | null>(null);
  const W = 600;
  const H = 84;
  const pts = history.length > 0 ? [...history, { t: Date.now(), v: history[history.length - 1]!.v }] : [];
  if (pts.length < 2) return null;
  const t0 = pts[0]!.t;
  const span = Math.max(pts[pts.length - 1]!.t - t0, 1);
  const vs = pts.map((d) => d.v);
  const lo = Math.min(...vs, 0);
  const hi = Math.max(...vs) * 1.08 + 1;
  const x = (t: number) => ((t - t0) / span) * W;
  const y = (v: number) => 4 + (1 - (v - lo) / (hi - lo)) * (H - 8);
  let d = `M ${x(pts[0]!.t).toFixed(1)} ${y(pts[0]!.v).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` H ${x(pts[i]!.t).toFixed(1)} V ${y(pts[i]!.v).toFixed(1)}`;
  const hoverPt = hover ? pts[hover.idx] : null;
  function locate(clientX: number, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    let idx = 0;
    for (let i = 0; i < pts.length; i++) if (x(pts[i]!.t) <= px) idx = i;
    setHover({ x: Math.max(0, Math.min(px, W)), idx });
  }
  return (
    <div
      data-no-swipe
      className="relative mt-2 select-none text-foreground"
      style={{ touchAction: "pan-y" }}
      onMouseMove={(e) => locate(e.clientX, e.currentTarget)}
      onMouseLeave={() => setHover(null)}
      onTouchStart={(e) => e.touches[0] && locate(e.touches[0].clientX, e.currentTarget)}
      onTouchMove={(e) => e.touches[0] && locate(e.touches[0].clientX, e.currentTarget)}
      onTouchEnd={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="capg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={`${d} L ${W} ${H} L 0 ${H} Z`} fill="url(#capg)" />
        <path d={d} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" pathLength={1} className="chart-draw" />
        <circle cx={W} cy={y(pts[pts.length - 1]!.v)} r="3" fill="var(--brand)">
          <animate attributeName="opacity" values="1;0.35;1" dur="1.8s" repeatCount="indefinite" />
        </circle>
        {hover && hoverPt && (
          <line x1={hover.x} x2={hover.x} y1="0" y2={H} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="3 3" />
        )}
      </svg>
      {hover && hoverPt && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border bg-popover px-2 py-0.5 text-center shadow-md"
          style={{ left: `${(hover.x / W) * 100}%` }}
        >
          <div className="text-xs font-bold tabular-nums text-brand">{hoverPt.v}</div>
          <div className="text-[9px] text-muted-foreground">{timeAgo(hoverPt.t)}</div>
        </div>
      )}
    </div>
  );
}

function WalletCard({ wallet }: { wallet: Wallet }) {
  const port = useSlotNumber(wallet.portfolio, { duration: 900 });
  return (
    <div className="border-b px-4 py-4 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tabular-nums tracking-tight text-brand">{port}</span>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">portfolio</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>
              <b className="tabular-nums text-foreground">{wallet.balance}</b> liquid
            </span>
            <span>
              <b className="tabular-nums text-foreground">{wallet.at_stake}</b> at stake
            </span>
            <span>
              <b className="tabular-nums text-emerald-500">{wallet.earned_total}</b> minted all-time
            </span>
          </div>
        </div>
        <Coins className="hidden size-8 text-brand/40 sm:block" />
      </div>
      <CapitalChart history={wallet.history} />
      {wallet.recent.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          {wallet.recent.slice(0, 6).map((r, i) => (
            <span key={i} className="whitespace-nowrap">
              <span className={r.delta > 0 ? "font-medium text-emerald-500" : "font-medium text-destructive"}>
                {r.delta > 0 ? "+" : ""}
                {r.delta}
              </span>{" "}
              {REASON_LABELS[r.reason] ?? r.reason} · {timeAgo(r.created_at)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniChart({ spark, settled, outcome }: { spark: number[]; settled: boolean; outcome: "yes" | "no" | null }) {
  const w = 120;
  const h = 34;
  const pts = spark.length > 1 ? spark : [0.5, 0.5];
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const pad = Math.max((hi - lo) * 0.25, 0.03);
  const yOf = (p: number) => h - ((p - lo + pad) / (hi - lo + pad * 2)) * (h - 4) - 2;
  const line = pts.map((p, i) => `${((i / (pts.length - 1)) * w).toFixed(1)},${yOf(p).toFixed(1)}`).join(" ");
  const color = settled ? (outcome === "yes" ? "#10b981" : "#ef4444") : "var(--brand)";
  const lastY = yOf(pts[pts.length - 1]!);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full min-w-0" preserveAspectRatio="none">
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={color} opacity="0.1" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx={w} cy={lastY} r="2.5" fill={color}>
        {!settled && <animate attributeName="opacity" values="1;0.3;1" dur="1.8s" repeatCount="indefinite" />}
      </circle>
    </svg>
  );
}

function MarketCard({ m, onTraded }: { m: FloorMarket; onTraded: () => void }) {
  const [busy, setBusy] = useState(false);
  const pct = useSlotNumber(m.price_yes * 100, { duration: 700 });
  const settled = !!m.resolved_at;
  const daysLeft = Math.max(0, Math.ceil((m.target_at - Date.now()) / 86400000));
  const hasPosition = m.my.yes_shares > 0.01 || m.my.no_shares > 0.01;
  const yesPrice = Math.round(m.price_yes * 100);
  const move = Math.round(m.move_24h * 100);

  async function stake(side: "yes" | "no", e: React.MouseEvent) {
    e.preventDefault();
    if (busy || settled || m.insider) return;
    setBusy(true);
    try {
      await api.marketTrade(m.id, side, "buy", 25);
      burst(e.clientX, e.clientY, 18);
      onTraded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Link
      to={`/t/${m.track.slug}`}
      className={cn("block border-b px-4 py-3.5 transition-colors hover:bg-accent/40 sm:px-6", settled && "opacity-60")}
    >
      <div className="flex items-center gap-3.5">
        <div className="w-14 shrink-0 text-center">
          <div
            className={cn(
              "text-[26px] font-extrabold leading-none tabular-nums tracking-tight",
              settled ? (m.outcome === "yes" ? "text-emerald-500" : "text-destructive") : "text-foreground",
            )}
          >
            {settled ? (m.outcome === "yes" ? "YES" : "NO") : `${pct}%`}
          </div>
          {!settled && move !== 0 && (
            <div className={cn("mt-0.5 text-[10px] font-bold tabular-nums", move > 0 ? "text-emerald-500" : "text-destructive")}>
              {move > 0 ? "▲" : "▼"}{Math.abs(move)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{m.question}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-muted-foreground">
            {settled ? (
              <span>settled {timeAgo(m.resolved_at!)}</span>
            ) : (
              <span className="flex items-center gap-1">
                <CalendarClock className="size-3" /> {daysLeft}d
              </span>
            )}
            <span>{m.volume} vol</span>
            <span>{m.trader_count} traders</span>
            {hasPosition && (
              <span className="font-semibold text-brand">
                you: {m.my.yes_shares > 0.01 && `${m.my.yes_shares.toFixed(0)}Y`}
                {m.my.yes_shares > 0.01 && m.my.no_shares > 0.01 && "/"}
                {m.my.no_shares > 0.01 && `${m.my.no_shares.toFixed(0)}N`}
              </span>
            )}
            {m.insider && !settled && <span className="italic">your line</span>}
          </div>
        </div>
        <div className="hidden w-28 shrink-0 sm:block">
          <MiniChart spark={m.spark} settled={settled} outcome={m.outcome} />
        </div>
        {!settled && !m.insider && (
          <div className="flex shrink-0 flex-col gap-1">
            <button
              onClick={(e) => stake("yes", e)}
              disabled={busy}
              className="rounded-lg border border-emerald-500/40 px-2.5 py-1 text-[10px] font-extrabold tabular-nums text-emerald-500 transition-all hover:bg-emerald-500/15 active:scale-95"
            >
              YES {yesPrice}¢
            </button>
            <button
              onClick={(e) => stake("no", e)}
              disabled={busy}
              className="rounded-lg border border-destructive/40 px-2.5 py-1 text-[10px] font-extrabold tabular-nums text-destructive transition-all hover:bg-destructive/15 active:scale-95"
            >
              NO {100 - yesPrice}¢
            </button>
          </div>
        )}
      </div>
      <div className="mt-2 sm:hidden">
        <MiniChart spark={m.spark} settled={settled} outcome={m.outcome} />
      </div>
    </Link>
  );
}

export default function FloorView() {
  const [markets, setMarkets] = useState<FloorMarket[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [tape, setTape] = useState<TapeEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [r, a] = await Promise.all([api.markets(), api.marketsActivity().catch(() => ({ activity: [] }))]);
    setMarkets(r.markets);
    setWallet(r.wallet);
    setTape(a.activity);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 25000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <PullToRefresh onRefresh={load}>
      <Tape events={tape} />
      {wallet && <WalletCard wallet={wallet} />}
      {markets.map((m) => (
        <MarketCard key={m.id} m={m} onTraded={load} />
      ))}
      {loaded && markets.length === 0 && (
        <div className="px-6 py-16 text-center">
          <TrendingUp className="mx-auto size-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-foreground">No lines open yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Open a line from any track you're building — declare a ship date and let the room price your odds. Or ask your agent:
            "open a line on my track".
          </p>
        </div>
      )}
    </PullToRefresh>
  );
}
