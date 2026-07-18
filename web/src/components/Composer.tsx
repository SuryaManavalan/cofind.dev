import { useRef, useState } from "react";
import { Send } from "lucide-react";
import type { RenderMode } from "../types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const MODES: { value: RenderMode; label: string; hint: string }[] = [
  { value: "text", label: "text", hint: "Plain text" },
  { value: "markdown", label: "md", hint: "Rendered markdown" },
  { value: "html", label: "html", hint: "Sandboxed HTML artifact" },
];

// Bottom-anchored composer (ADR-003): chat muscle memory, feed reading ergonomics.
export default function Composer({
  placeholder,
  defaultMode = "text",
  onSubmit,
}: {
  placeholder: string;
  defaultMode?: RenderMode;
  onSubmit: (body: string, mode: RenderMode) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<RenderMode>(defaultMode);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit(trimmed, mode);
      setBody("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t bg-background/80 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-6">
      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={1}
          placeholder={placeholder}
          className="min-h-9 flex-1 resize-none rounded-xl border border-input bg-transparent px-3.5 py-2 text-[15px] shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <Button onClick={submit} disabled={!body.trim() || sending} size="icon" className="rounded-xl" title="Post (⌘↵)">
          <Send />
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            title={m.hint}
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider transition-colors",
              mode === m.value ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">⌘↵ to send</span>
      </div>
    </div>
  );
}
