import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

const THRESHOLD = 64;
const MAX_PULL = 96;

// EXPERIMENT (pull haptic on iOS 26.5+): programmatic switch haptics are
// patched, but a *genuine* knob-drag on a real switch still fires the Taptic
// Engine. This strip sits over the top of the feed (touch devices, only when
// scrolled to top) holding a huge switch rotated 90° so its slide axis points
// down: starting a pull inside the strip drags the knob, and the native flip
// — timed by the switch's pre-rotation width to land near THRESHOLD — is a
// real user toggle. Taps are forwarded to the content underneath. Set
// localStorage.exp_pull_haptic = "show" to see the strip while testing.
const TOUCH = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

function HapticPullStrip({ atTop, busy }: { atTop: boolean; busy: boolean }) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const tapStart = useRef<{ x: number; y: number } | null>(null);
  const debug = typeof localStorage !== "undefined" && localStorage.getItem("exp_pull_haptic") === "show";

  // A tap (no drag) on the strip belongs to the content under it.
  function forwardTap(e: React.MouseEvent) {
    const t = tapStart.current;
    tapStart.current = null;
    if (t && (Math.abs(e.clientX - t.x) > 8 || Math.abs(e.clientY - t.y) > 8)) return;
    const strip = stripRef.current;
    if (!strip) return;
    strip.style.pointerEvents = "none";
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    strip.style.pointerEvents = "";
    el?.click();
  }

  return (
    <div
      ref={stripRef}
      className={cn("absolute inset-x-0 top-0 z-20 h-32 overflow-hidden", (!atTop || busy) && "pointer-events-none")}
      style={{ opacity: debug ? 0.3 : 0 }}
      aria-hidden="true"
    >
      <input
        type="checkbox"
        tabIndex={-1}
        onChange={() => {}}
        onPointerDown={(e) => (tapStart.current = { x: e.clientX, y: e.clientY })}
        onClick={forwardTap}
        className="absolute left-1/2 top-1/2 m-0 cursor-default"
        // Pre-rotation width becomes vertical knob travel: 128px ≈ flip at ~64px, our THRESHOLD.
        style={{ width: 128, height: 1400, transform: "translate(-50%,-50%) rotate(90deg)" }}
        {...({ switch: "" } as Record<string, string>)}
      />
    </div>
  );
}

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
  const [atTop, setAtTop] = useState(true);

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
    // dampened pull — haptic tick the moment the release-to-refresh threshold arms
    const next = Math.min(dy * 0.45, MAX_PULL);
    if (pull < THRESHOLD && next >= THRESHOLD) haptic("light");
    setPull(next);
  }

  async function onTouchEnd() {
    if (busy) return;
    const release = pull;
    startY.current = null;
    if (release >= THRESHOLD) {
      haptic("medium");
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
    // Touch handlers live on the wrapper so pulls that begin on the haptic
    // strip still drive the refresh gesture (events bubble up from it).
    <div className="relative min-h-0 flex-1" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
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
        onScroll={() => setAtTop((ref.current?.scrollTop ?? 0) <= 0)}
        className={cn("h-full overflow-y-auto overscroll-y-contain", className)}
        style={{ transform: pull ? `translateY(${pull}px)` : undefined, transition: startY.current === null ? "transform 200ms ease" : undefined }}
      >
        {children}
      </div>
      {TOUCH && <HapticPullStrip atTop={atTop} busy={busy} />}
    </div>
  );
}
