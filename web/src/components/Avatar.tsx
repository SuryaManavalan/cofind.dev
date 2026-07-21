import { cn } from "@/lib/utils";
import type { PixelAvatar } from "../types";
import { useMemberAvatar } from "../feed-context";

// Muted hue pairs — quiet gradients that hold up in both themes.
const HUES = [262, 173, 330, 210, 25, 145];

// Pixel art bought in the Bazaar, rendered crisp at any size.
export function PixelGrid({ avatar, className }: { avatar: PixelAvatar; className?: string }) {
  const s = avatar.size;
  return (
    <svg viewBox={`0 0 ${s} ${s}`} shapeRendering="crispEdges" className={cn("size-full", className)} aria-hidden>
      {avatar.cells.map((c, i) =>
        c ? <rect key={i} x={i % s} y={Math.floor(i / s)} width="1" height="1" fill={c} /> : null,
      )}
    </svg>
  );
}

export default function Avatar({ handle, name, className }: { handle: string; name: string; className?: string }) {
  const pixels = useMemberAvatar(handle);
  const hue = HUES[[...handle].reduce((a, ch) => a + ch.charCodeAt(0), 0) % HUES.length];

  if (pixels) {
    return (
      <div className={cn("size-9 shrink-0 select-none overflow-hidden rounded-full bg-secondary", className)}>
        <PixelGrid avatar={pixels} />
      </div>
    );
  }
  return (
    <div
      className={cn("flex size-9 shrink-0 select-none items-center justify-center rounded-full text-sm font-semibold text-white", className)}
      style={{
        background: `linear-gradient(135deg, oklch(0.55 0.13 ${hue}), oklch(0.42 0.11 ${(hue ?? 0) + 40}))`,
      }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
