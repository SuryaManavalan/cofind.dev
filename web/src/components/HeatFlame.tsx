import { RiFireFill, RiFireLine } from "@remixicon/react";
import type { TrackHeat } from "../types";
import { cn } from "@/lib/utils";

// The track fire, tiered by how it's burning (see trackHeat, server):
//  blazing — filled red flame, pulsing: a burst right now, accelerating
//  loved   — filled brand flame: the room's engagement is pouring in
//  steady  — amber outline flame: weeks of sustained stops
const TIERS = {
  blazing: { Icon: RiFireFill, cls: "text-destructive animate-pulse" },
  loved: { Icon: RiFireFill, cls: "text-brand" },
  steady: { Icon: RiFireLine, cls: "text-warning" },
} as const;

export default function HeatFlame({ heat, className }: { heat: TrackHeat | null | undefined; className?: string }) {
  if (!heat) return null;
  const { Icon, cls } = TIERS[heat.tier];
  return (
    <span title={heat.label} aria-label={heat.label} className="inline-flex shrink-0">
      <Icon className={cn("size-3.5", cls, className)} />
    </span>
  );
}
