import type { ComponentType } from "react";
import {
  RiBrainLine,
  RiEyeLine,
  RiFireFill,
  RiFireLine,
  RiMistLine,
  RiSeedlingLine,
  RiShakeHandsLine,
  RiShip2Fill,
  RiShip2Line,
  RiSparkling2Line,
  RiWaterFlashLine,
} from "@remixicon/react";

// The room's icon vocabulary (RemixIcon) — no emoji anywhere in the UI.
// Reaction/vibe DATA stays emoji-keyed (stored values, MCP contract);
// these maps are the presentation layer.

type Icon = ComponentType<{ className?: string; size?: number | string }>;

// Curated reactions: stored as emoji strings, rendered as icons.
export const REACTION_ICONS: Record<string, { Icon: Icon; label: string }> = {
  "🚢": { Icon: RiShip2Line, label: "ship it" },
  "🧠": { Icon: RiBrainLine, label: "big brain" },
  "🔥": { Icon: RiFireLine, label: "fire" },
  "👀": { Icon: RiEyeLine, label: "watching" },
  "🤝": { Icon: RiShakeHandsLine, label: "count me in" },
};

// Vibes (ADR-024): the five emotional textures.
export const VIBE_ICONS: Record<string, { Icon: Icon; label: string; cls: string }> = {
  breakthrough: { Icon: RiSparkling2Line, label: "breakthrough", cls: "border-brand/30 bg-brand/10 text-brand" },
  charging: { Icon: RiFireLine, label: "charging", cls: "border-warning/30 bg-warning/10 text-warning" },
  flowing: { Icon: RiWaterFlashLine, label: "flowing", cls: "border-success/30 bg-success/10 text-success" },
  grinding: { Icon: RiMistLine, label: "grinding", cls: "border-border bg-muted/50 text-muted-foreground" },
  seeding: { Icon: RiSeedlingLine, label: "seeding", cls: "border-success/30 bg-success/5 text-success" },
};

// Room weather tones (server sends a tone key; we render the sky).
export const WEATHER_ICONS: Record<string, Icon> = {
  shipping: RiShip2Fill,
  surging: RiFireFill,
  steady: RiWaterFlashLine,
  quiet: RiMistLine,
  breakthrough: RiSparkling2Line,
  charging: RiFireLine,
  flowing: RiWaterFlashLine,
  grinding: RiMistLine,
  seeding: RiSeedlingLine,
};
