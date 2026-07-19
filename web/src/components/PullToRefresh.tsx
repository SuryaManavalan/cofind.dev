import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const THRESHOLD = 64;
const MAX_PULL = 96;

// Touch-only pull-to-refresh for scrollable views. The PWA has no browser
// chrome, so this is the only "refresh" gesture mobile users have.
export default function PullToRefresh({
  onRefresh,
  className,
  children,
  scrollRef,
}: {
  onRefresh: () => Promise<unknown>;
  className?: string;
  children: React.ReactNode;
  // Optional handle on the scroll viewport, so a parent can persist and
  // restore its scroll position across navigation (see FeedView).
  scrollRef?: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  function onTouchStart(e: React.TouchEvent) {
    if (busy) return;
    if ((ref.current?.scrollTop ?? 1) <= 0) startY.current = e.touches[0]?.clientY ?? null;
    else startY.current = null;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (busy || startY.current === null) return;
    const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
    if (dy <= 0 || (ref.current?.scrollTop ?? 0) > 0) {
      setPull(0);
      return;
    }
    // dampened pull
    setPull(Math.min(dy * 0.45, MAX_PULL));
  }

  async function onTouchEnd() {
    if (busy) return;
    const release = pull;
    startY.current = null;
    if (release >= THRESHOLD) {
      setBusy(true);
      setPull(48);
      try {
        await onRefresh();
      } finally {
        setBusy(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        className="pointer-events-none absolute inset-x-0 top-1 z-10 flex justify-center transition-opacity"
        style={{ opacity: pull > 8 || busy ? 1 : 0 }}
      >
        <span className="flex size-8 items-center justify-center rounded-full border bg-card shadow-md">
          <RefreshCw
            className={cn("size-4 text-success", busy && "animate-spin")}
            style={busy ? undefined : { transform: `rotate(${pull * 3}deg)`, opacity: Math.min(pull / THRESHOLD, 1) }}
          />
        </span>
      </div>
      <div
        ref={(el) => {
          ref.current = el;
          if (scrollRef) scrollRef.current = el;
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={cn("h-full overflow-y-auto overscroll-y-contain", className)}
        style={{ transform: pull ? `translateY(${pull}px)` : undefined, transition: startY.current === null ? "transform 200ms ease" : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
