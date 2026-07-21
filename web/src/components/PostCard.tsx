import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Plus, Zap } from "lucide-react";
import type { PostSummary, ReactionSummary, Reply, TrackRef } from "../types";
import { api } from "../api";
import { burst } from "@/lib/juice";
import { haptic } from "@/lib/haptics";
import { REACTION_ICONS, VIBE_ICONS } from "@/lib/icons";
import { RiShip2Fill } from "@remixicon/react";
import { cn, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFeed } from "../feed-context";
import Avatar from "./Avatar";
import { ConvictionAmount, ConvictionCoin } from "./Conviction";
import ViaChip from "./ViaChip";
import RenderBody from "./RenderBody";

export function ReactionBar({
  targetId,
  reactions,
  allReactions,
  onChange,
}: {
  targetId: string;
  reactions: ReactionSummary[];
  allReactions: string[];
  onChange: () => void;
}) {
  const [picking, setPicking] = useState(false);

  async function toggle(emoji: string, e?: React.MouseEvent) {
    setPicking(false);
    haptic("light");
    const adding = !reactions.find((r) => r.reaction === emoji)?.reacted_by_me;
    await api.react(targetId, emoji);
    if (adding && e) burst(e.clientX, e.clientY, 10);
    onChange();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {reactions.map((r) => (
        <button
          key={r.reaction}
          onClick={(e) => toggle(r.reaction, e)}
          className={cn(
            "flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] tabular-nums transition-colors",
            r.reacted_by_me
              ? "border-brand/40 bg-brand/10 text-foreground"
              : "border-border bg-transparent text-muted-foreground hover:border-ring hover:text-foreground",
          )}
        >
          {REACTION_ICONS[r.reaction] ? (
            (() => {
              const meta = REACTION_ICONS[r.reaction]!;
              const RIcon = meta.Icon;
              return <RIcon className={cn("size-3.5", meta.color)} />;
            })()
          ) : (
            <span className="text-sm leading-none">{r.reaction}</span>
          )}{" "}
          {r.count}
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setPicking(!picking)}
          className="flex size-6 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
          title="Add reaction"
        >
          <Plus className="size-3" />
        </button>
        {picking && (
          <div className="absolute bottom-9 left-0 z-10 flex gap-0.5 rounded-xl border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95">
            {allReactions.map((emoji) => {
              const meta = REACTION_ICONS[emoji];
              const RIcon = meta?.Icon;
              return (
                <button
                  key={emoji}
                  onClick={(e) => toggle(emoji, e)}
                  title={meta?.label ?? emoji}
                  className="rounded-lg p-2 leading-none transition-all hover:bg-accent active:scale-90"
                >
                  {RIcon ? <RIcon className={cn("size-4.5", meta!.color)} /> : <span className="text-lg">{emoji}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ReplyItem({
  reply,
  allReactions,
  onChange,
  compact = false,
}: {
  reply: Reply;
  allReactions: string[];
  onChange: () => void;
  compact?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <Avatar handle={reply.author.handle} name={reply.author.display_name} className={compact ? "size-7 text-xs" : "size-8 text-xs"} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-foreground">{reply.author.display_name}</span>
          <span className="text-muted-foreground">@{reply.author.handle}</span>
          <span className="text-muted-foreground">{timeAgo(reply.created_at)}</span>
          <ViaChip via={reply.via} compact />
        </div>
        <div className="mt-0.5">
          <RenderBody body={reply.body} mode={reply.render_mode} variant={compact ? "preview" : "full"} />
        </div>
        {!compact && (
          <div className="mt-1.5">
            <ReactionBar targetId={reply.id} reactions={reply.reactions} allReactions={allReactions} onChange={onChange} />
          </div>
        )}
      </div>
    </div>
  );
}

// Chip with a hover peek: last stops + count, without leaving the feed.
export function TrackChip({ track }: { track: TrackRef }) {
  const navigate = useNavigate();
  const [peek, setPeek] = useState<{ count: number; shipped: boolean; stops: { id: string; line: string; ago: string }[] } | null>(null);
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function enter() {
    timer.current = setTimeout(async () => {
      setShow(true);
      if (!peek) {
        try {
          const { track: t, posts } = await api.getTrack(track.slug);
          setPeek({
            count: t.post_count,
            shipped: !!t.shipped_at,
            stops: posts.slice(-3).reverse().map((p) => ({
              id: p.id,
              line: (p.render_mode === "html" ? "· rendered artifact" : p.body.split("\n")[0] ?? "").slice(0, 64),
              ago: timeAgo(p.created_at),
            })),
          });
        } catch {
          /* peek is best-effort */
        }
      }
    }, 350);
  }
  function leave() {
    if (timer.current) clearTimeout(timer.current);
    setShow(false);
  }

  return (
    <span className="relative" onPointerEnter={enter} onPointerLeave={leave}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/t/${track.slug}`);
        }}
        className="flex h-6 items-center rounded-full border border-success/25 bg-success/5 px-2 text-[11px] text-success transition-colors hover:bg-success/15"
      >
        #{track.slug}
      </button>
      {show && peek && (
        <span
          className="absolute bottom-9 left-0 z-20 block w-64 rounded-xl border bg-popover p-2.5 shadow-xl animate-in fade-in-0 zoom-in-95"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="mb-1.5 flex items-baseline gap-2 text-xs">
            <span className="font-semibold text-success">#{track.slug}</span>
            <span className="text-muted-foreground">
              {peek.count} stops{peek.shipped ? " · shipped" : ""}
              {peek.shipped && <RiShip2Fill className="ml-0.5 inline size-3 text-success" />}
            </span>
          </span>
          {peek.stops.map((st) => (
            <span key={st.id} className="block truncate text-[11px] leading-relaxed text-muted-foreground">
              <span className="text-foreground/70">{st.ago}</span> — {st.line}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

const REPLY_PREVIEW_COUNT = 3;

export default function PostCard({
  post,
  allReactions,
  onChange,
}: {
  post: PostSummary;
  allReactions: string[];
  onChange: () => void;
}) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Reply[] | null>(null);
  const { wallet, amplifyCost, amplifyMint, setWalletBalance } = useFeed();
  const [confirming, setConfirming] = useState(false);
  const [amplifying, setAmplifying] = useState(false);
  const [amplifyError, setAmplifyError] = useState<string | null>(null);

  const open = () => navigate(`/post/${post.id}`);

  async function loadPreview() {
    const { replies } = await api.getPost(post.id);
    setPreview(replies.slice(0, REPLY_PREVIEW_COUNT));
  }

  const balance = wallet?.balance ?? null;
  const canAfford = balance === null || balance >= amplifyCost;

  function askAmplify(e: React.MouseEvent) {
    e.stopPropagation();
    if (post.amplified_by_me) return;
    haptic("light");
    setAmplifyError(null);
    setConfirming(true);
  }

  async function doAmplify(e: React.MouseEvent) {
    if (amplifying) return;
    setAmplifying(true);
    setAmplifyError(null);
    const { clientX, clientY } = e;
    try {
      const res = await api.amplify(post.id);
      setWalletBalance(res.amplifier_balance);
      setConfirming(false);
      haptic("medium");
      burst(clientX, clientY, 22);
      onChange();
    } catch (err) {
      setAmplifyError(err instanceof Error ? err.message : "Couldn't amplify");
    } finally {
      setAmplifying(false);
    }
  }

  async function togglePreview(e: React.MouseEvent) {
    e.stopPropagation();
    if (preview) setPreview(null);
    else await loadPreview();
  }

  return (
    <article
      onClick={open}
      className={cn(
        "group cursor-pointer border-b px-4 py-4 transition-colors hover:bg-accent/40 sm:px-6",
        post.amplified_by.length > 0 && "bg-gradient-to-r from-brand/[0.05] via-transparent to-transparent shadow-[inset_2px_0_0_0_var(--brand)]",
      )}
    >
      <div className="flex gap-3">
        <Avatar handle={post.author.handle} name={post.author.display_name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold">{post.author.display_name}</span>
            <span className="text-muted-foreground">@{post.author.handle}</span>
            <span className="text-muted-foreground/60">·</span>
            <span className="text-muted-foreground" title={new Date(post.created_at).toLocaleString()}>
              {timeAgo(post.created_at)}
            </span>
            <ViaChip via={post.via} />
            {post.edited_at && (
              <span
                className="inline-flex h-5 items-center whitespace-nowrap rounded-full border border-success/25 bg-success/10 px-1.5 text-[10px] font-medium text-success"
                title={`Updated ${new Date(post.edited_at).toLocaleString()} — a living post`}
              >
                ↻ {timeAgo(post.edited_at)}
              </span>
            )}
            {post.vibe && VIBE_ICONS[post.vibe] && (
              <span
                className={cn("inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium", VIBE_ICONS[post.vibe]!.cls)}
                title={`vibe: ${VIBE_ICONS[post.vibe]!.label}`}
              >
                {(() => {
                  const VIcon = VIBE_ICONS[post.vibe!]!.Icon;
                  return <VIcon className="size-3" />;
                })()}
                {VIBE_ICONS[post.vibe]!.label}
              </span>
            )}
            {post.render_mode !== "text" && (
              <Badge variant={post.render_mode === "html" ? "brand" : "outline"} className="ml-auto">
                {post.render_mode === "markdown" ? "md" : post.render_mode}
              </Badge>
            )}
          </div>

          <div className="mt-1.5">
            <RenderBody body={post.body} mode={post.render_mode} />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
            <ReactionBar targetId={post.id} reactions={post.reactions} allReactions={allReactions} onChange={onChange} />
            {post.tracks.map((t) => (
              <TrackChip key={t.slug} track={t} />
            ))}
            <button
              onClick={askAmplify}
              disabled={post.amplified_by_me}
              title={post.amplified_by_me ? "You amplified this" : `Amplify — burn ${amplifyCost} conviction to make this moment glow`}
              className={cn(
                "group/amp flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] transition-all",
                post.amplified_by_me
                  ? "border-brand/40 bg-brand/15 text-brand"
                  : "border-border text-muted-foreground hover:border-brand/40 hover:text-brand active:scale-90",
              )}
            >
              <Zap className={cn("size-3", post.amplified_by.length > 0 && "fill-current")} />
              {post.amplified_by.length > 0 && <span className="tabular-nums">{post.amplified_by.length}</span>}
              {!post.amplified_by_me && (
                <span className="hidden max-w-0 items-center gap-0.5 overflow-hidden tabular-nums text-conviction opacity-0 transition-all duration-200 group-hover/amp:max-w-12 group-hover/amp:opacity-100 sm:inline-flex">
                  −{amplifyCost}
                  <ConvictionCoin className="size-2.5" />
                </span>
              )}
            </button>
            {post.amplified_by.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Amplified — they spent conviction on this">
                <ConvictionCoin className="size-2.5 text-conviction" /> {post.amplified_by.map((a) => `@${a.handle}`).join(" ")}
              </span>
            )}
            <button
              onClick={post.reply_count > 0 ? togglePreview : open}
              className="flex h-6 items-center gap-1.5 rounded-full px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MessageCircle className="size-3" />
              {post.reply_count > 0 ? post.reply_count : "Reply"}
            </button>
          </div>

          {preview && (
            <div className="mt-3 space-y-3 border-l-2 pl-4" onClick={(e) => e.stopPropagation()}>
              {preview.map((reply) => (
                <ReplyItem key={reply.id} reply={reply} allReactions={allReactions} onChange={loadPreview} compact />
              ))}
              <button onClick={open} className="text-xs font-medium text-brand hover:underline underline-offset-4">
                {post.reply_count > REPLY_PREVIEW_COUNT
                  ? `Show all ${post.reply_count} replies`
                  : "Open thread"}
              </button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={(o) => !amplifying && setConfirming(o)}>
        <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-full border border-conviction/30 bg-conviction/15">
              <ConvictionCoin className="size-5 text-conviction" />
            </div>
            <DialogTitle>Amplify this moment</DialogTitle>
            <DialogDescription>
              Burn <ConvictionAmount n={amplifyCost} className="font-semibold" coinClassName="size-3" />{" "}
              <span className="font-semibold text-conviction">conviction</span> to make @{post.author.handle}&apos;s post glow
              for the whole room. They mint <ConvictionAmount n={amplifyMint} delta className="font-semibold" coinClassName="size-3" />.
              Amplifies can&apos;t be taken back.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <ConvictionCoin className="size-3.5 text-conviction" /> Your conviction
            </span>
            {balance !== null ? (
              <span className="flex items-baseline gap-2 tabular-nums">
                <span className="font-semibold">{balance}</span>
                <span className="text-muted-foreground">→</span>
                <span className={cn("font-semibold", canAfford ? "text-conviction" : "text-destructive")}>
                  {Math.max(0, balance - amplifyCost)}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">…</span>
            )}
          </div>

          {!canAfford && (
            <p className="text-xs text-destructive">
              You need {amplifyCost} conviction to amplify — earn it by building and shipping.
            </p>
          )}
          {amplifyError && <p className="text-xs text-destructive">{amplifyError}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={amplifying} onClick={() => setConfirming(false)}>
              Not now
            </Button>
            <Button
              size="sm"
              disabled={!canAfford || amplifying}
              onClick={doAmplify}
              className="bg-brand text-background hover:bg-brand/90"
            >
              <ConvictionCoin className="!size-3.5" />
              {amplifying ? "Amplifying…" : `Burn ${amplifyCost} · Amplify`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}
