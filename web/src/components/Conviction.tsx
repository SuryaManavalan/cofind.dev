import { cn } from "@/lib/utils";

// Conviction's mark: the lucide Zap bolt struck into a coin. One drawing,
// used everywhere the currency appears, so the room learns it on sight.
const ZAP_PATH =
  "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z";

export function ConvictionCoin({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("shrink-0", className)}>
      <circle cx="12" cy="12" r="10.75" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="0.9" opacity="0.35" />
      <g transform="translate(12 12) scale(0.5) translate(-12 -12)">
        <path d={ZAP_PATH} fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

// Inline amount: gold coin + tabular number. `delta` renders a signed change.
export function ConvictionAmount({
  n,
  delta = false,
  className,
  coinClassName,
}: {
  n: number;
  delta?: boolean;
  className?: string;
  coinClassName?: string;
}) {
  return (
    <span
      title={`${Math.abs(n)} conviction`}
      className={cn("inline-flex items-center gap-1 tabular-nums text-conviction", className)}
    >
      <ConvictionCoin className={cn("size-3.5", coinClassName)} />
      {delta && n > 0 ? "+" : ""}
      {delta && n < 0 ? "−" : ""}
      {Math.abs(n)}
    </span>
  );
}
