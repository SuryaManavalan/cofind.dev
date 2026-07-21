import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Eraser, Paintbrush, Store } from "lucide-react";
import type { BazaarItem, InventoryRow, PixelAvatar } from "../types";
import { api } from "../api";
import { useFeed } from "../feed-context";
import { cn } from "@/lib/utils";
import { burst } from "@/lib/juice";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Avatar, { PixelGrid } from "../components/Avatar";
import PullToRefresh from "../components/PullToRefresh";
import { ConvictionAmount, ConvictionCoin } from "../components/Conviction";
import HapticOverlay from "../components/HapticOverlay";

// The Bazaar (see research/bazaar-roadmap.md): the conviction marketplace.
// Today it sells pixels; the shop is item-kind agnostic so stranger goods
// can appear later without re-architecting. Below the shop: the avatar
// studio, where owned pixels become your face.

const GRID_SIZES = [4, 8, 16] as const;
const QTY_STEPS = [1, 5, 10, 25];

export default function BazaarView() {
  const { me, wallet, setWalletBalance, refresh } = useFeed();
  const [items, setItems] = useState<BazaarItem[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [savedAvatar, setSavedAvatar] = useState<PixelAvatar | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const r = await api.bazaar();
    setItems(r.items);
    setInventory(r.inventory);
    setSavedAvatar(r.avatar);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const owned = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of inventory) if (r.kind === "pixel") m.set(r.spec, r.qty);
    return m;
  }, [inventory]);

  const totalPixels = useMemo(() => [...owned.values()].reduce((a, b) => a + b, 0), [owned]);

  return (
    <PullToRefresh onRefresh={load}>
      {/* header */}
      <div className="border-b px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold">
              <Store className="size-5 text-brand" /> The Bazaar
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Spend conviction on the room's finery. Pixels today — stranger goods soon.
            </p>
          </div>
          {wallet && (
            <ConvictionAmount n={wallet.balance} className="rounded-full bg-conviction/10 px-3 py-1.5 text-sm font-bold" />
          )}
        </div>
      </div>

      {loaded && (
        <>
          <PixelShop
            items={items}
            owned={owned}
            balance={wallet?.balance ?? null}
            onBought={(balance) => {
              setWalletBalance(balance);
              load();
            }}
          />
          <AvatarStudio
            me={{ handle: me.handle, name: me.display_name }}
            owned={owned}
            totalPixels={totalPixels}
            saved={savedAvatar}
            onSaved={(a) => {
              setSavedAvatar(a);
              refresh(); // members refetch → everyone's Avatar picks it up
            }}
          />
        </>
      )}
    </PullToRefresh>
  );
}

// --- the shop ---

