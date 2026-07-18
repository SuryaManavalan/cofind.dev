import { cn } from "@/lib/utils";

// Muted hue pairs — quiet gradients that hold up in both themes.
const HUES = [262, 173, 330, 210, 25, 145];

export default function Avatar({ handle, name, className }: { handle: string; name: string; className?: string }) {
  const hue = HUES[[...handle].reduce((a, ch) => a + ch.charCodeAt(0), 0) % HUES.length];
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
