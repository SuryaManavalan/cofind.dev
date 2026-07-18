import { useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, Send } from "lucide-react";
import type { RenderMode } from "../types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import RenderBody from "./RenderBody";

const MODES: { value: RenderMode; label: string; hint: string }[] = [
  { value: "text", label: "text", hint: "Plain text" },
  { value: "markdown", label: "md", hint: "Rendered markdown" },
  { value: "html", label: "html", hint: "Sandboxed HTML artifact" },
];

function AgentDraftDialog({
  open,
  onOpenChange,
  postId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  postId?: string;
}) {
  const [copied, setCopied] = useState(false);
  // One-directional handoff (ADR-006): context goes *into* the agent; the write
  // comes back server-side through MCP. Nothing round-trips through this UI.
  const prompt = postId
    ? `Use the cofind MCP to reply to post ${postId}. Call get_post first to read the thread, then draft a reply in my voice and call reply. Keep it concrete and warm — this is a small room of friends.`
    : `Use the cofind MCP to post an update for me. Ask me what I shipped or learned today, then call create_post — render_mode "markdown" usually, or "html" if a rendered artifact (chart, changelog, demo) tells it better. For html, mark one element data-cofind="card" as the compact card the feed shows; the full page renders when the post is opened. The room values real numbers and artifacts over vibes.`;

  async function copy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5 text-brand" /> {postId ? "Reply with your agent" : "Draft with your agent"}
          </DialogTitle>
          <DialogDescription>
            Paste this into your agent (Claude, connected to the cofind MCP). It will {postId ? "read the thread and reply" : "interview you and post"}{" "}
            as you — the post lands here on next sync and shows an <span className="text-brand">agent</span> chip.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/50 p-3 text-sm leading-relaxed">{prompt}</div>
        <div className="flex justify-end">
          <Button onClick={copy} size="sm">
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy prompt"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Bottom-anchored composer (ADR-003): chat muscle memory, feed reading ergonomics.
export default function Composer({
  placeholder,
  defaultMode = "text",
  onSubmit,
  postId,
  listenForPalette = false,
}: {
  placeholder: string;
  defaultMode?: RenderMode;
  onSubmit: (body: string, mode: RenderMode) => Promise<void>;
  postId?: string;
  listenForPalette?: boolean;
}) {
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<RenderMode>(defaultMode);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [agentDialog, setAgentDialog] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!listenForPalette) return;
    const focus = () => textareaRef.current?.focus();
    const draft = () => setAgentDialog(true);
    window.addEventListener("cofind:focus-composer", focus);
    window.addEventListener("cofind:agent-draft", draft);
    return () => {
      window.removeEventListener("cofind:focus-composer", focus);
      window.removeEventListener("cofind:agent-draft", draft);
    };
  }, [listenForPalette]);

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit(trimmed, mode);
      setBody("");
      setPreviewing(false);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  const canPreview = mode !== "text" && body.trim().length > 0;

  return (
    <div className="border-t bg-background/80 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-6">
      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}

      {previewing && canPreview ? (
        <div className="mb-2 max-h-72 overflow-y-auto rounded-xl border bg-card px-3.5 py-2.5">
          <RenderBody body={body.trim()} mode={mode} variant="full" />
        </div>
      ) : null}

      <div className={cn("flex items-end gap-2", previewing && canPreview && "hidden")}>
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

      {previewing && canPreview && (
        <div className="flex justify-end">
          <Button onClick={submit} disabled={sending} size="sm" className="rounded-lg">
            <Send /> Post it
          </Button>
        </div>
      )}

      <div className="mt-2 flex items-center gap-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => {
              setMode(m.value);
              if (m.value === "text") setPreviewing(false);
            }}
            title={m.hint}
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider transition-colors",
              mode === m.value ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
        {canPreview && (
          <button
            onClick={() => setPreviewing(!previewing)}
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider transition-colors",
              previewing ? "bg-brand/15 text-brand" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {previewing ? "editing off" : "preview"}
          </button>
        )}
        <button
          onClick={() => setAgentDialog(true)}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-brand"
          title="Hand this to your agent"
        >
          <Bot className="size-3.5" /> agent
        </button>
        <span className="hidden text-[11px] text-muted-foreground sm:block">⌘↵</span>
      </div>
      <div className="flex">
        {mode === "html" && !postId && (
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Long pages welcome — mark one element <code className="rounded bg-muted px-1">data-cofind="card"</code> and the feed
            shows just that as the card; opening the post reveals everything.
          </p>
        )}
      </div>

      <AgentDraftDialog open={agentDialog} onOpenChange={setAgentDialog} postId={postId} />
    </div>
  );
}
