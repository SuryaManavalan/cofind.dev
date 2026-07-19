import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, TrendingUp, Users } from "lucide-react";
import type { LineDto, TradeEvent, TrackSummary } from "../types";
import { api } from "../api";
import { useFeed } from "../feed-context";
import { cn, timeAgo } from "@/lib/utils";
import { burst, fireworks } from "@/lib/juice";
import { useSlotNumber } from "@/lib/useSlotNumber";
import { Button } from "@/components/ui/button";
import Avatar from "./Avatar";
import PriceChart from "./PriceChart";

// The Line, Kalshi-style (ADR-023): headline price with 24h delta, a real
// probability chart with crosshair, dual YES/NO price buttons, a trade ticket
// framed in payouts ("pays 93 if YES"), the room's positions, and an
// activity feed. Numbers roll; fills burst; settlements detonate.

const SPENDS = [10, 25, 50, 100];

export default function LineWidget({ track, onChanged }: { track: TrackSummary; onChanged: () => void }) {
  const { me } = useFeed();
  const [line, setLine] = useState<LineDto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [spend, setSpend] = useState(25);
  const [preview, setPreview] = useState<{ shares: number; price_after: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [targetDate, setTargetDate] = useState("");

  const load = useCallback(async () => {
    const { line } = await api.trackLine(track.id);
    setLine(line);
    setLoaded(true);
  }, [track.id]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 25000);
    return () => clearInterval(iv);
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

  const chartPoints = useMemo(() => {
    if (!line) return [];
    return [{ t: line.created_at, p: 0.5 }, ...line.history.map((h) => ({ t: h.t, p: h.p }))];
  }, [line]);

  async function doTrade(e: React.MouseEvent) {
    if (!line || busy) return;
    setBusy(true);
    try {
      await api.marketTrade(line.id, side, "buy", spend);
      burst(e.clientX, e.clientY, 20);
      setFlash(true);
      setTimeout(() => setFlash(false), 700);
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function sellAll(sellSide: "yes" | "no", shares: number, e: React.MouseEvent) {
    if (!line || busy) return;
    setBusy(true);
    try {
      await api.marketTrade(line.id, sellSide, "sell", shares);
      burst(e.clientX, e.clientY, 10);
      await load();
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

  // no line yet: whoever can settle can open it
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
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
          />
          <Button size="sm" variant="outline" className="h-8" onClick={open} disabled={!targetDate}>
            Open line
          </Button>
        </div>
      </div>
    );
  }

  const settled = !!line.resolved_at;
  const daysLeft = Math.max(0, Math.ceil((line.target_at - Date.now()) / 86400000));
  const won = line.outcome === "yes";
  const move = Math.round(line.move_24h * 100);
  const yesPrice = Math.round(line.price_yes * 100);
  const noPrice = 100 - yesPrice;
  const recentTrades = [...line.history].reverse().slice(0, 5);

  return (
    <div className="border-b bg-gradient-to-b from-brand/[0.03] to-transparent px-4 pb-3.5 pt-3 sm:px-6">
      {/* header: question + status */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold leading-snug">{line.question}</h2>
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted-foreground">
          {settled ? (
            <span className={cn("rounded-full px-2 py-0.5 font-bold", won ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>
              SETTLED {won ? "YES" : "NO"}
            </span>
          ) : (
            <>
              <CalendarClock className="size-3" /> {daysLeft}d left
            </>
          )}
        </span>
      </div>

      {/* headline price + 24h move */}
      <div className="mt-1 flex items-end gap-2.5">
        <span
          className={cn(
            "text-[44px] font-extrabold leading-none tracking-tight tabular-nums transition-colors",
            settled ? (won ? "text-success" : "text-destructive") : "text-foreground",
            flash && "text-brand",
          )}
        >
          {pct}%
        </span>
        <div className="pb-1 leading-tight">
          {move !== 0 && !settled && (
            <div className={cn("text-sm font-bold tabular-nums", move > 0 ? "text-success" : "text-destructive")}>
              {move > 0 ? "▲" : "▼"} {Math.abs(move)} today
            </div>
          )}
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">chance it ships</div>
        </div>
        <div className="ml-auto hidden gap-3 pb-1 text-right text-[10px] text-muted-foreground sm:flex">
          <span className="flex items-center gap-1"><TrendingUp className="size-3" /> {line.volume} vol</span>
          <span className="flex items-center gap-1"><Users className="size-3" /> {line.trader_count} traders</span>
        </div>
      </div>

      {/* the chart */}
      <div className="mt-2 text-foreground">
        <PriceChart points={chartPoints} settled={settled} outcome={line.outcome} height={150} />
      </div>

      {settled ? (
        line.my.payout ? (
          <p className="mt-2 text-sm font-semibold text-success">🎆 Your position paid out +{line.my.payout} conviction</p>
        ) : null
      ) : line.insider ? (
        <p className="mt-2 rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
          <b className="text-foreground">This is your line.</b> You can settle it, so you can't trade it — post stops to move your price, ship to close it.
        </p>
      ) : (
        <>
          {/* dual price buttons — Kalshi style */}
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {(
              [
                { sd: "yes" as const, label: "YES", price: yesPrice, on: "border-success bg-success/15 text-success", ring: "hover:border-success/50" },
                { sd: "no" as const, label: "NO", price: noPrice, on: "border-destructive bg-destructive/15 text-destructive", ring: "hover:border-destructive/50" },
              ]
            ).map((b) => (
              <button
                key={b.sd}
                onClick={() => setSide(b.sd)}
                className={cn(
                  "flex items-center justify-between rounded-xl border-2 px-3.5 py-2 transition-all active:scale-[0.98]",
                  side === b.sd ? b.on : cn("border-border text-muted-foreground", b.ring),
                )}
              >
                <span className="text-sm font-extrabold tracking-wide">{b.label}</span>
                <span className="text-lg font-bold tabular-nums">{b.price}¢</span>
              </button>
            ))}
          </div>

          {/* trade ticket */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-full border">
              {SPENDS.map((v) => (
                <button
                  key={v}
                  onClick={() => setSpend(v)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors",
                    spend === v ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              onClick={doTrade}
              disabled={busy}
              className={cn(
                "h-8 flex-1 rounded-full text-xs font-bold shadow-sm transition-transform active:scale-95 sm:flex-none sm:px-5",
                side === "yes" ? "bg-success text-white hover:bg-success/90" : "bg-destructive text-white hover:bg-destructive/90",
              )}
            >
              Stake {spend} on {side.toUpperCase()}
              {preview && <span className="ml-1.5 font-semibold opacity-80">→ pays {Math.round(preview.shares * 10)}</span>}
            </Button>
            {preview && (
              <span className="w-full text-[10px] text-muted-foreground sm:w-auto">
                line moves to {(preview.price_after * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </>
      )}

      {/* your position */}
      {(line.my.yes_shares > 0.01 || line.my.no_shares > 0.01) && !settled && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg bg-secondary/50 px-3 py-1.5 text-[11px]">
          <span className="font-semibold">Your position</span>
          {line.my.yes_shares > 0.01 && (
            <button
              onClick={(e) => sellAll("yes", line.my.yes_shares, e)}
              className="rounded-full border border-success/40 px-2 py-0.5 font-medium text-success transition-colors hover:bg-success/10"
              title="Sell back to the market"
            >
              {line.my.yes_shares.toFixed(1)} YES · pays {Math.round(line.my.yes_shares * 10)} ✕
            </button>
          )}
          {line.my.no_shares > 0.01 && (
            <button
              onClick={(e) => sellAll("no", line.my.no_shares, e)}
              className="rounded-full border border-destructive/40 px-2 py-0.5 font-medium text-destructive transition-colors hover:bg-destructive/10"
              title="Sell back to the market"
            >
              {line.my.no_shares.toFixed(1)} NO · pays {Math.round(line.my.no_shares * 10)} ✕
            </button>
          )}
          <span className="ml-auto text-muted-foreground">{line.my.cost_basis} staked</span>
        </div>
      )}

      {/* the book + activity */}
      {(line.book.length > 0 || recentTrades.length > 0) && (
        <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
          {line.book.length > 0 && (
            <div>
              <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Positions</h3>
              <ul className="space-y-1">
                {line.book.map((b) => (
                  <li key={b.handle} className="flex items-center gap-1.5 text-[11px]">
                    <Avatar handle={b.handle} name={b.display_name} className="size-4 text-[7px]" />
                    <span className="font-medium">@{b.handle}</span>
                    <span className="ml-auto tabular-nums">
                      {b.yes_shares > 0.01 && <span className="text-success">{b.yes_shares.toFixed(0)} YES</span>}
                      {b.yes_shares > 0.01 && b.no_shares > 0.01 && <span className="text-muted-foreground"> · </span>}
                      {b.no_shares > 0.01 && <span className="text-destructive">{b.no_shares.toFixed(0)} NO</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {recentTrades.length > 0 && (
            <div>
              <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Activity</h3>
              <ul className="space-y-1">
                {recentTrades.map((tr: TradeEvent, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={cn("size-1.5 shrink-0 rounded-full", tr.side === "yes" ? "bg-success" : "bg-destructive")} />
                    <span className="truncate">
                      <b className="font-medium text-foreground">@{tr.handle}</b> {tr.action === "buy" ? "staked" : "sold"} {Math.abs(tr.cost)}{" "}
                      {tr.side.toUpperCase()}
                    </span>
                    <span className="ml-auto shrink-0 tabular-nums">→ {Math.round(tr.p * 100)}% · {timeAgo(tr.t)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