function PixelShop({
  items,
  owned,
  balance,
  onBought,
}: {
  items: BazaarItem[];
  owned: Map<string, number>;
  balance: number | null;
  onBought: (balance: number) => void;
}) {
  const [buying, setBuying] = useState<BazaarItem | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pixels = items.filter((i) => i.kind === "pixel");
  const cost = buying ? buying.price * qty : 0;
  const canAfford = balance === null || balance >= cost;

  function open(item: BazaarItem) {
    haptic("light");
    setQty(1);
    setError(null);
    setBuying(item);
  }

  async function doBuy(e: React.MouseEvent) {
    if (!buying || busy) return;
    setBusy(true);
    setError(null);
    const { clientX, clientY } = e;
    try {
      const res = await api.bazaarBuy(buying.id, qty);
      setBuying(null);
      haptic("medium");
      burst(clientX, clientY, 16);
      onBought(res.balance);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't buy");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b px-4 py-4 sm:px-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Pixels</h2>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <ConvictionCoin className="size-3 text-conviction" /> 50 each · yours forever
        </span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        {pixels.map((item) => {
          const color = item.spec.color!;
          const n = owned.get(color) ?? 0;
          return (
            <button
              key={item.id}
              onClick={() => open(item)}
              title={`${item.name} — ${item.price} conviction`}
              className="group relative flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all hover:border-ring hover:shadow-sm active:scale-95"
            >
              <span
                className="size-9 rounded-lg border border-black/10 shadow-inner transition-transform group-hover:scale-110"
                style={{ background: color }}
              />
              <span className="text-[10px] font-medium text-muted-foreground">{item.name.replace(" pixel", "")}</span>
              {n > 0 && (
                <span className="absolute -right-1 -top-1 rounded-full border bg-background px-1.5 py-px text-[9px] font-bold tabular-nums shadow-sm">
                  ×{n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Dialog open={!!buying} onOpenChange={(o) => !busy && !o && setBuying(null)}>
        <DialogContent className="max-w-sm">
          {buying && (
            <>
              <DialogHeader>
                <div
                  className="mb-1 size-10 rounded-lg border border-black/10 shadow-inner"
                  style={{ background: buying.spec.color }}
                />
                <DialogTitle>Buy {buying.name}s</DialogTitle>
                <DialogDescription>
                  Each pixel costs <ConvictionAmount n={buying.price} className="font-semibold" coinClassName="size-3" />,
                  burned for good. Place them in the avatar studio below — rearrange any time, they stay yours.
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center gap-1.5">
                {QTY_STEPS.map((v) => (
                  <button
                    key={v}
                    onClick={() => setQty(v)}
                    className={cn(
                      "h-8 flex-1 rounded-lg border text-sm font-semibold tabular-nums transition-colors",
                      qty === v ? "border-brand/50 bg-brand/10 text-brand" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <ConvictionCoin className="size-3.5 text-conviction" /> Your conviction
                </span>
                {balance !== null ? (
                  <span className="flex items-baseline gap-2 tabular-nums">
                    <span className="font-semibold">{balance}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className={cn("font-semibold", canAfford ? "text-conviction" : "text-destructive")}>
                      {Math.max(0, balance - cost)}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">…</span>
                )}
              </div>

              {!canAfford && <p className="text-xs text-destructive">Not enough conviction — earn it by building and shipping.</p>}
              {error && <p className="text-xs text-destructive">{error}</p>}

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setBuying(null)}>
                  Not now
                </Button>
                <Button size="sm" disabled={!canAfford || busy} onClick={doBuy} className="relative bg-brand text-background hover:bg-brand/90">
                  <HapticOverlay />
                  <ConvictionCoin className="!size-3.5" />
                  {busy ? "Buying…" : `Burn ${cost} · Buy ${qty}`}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- the studio ---

function AvatarStudio({
  me,
  owned,
  totalPixels,
  saved,
  onSaved,
}: {
  me: { handle: string; name: string };
  owned: Map<string, number>;
  totalPixels: number;
  saved: PixelAvatar | null;
  onSaved: (a: PixelAvatar | null) => void;
}) {
  const [size, setSize] = useState<number | null>(saved?.size ?? null); // null = letter
  const [cells, setCells] = useState<(string | null)[]>(saved?.cells ?? []);
  const [color, setColor] = useState<string | null>(null);
  const [erasing, setErasing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const painting = useRef(false);

  // Keep the studio in sync when the server copy arrives/changes.
  useEffect(() => {
    setSize(saved?.size ?? null);
    setCells(saved?.cells ?? []);
  }, [saved]);

  const used = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cells) if (c) m.set(c, (m.get(c) ?? 0) + 1);
    return m;
  }, [cells]);

  const remaining = useCallback((c: string) => (owned.get(c) ?? 0) - (used.get(c) ?? 0), [owned, used]);

  const dirty = useMemo(() => {
    if (size === null) return saved !== null;
    if (!saved || saved.size !== size) return true;
    return saved.cells.some((c, i) => c !== cells[i]);
  }, [size, cells, saved]);

  function pickSize(s: number | null) {
    haptic("light");
    setError(null);
    setSize(s);
    if (s === null) return;
    if (saved && saved.size === s) setCells([...saved.cells]);
    else setCells(new Array(s * s).fill(null));
  }

  function paintAt(clientX: number, clientY: number) {
    if (!gridRef.current || size === null) return;
    const rect = gridRef.current.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * size);
    const y = Math.floor(((clientY - rect.top) / rect.height) * size);
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = y * size + x;
    setCells((prev) => {
      const next = erasing ? null : color;
      if (prev[i] === next) return prev;
      // Painting spends from your stash; can't place more than you own.
      if (next !== null && prev[i] !== next && (owned.get(next) ?? 0) - prev.filter((c) => c === next).length <= 0) return prev;
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const avatar = size === null ? null : { size, cells };
      const res = await api.saveAvatar(avatar);
      haptic("medium");
      onSaved(res.avatar);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  const ownedColors = [...owned.entries()].filter(([, q]) => q > 0);
  const preview: PixelAvatar | null = size !== null ? { size, cells } : null;

  return (
    <div className="px-4 py-4 sm:px-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Avatar studio</h2>
        <span className="text-[11px] text-muted-foreground">
          {totalPixels > 0 ? `${totalPixels} pixels in your stash` : "buy pixels above to start"}
        </span>
      </div>

      {/* mode picker */}
      <div className="mt-3 flex gap-1.5">
        {[null, ...GRID_SIZES].map((s) => (
          <button
            key={s ?? "letter"}
            onClick={() => pickSize(s)}
            className={cn(
              "h-7 rounded-full border px-3 text-[11px] font-semibold transition-colors",
              size === s ? "border-brand/50 bg-brand/10 text-brand" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s === null ? "Letter" : `${s}×${s}`}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-5 sm:flex-row">
        {/* canvas */}
        <div className="min-w-0 flex-1">
          {size === null ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed">
              <Avatar handle={me.handle} name={me.name} className="size-16 text-xl" />
              <p className="text-xs text-muted-foreground">Your letter mark — always free, always available.</p>
            </div>
          ) : (
            <>
              <div
                ref={gridRef}
                onPointerDown={(e) => {
                  painting.current = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  paintAt(e.clientX, e.clientY);
                }}
                onPointerMove={(e) => painting.current && paintAt(e.clientX, e.clientY)}
                onPointerUp={() => (painting.current = false)}
                className="grid aspect-square w-full max-w-xs cursor-crosshair touch-none select-none overflow-hidden rounded-xl border bg-secondary/40"
                style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
              >
                {cells.map((c, i) => (
                  <div key={i} className="border-[0.5px] border-border/30" style={c ? { background: c } : undefined} />
                ))}
              </div>

              {/* palette of owned colors */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {ownedColors.length === 0 && (
                  <span className="text-[11px] text-muted-foreground">Your stash is empty — buy pixels above.</span>
                )}
                {ownedColors.map(([c]) => {
                  const left = remaining(c);
                  const active = !erasing && color === c;
                  return (
                    <button
                      key={c}
                      onClick={() => {
                        setColor(c);
                        setErasing(false);
                      }}
                      disabled={left <= 0 && !active}
                      title={`${left} left to place`}
                      className={cn(
                        "relative size-8 rounded-lg border border-black/10 shadow-inner transition-all",
                        active && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                        left <= 0 && !active && "opacity-30",
                      )}
                      style={{ background: c }}
                    >
                      <span className="absolute -bottom-1 -right-1 rounded-full border bg-background px-1 text-[8px] font-bold tabular-nums">
                        {left}
                      </span>
                    </button>
                  );
                })}
                {ownedColors.length > 0 && (
                  <button
                    onClick={() => setErasing(!erasing)}
                    title="Eraser"
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg border text-muted-foreground transition-all hover:text-foreground",
                      erasing && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                    )}
                  >
                    <Eraser className="size-4" />
                  </button>
                )}
                {ownedColors.length > 0 && (
                  <span className="ml-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    {erasing ? <Eraser className="size-3" /> : <Paintbrush className="size-3" />}
                    drag to {erasing ? "erase" : "paint"}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* live preview */}
        <div className="flex shrink-0 flex-row items-center gap-4 sm:w-36 sm:flex-col sm:justify-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Preview</span>
          <div className="flex items-center gap-3">
            {preview ? (
              <>
                <div className="size-16 overflow-hidden rounded-full border bg-secondary">
                  <PixelGrid avatar={preview} />
                </div>
                <div className="size-9 overflow-hidden rounded-full border bg-secondary">
                  <PixelGrid avatar={preview} />
                </div>
                <div className="size-6 overflow-hidden rounded-full border bg-secondary">
                  <PixelGrid avatar={preview} />
                </div>
              </>
            ) : (
              <Avatar handle={me.handle} name={me.name} className="size-16 text-xl" />
            )}
          </div>
          <Button size="sm" onClick={save} disabled={!dirty || busy} className="relative sm:w-full">
            <HapticOverlay />
            <Check className="!size-3.5" /> {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
