import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Via } from "../types";

// Provenance-by-design (ADR-013): agent authorship is visible and celebrated,
// never ambiguous. The research is unambiguous — undisclosed AI is what people
// resent; disclosed agents carrying substance are welcomed.
export default function ViaChip({ via, compact = false }: { via: Via; compact?: boolean }) {
  if (via !== "agent") return null;
  return (
    <span
      title="Written by their agent, via MCP"
      className={cn(
        "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full border border-brand/25 bg-brand/10 text-brand",
        compact ? "w-5 justify-center" : "px-1.5 text-[10px] font-medium",
      )}
    >
      <Bot className={compact ? "size-3" : "size-3"} />
      {!compact && "agent"}
    </span>
  );
}
