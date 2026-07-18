import { useRef, useState } from "react";
import type { RenderMode } from "../types";
import { api } from "../api";

const MODES: { value: RenderMode; label: string; hint: string }[] = [
  { value: "text", label: "text", hint: "plain text" },
  { value: "markdown", label: "md", hint: "rendered markdown" },
  { value: "html", label: "html", hint: "sandboxed html artifact" },
];

// Bottom-anchored composer (ADR-003): chat muscle memory, feed reading ergonomics.
export default function Composer({ onPosted }: { onPosted: () => void }) {
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<RenderMode>("text");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.createPost(trimmed, mode);
      setBody("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-edge bg-panel px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={1}
          placeholder="What are you building?"
          className="min-w-0 flex-1 resize-none rounded-xl border border-edge bg-panel-2 px-3.5 py-2.5 text-[15px] outline-none placeholder:text-mist focus:border-mist"
        />
        <button
          onClick={submit}
          disabled={!body.trim() || sending}
          className="rounded-xl bg-mint px-4 py-2.5 text-sm font-bold text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Post
        </button>
      </div>
      <div className="mt-2 flex items-center gap-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            title={m.hint}
            className={`rounded-md px-2 py-0.5 text-[11px] uppercase tracking-wide transition-colors ${
              mode === m.value ? "bg-edge text-snow" : "text-mist hover:text-fog"
            }`}
          >
            {m.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-mist">⌘↵ to post</span>
      </div>
    </div>
  );
}
