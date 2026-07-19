import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Coins, TrendingUp } from "lucide-react";
import type { MarketDto, Wallet } from "../types";
import { api } from "../api";
import { cn, timeAgo } from "@/lib/utils";
import { burst } from "@/lib/juice";
import { useSlotNumber } from "@/lib/useSlotNumber";
import { Button } from "@/components/ui/button";
import PullToRefresh from "../components/PullToRefresh";

// The Floor (ADR-023): every open line in the room, priced live. Conviction
// is minted by building; here it's staked on whether things actually ship.

const REASON_LABELS: Record<string, string> = {
  signup: "joined the room",
  daily: "showed up today",
  stop: "posted a stop",
  post: "posted",
  reaction: "got a reaction",
  ship: "shipped a track",
  settle: "line settled — payout",
  trade_buy: "staked the line",
  trade_sell: "sold back",
  open: "opened a line",
};

function WalletCard({ wallet }: { wallet: Wallet }) {
  const bal = useSlotNumber(wallet.balance, { duration: 900 });
  return (
    <div className="border-b px-4 py-4 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tabular-nums tracking-tight text-brand">{bal}</span>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">conviction</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Minted only by building — posting stops, getting reactions, shipping. Stake it on the lines below.
          </p>
        </div>
        <Coins className="hidden size-8 text-brand/40 sm:block" />
      </div>
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

function MarketCard({ m, onTraded }: { m: MarketDto; onTraded: (updated: MarketDto) => void }) {
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [busy, setBusy] = useState(false);
  const pct = useSlotNumber(m.price_yes * 100, { duration: 700 });
  const settled = !!m.resolved_at;
  const daysLeft = Math.max(0, Math.ceil((m.target_at - Date.now()) / 86400000));
  const hasPosition = m.my.yes_shares > 0.01 || m.my.no_shares > 0.01;

  async function stake(e: React.MouseEvent) {
    if (busy || settled) return;
    setBusy(true);
    try {
      const r = await api.marketTrade(m.id, side, "buy", 25);
      burst(e.clientX, e.clientY, 18);
      onTraded(r.market);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("border-b px-4 py-3.5 transition-colors sm:px-6", settled && "opacity-60")}>
      <div className="flex items-center gap-4">
        <div className="w-16 shrink-0 text-center">
          <div
            className={cn(
              "text-2xl font-bold tabular-nums tracking-tight",
              settled ? (m.outcome === "yes" ? "text-emerald-500" : "text-destructive") : "text-foreground",
            )}
          >
            {settled ? (m.outcome === "yes" ? "YES" : "NO") : `${pct}%`}
          </div>
          {!settled && m.move_24h !== 0 && (
            <div className={cn("text-[10px] tabular-nums", m.move_24h > 0 ? "text-emerald-500" : "text-destructive")}>
              {m.move_24h > 0 ? "▲" : "▼"}
              {(Math.abs(m.move_24h) * 100).toFixed(0)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <Link
            to={m.track.slug.includes("/") ? `/t/${m.track.slug}` : `/t/${m.track.slug}`}
            className="block truncate text-sm font-medium text-foreground hover:text-brand"
          >
            {m.question}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-muted-foreground">
            {settled ? (
              <span>settled {timeAgo(m.resolved_at!)}</span>
            ) : (
              <span className="flex items-center gap-1">
                <CalendarClock className="size-3" /> {daysLeft}d left
              </span>
            )}
            <span>{m.volume} traded</span>
            <span>{m.trader_count} traders</span>
            {hasPosition && (
              <span className="font-medium text-brand">
                you: {m.my.yes_shares > 0.01 && `${m.my.yes_shares.toFixed(0)}Y`}
                {m.my.yes_shares > 0.01 && m.my.no_shares > 0.01 && "/"}
                {m.my.no_shares > 0.01 && `${m.my.no_shares.toFixed(0)}N`}
              </span>
            )}
          </div>
        </div>
        {!settled && (
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="flex overflow-hidden rounded-full border">
              {(["yes", "no"] as const).map((sd) => (
                <button
                  key={sd}
                  onClick={() => setSide(sd)}
                  className={cn(
                    "px-2.5 py-1 text-[10px] font-bold uppercase transition-colors",
                    side === sd ? (sd === "yes" ? "bg-emerald-500 text-white" : "bg-destructive text-white") : "text-muted-foreground",
                  )}
                >
                  {sd}
                </button>
              ))}
            </div>
            <Button size="sm" className="h-7 rounded-full text-[11px]" onClick={stake} disabled={busy}>
              25
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FloorView() {
  const [markets, setMarkets] = useState<MarketDto[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const r = await api.markets();
    setMarkets(r.markets);
    setWallet(r.wallet);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  function onTraded(updated: MarketDto) {
    setMarkets((ms) => ms.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
    api.walletGet().then(setWallet).catch(() => {});
  }

  return (
    <PullToRefresh onRefresh={load}>
      {wallet && <WalletCard wallet={wallet} />}
      {markets.map((m) => (
        <MarketCard key={m.id} m={m} onTraded={onTraded} />
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
