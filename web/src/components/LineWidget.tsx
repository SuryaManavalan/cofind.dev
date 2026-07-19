import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, TrendingUp } from "lucide-react";
import type { LineDto, TrackSummary } from "../types";
import { api } from "../api";
import { useFeed } from "../feed-context";
import { cn } from "@/lib/utils";
import { burst, fireworks } from "@/lib/juice";
import { useSlotNumber } from "@/lib/useSlotNumber";
import { Button } from "@/components/ui/button";

// The Line (ADR-023) on a track page: live price, sparkline, and the trade
// panel. Prices roll like slot reels; fills burst; settlements detonate.

const SPENDS = [10, 25, 50, 100];

function Sparkline({ history, resolved }: { history: { p: number; t: number }[]; resolved: boolean }) {
  if (history.length < 2) return null;
  const w = 220;
  const h = 36;
  // normalize to the data range (padded) so every move is visible
  const lo = Math.min(...history.map((d) => d.p));
  const hi = Math.max(...history.map((d) => d.p));
  const pad = Math.max((hi - lo) * 0.2, 0.02);
  const y = (p: number) => h - ((p - lo + pad) / (hi - lo + pad * 2)) * h;
  const pts = history.map((d, i) => [(i / (history.length - 1)) * w, y(d.p)] as const);
  const line = pts.map(([x, py]) => `${x},${py.toFixed(1)}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  const stroke = resolved ? "#10b981" : "var(--brand)";
  const last = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" preserveAspectRatio="none">
      <polygon points={area} fill={stroke} opacity="0.08" />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.6" strokeOpacity="0.9" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={stroke}>
        {!resolved && <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />}
      </circle>
    </svg>
  );
}

export default function LineWidget({ track, onChanged }: { track: TrackSummary; onChanged: () => void }) {
  const { me } = useFeed();
  const [line, setLine] = useState<LineDto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [spend, setSpend] = useState(25);
  const [preview, setPreview] = useState<{ shares: number; price_after: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [targetDate, setTargetDate] = useState("");
  const priceRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { line } = await api.trackLine(track.id);
    setLine(line);
    setLoaded(true);
  }, [track.id]);

  useEffect(() => {
    load();
  }, [load]);

  // settlement celebration — once per market, per browser
  useEffect(() => {
    if (!line?.resolved_at || !line.my.payout) return;
    const key = `cofind-settled-${line.id}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    fireworks(line.my.payout > 100 ? 1.5 : 1);
  }, [line]);

  useEffect(() => {
    if (!line || line.resolved_at || line.insider) return;
    const t = setTimeout(() => {
      api.marketQuote(line.id, side, spend).then((q) => setPreview({ shares: q.shares, price_after: q.price_after })).catch(() => {});
    }, 150);
    return () => clearTimeout(t);
  }, [line, side, spend]);

  const pct = useSlotNumber((line?.price_yes ?? 0) * 100, { duration: 700 });

  async function doTrade(e: React.MouseEvent) {
    if (!line || busy) return;
    setBusy(true);
    try {
      const r = await api.marketTrade(line.id, side, "buy", spend);
      burst(e.clientX, e.clientY, 18);
      setLine({ ...line, ...r.market });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function sellAll(sellSide: "yes" | "no", shares: number, e: React.MouseEvent) {
    if (!line || busy) return;
    setBusy(true);
    try {
      const r = await api.marketTrade(line.id, sellSide, "sell", shares);
      burst(e.clientX, e.clientY, 10);
      setLine({ ...line, ...r.market });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function open() {
    const t = Date.parse(targetDate);
    if (Number.isNaN(t)) return;
    await api.openLine(track.slug, t);
    await load();
    onChanged();
  }

  if (!loaded) return null;

  // no line yet: the owner (or a contributor on communal) can open one
  if (!line) {
    const canOpen =
      !track.shipped_at && (track.owner ? track.owner.handle.toLowerCase() === me.handle.toLowerCase() : track.contributors.some((c) => c.handle === me.handle));
    if (!canOpen) return null;
    return (
      <div className="border-b px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="size-3.5 text-brand" /> Open the line — declare a ship target and let the room price your odds
          </span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="h-7 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
          />
          <Button size="sm" variant="outline" className="h-7" onClick={open} disabled={!targetDate}>
            Open line
          </Button>
        </div>
      </div>
    );
  }

  const daysLeft = Math.max(0, Math.ceil((line.target_at - Date.now()) / 86400000));
  const settled = !!line.resolved_at;

  return (
    <div className="border-b px-4 py-3 sm:px-6">
      <div className="flex items-center gap-4">
        <div ref={priceRef} className="shrink-0 text-center">
          <div
            className={cn(
              "text-3xl font-bold tabular-nums tracking-tight",
              settled ? (line.outcome === "yes" ? "text-emerald-500" : "text-destructive") : "text-foreground",
            )}
          >
            {settled ? (line.outcome === "yes" ? "YES" : "NO") : `${pct}%`}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {settled ? "settled" : "the room says ships"}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-xs font-medium text-foreground">{line.question}</span>
            {!settled && (
              <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                <CalendarClock className="size-3" /> {daysLeft}d left
              </span>
            )}
          </div>
          <Sparkline history={line.history} resolved={settled} />
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{line.volume} conviction traded</span>
            <span>·</span>
            <span>{line.trader_count} traders</span>
            {line.move_24h !== 0 && (
              <span className={line.move_24h > 0 ? "text-emerald-500" : "text-destructive"}>
                {line.move_24h > 0 ? "▲" : "▼"} {(Math.abs(line.move_24h) * 100).toFixed(0)} today
              </span>
            )}
          </div>
        </div>
      </div>

      {settled ? (
        line.my.payout ? (
          <p className="mt-2 text-xs font-medium text-emerald-500">🎆 Your position paid out +{line.my.payout} conviction</p>
        ) : null
      ) : line.insider ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          This is your line — you can settle it, so you can't trade it. Post stops to move your price; ship to close it.
        </p>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <div className="flex overflow-hidden rounded-full border">
            {(["yes", "no"] as const).map((sd) => (
              <button
                key={sd}
                onClick={() => setSide(sd)}
                className={cn(
                  "px-3 py-1 text-[11px] font-bold uppercase transition-colors",
                  side === sd ? (sd === "yes" ? "bg-emerald-500 text-white" : "bg-destructive text-white") : "text-muted-foreground",
                )}
              >
                {sd}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-full border">
            {SPENDS.map((v) => (
              <button
                key={v}
                onClick={() => setSpend(v)}
                className={cn("px-2.5 py-1 text-[11px] tabular-nums transition-colors", spend === v ? "bg-secondary text-foreground" : "text-muted-foreground")}
              >
                {v}
              </button>
            ))}
          </div>
          <Button size="sm" className="h-7 rounded-full" onClick={doTrade} disabled={busy}>
            Stake {spend}
          </Button>
          {preview && (
            <span className="text-[10px] text-muted-foreground">
              → pays {Math.round(preview.shares * 10)} if {side.toUpperCase()} · line moves to {(preview.price_after * 100).toFixed(0)}%
            </span>
          )}
        </div>
      )}

      {(line.my.yes_shares > 0.01 || line.my.no_shares > 0.01) && !settled && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Your position:</span>
          {line.my.yes_shares > 0.01 && (
            <button onClick={(e) => sellAll("yes", line.my.yes_shares, e)} className="rounded-full border border-emerald-500/30 px-2 py-0.5 text-emerald-500 hover:bg-emerald-500/10" title="Sell back">
              {line.my.yes_shares.toFixed(1)} YES ✕
            </button>
          )}
          {line.my.no_shares > 0.01 && (
            <button onClick={(e) => sellAll("no", line.my.no_shares, e)} className="rounded-full border border-destructive/30 px-2 py-0.5 text-destructive hover:bg-destructive/10" title="Sell back">
              {line.my.no_shares.toFixed(1)} NO ✕
            </button>
          )}
          <span>· {line.my.cost_basis} staked</span>
        </div>
      )}

      {line.book.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          {line.book.map((b) => (
            <span key={b.handle}>
              @{b.handle}: {b.yes_shares > 0.01 && <span className="text-emerald-500">{b.yes_shares.toFixed(0)}Y</span>}
              {b.yes_shares > 0.01 && b.no_shares > 0.01 && "/"}
              {b.no_shares > 0.01 && <span className="text-destructive">{b.no_shares.toFixed(0)}N</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
