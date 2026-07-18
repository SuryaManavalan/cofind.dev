import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Plus } from "lucide-react";
import type { PostSummary, ReactionSummary, Reply } from "../types";
import { api } from "../api";
import { cn, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import Avatar from "./Avatar";
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

  async function toggle(emoji: string) {
    setPicking(false);
    await api.react(targetId, emoji);
    onChange();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {reactions.map((r) => (
        <button
          key={r.reaction}
          onClick={() => toggle(r.reaction)}
          className={cn(
            "flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs tabular-nums transition-colors",
            r.reacted_by_me
              ? "border-brand/40 bg-brand/10 text-foreground"
              : "border-border bg-transparent text-muted-foreground hover:border-ring hover:text-foreground",
          )}
        >
          <span className="text-sm leading-none">{r.reaction}</span> {r.count}
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setPicking(!picking)}
          className="flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
          title="Add reaction"
        >
          <Plus className="size-3.5" />
        </button>
        {picking && (
          <div className="absolute bottom-9 left-0 z-10 flex gap-0.5 rounded-xl border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95">
            {allReactions.map((emoji) => (
              <button key={emoji} onClick={() => toggle(emoji)} className="rounded-lg p-1.5 text-lg leading-none hover:bg-accent">
                {emoji}
              </button>
            ))}
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

  const open = () => navigate(`/post/${post.id}`);

  async function loadPreview() {
    const { replies } = await api.getPost(post.id);
    setPreview(replies.slice(0, REPLY_PREVIEW_COUNT));
  }

  async function togglePreview(e: React.MouseEvent) {
    e.stopPropagation();
    if (preview) setPreview(null);
    else await loadPreview();
  }

  return (
    <article
      onClick={open}
      className="group cursor-pointer border-b px-4 py-4 transition-colors hover:bg-accent/40 sm:px-6"
    >
      <div className="flex gap-3">
        <Avatar handle={post.author.handle} name={post.author.display_name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold">{post.author.display_name}</span>
            <span className="text-muted-foreground">@{post.author.handle}</span>
            <span className="text-muted-foreground/60">·</span>
            <span className="text-muted-foreground" title={new Date(post.created_at).toLocaleString()}>
              {timeAgo(post.created_at)}
            </span>
            <ViaChip via={post.via} />
            {post.edited_at && (
              <span
                className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500"
                title={`Updated ${new Date(post.edited_at).toLocaleString()} — a living post`}
              >
                updated {timeAgo(post.edited_at)}
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

          <div className="mt-3 flex items-center gap-2">
            <ReactionBar targetId={post.id} reactions={post.reactions} allReactions={allReactions} onChange={onChange} />
            <button
              onClick={post.reply_count > 0 ? togglePreview : open}
              className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MessageCircle className="size-3.5" />
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
    </article>
  );
}
