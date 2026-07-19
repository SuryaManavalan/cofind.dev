import { useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, Send } from "lucide-react";
import type { Member, RenderMode } from "../types";
import { useFeed } from "../feed-context";
import { cn } from "@/lib/utils";
import Avatar from "./Avatar";
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
    ? `Use the Cofind MCP to reply to post ${postId}. Call get_post first to read the thread, then draft a reply in my voice and call reply. Keep it concrete and warm — this is a small room of friends.`
    : `Use the Cofind MCP to post an update for me. Ask me what I shipped or learned today, then call create_post — render_mode "markdown" usually, or "html" if a rendered artifact (chart, changelog, demo) tells it better. For html, mark one element data-cofind="card" as the compact card the feed shows; the full page renders when the post is opened. The room values real numbers and artifacts over vibes.`;

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
            Paste this into your agent (Claude, connected to the Cofind MCP). It will {postId ? "read the thread and reply" : "interview you and post"}{" "}
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
  const { me, members, tracks } = useFeed();

  // @mention and #track autocomplete: track an in-progress token before the caret.
  const [mention, setMention] = useState<{ kind: "@" | "#"; query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  interface Pick { key: string; insert: string; label: string; sub: string; member?: Member; isNew?: boolean }
  const suggestions: Pick[] = !mention
    ? []
    : mention.kind === "@"
      ? members
          .filter(
            (m) =>
              m.handle.toLowerCase().startsWith(mention.query.toLowerCase()) ||
              m.display_name.toLowerCase().startsWith(mention.query.toLowerCase()),
          )
          .slice(0, 5)
          .map((m) => ({ key: m.id, insert: `@${m.handle}`, label: m.display_name, sub: `@${m.handle}`, member: m }))
      : (() => {
          const q = mention.query.toLowerCase().replace(/^me\//, `${me.handle.toLowerCase()}/`).replace(/^~/, `${me.handle.toLowerCase()}/`);
          const existing = tracks
            .filter((t) => t.slug.startsWith(q) || t.title.toLowerCase().includes(q))
            .slice(0, 4)
            .map((t) => ({
              key: t.id,
              insert: `#${t.slug}`,
              label: t.title,
              sub: `#${t.slug} · ${t.post_count} updates${t.owner ? ` · @${t.owner.handle}'s` : ""}`,
            }));
          const creates =
            /^[a-z][a-z0-9-]{1,40}$/.test(q)
              ? [
                  ...(!tracks.some((t) => t.slug === q)
                    ? [{ key: "new-c", insert: `#${q}`, label: `Start #${q}`, sub: "communal — anyone can post to it", isNew: true }]
                    : []),
                  ...(!tracks.some((t) => t.slug === `${me.handle.toLowerCase()}/${q}`)
                    ? [{ key: "new-p", insert: `#${me.handle.toLowerCase()}/${q}`, label: `Start #${me.handle.toLowerCase()}/${q}`, sub: "yours — only your posts join (shorthand #~)", isNew: true }]
                    : []),
                ]
              : [];
          return [...existing, ...creates];
        })();

  function syncMention(el: HTMLTextAreaElement) {
    const upToCaret = el.value.slice(0, el.selectionStart ?? el.value.length);
    const at = /(?:^|[\s(])@([a-zA-Z0-9_]{0,24})$/.exec(upToCaret);
    const hash = /(?:^|[\s(])#(~?(?:me\/)?[a-z0-9/_-]{0,45})$/.exec(upToCaret);
    if (at) {
      setMention({ kind: "@", query: at[1] ?? "", start: upToCaret.length - (at[1]?.length ?? 0) - 1 });
      setMentionIndex(0);
    } else if (hash && mode !== "html") {
      setMention({ kind: "#", query: hash[1] ?? "", start: upToCaret.length - (hash[1]?.length ?? 0) - 1 });
      setMentionIndex(0);
    } else {
      setMention(null);
    }
  }

  function pickMention(pick: Pick) {
    if (!mention) return;
    const after = body.slice(mention.start + 1 + mention.query.length);
    const next = `${body.slice(0, mention.start)}${pick.insert} ${after}`;
    setBody(next);
    setMention(null);
    const caret = mention.start + pick.insert.length + 1;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(caret, caret);
      }
    });
  }

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
        <div className="relative min-w-0 flex-1">
          {mention && suggestions.length > 0 && (
            <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-20 w-80 overflow-hidden rounded-xl border bg-popover p-1 shadow-xl animate-in fade-in-0 zoom-in-95">
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {mention.kind === "@" ? "Ask someone — their agent gets it via catch_up" : "Link to a track — the story of one thing"}
              </p>
              {suggestions.map((p, i) => (
                <button
                  key={p.key}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickMention(p);
                  }}
                  onMouseEnter={() => setMentionIndex(i)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left",
                    i === mentionIndex && "bg-accent",
                  )}
                >
                  {p.member ? (
                    <Avatar handle={p.member.handle} name={p.member.display_name} className="size-6 text-[10px]" />
                  ) : (
                    <span className={cn("flex size-6 items-center justify-center rounded-full border text-xs", p.isNew ? "text-emerald-500 border-emerald-500/40" : "text-emerald-500")}>#</span>
                  )}
                  <span className="truncate text-sm font-medium">{p.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{p.sub}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`;
              syncMention(e.target);
            }}
            onClick={(e) => syncMention(e.currentTarget)}
            onKeyDown={(e) => {
              if (mention && suggestions.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIndex((i) => (i + 1) % suggestions.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  const pick = suggestions[mentionIndex];
                  if (pick) pickMention(pick);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setMention(null);
                  return;
                }
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            onBlur={() => setTimeout(() => setMention(null), 150)}
            rows={1}
            placeholder={placeholder}
            className="min-h-9 w-full resize-none rounded-xl border border-input bg-transparent px-3.5 py-2 text-[15px] shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>
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
