import { useState } from "react";
import type { PostSummary, Reply } from "../types";
import { api } from "../api";
import RenderBody from "./RenderBody";

const AVATAR_COLORS = ["#6ee7b7", "#818cf8", "#f9a8d4", "#fcd34d", "#7dd3fc", "#fca5a5"];

export function Avatar({ handle, name }: { handle: string; name: string }) {
  const color = AVATAR_COLORS[[...handle].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <div
      className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-ink"
      style={{ background: color }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function ReactionBar({
  targetId,
  reactions,
  allReactions,
  onChange,
}: {
  targetId: string;
  reactions: PostSummary["reactions"];
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
    <div className="flex flex-wrap items-center gap-1.5">
      {reactions.map((r) => (
        <button
          key={r.reaction}
          onClick={() => toggle(r.reaction)}
          className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
            r.reacted_by_me ? "border-iris/60 bg-iris/15 text-snow" : "border-edge bg-panel-2 text-fog hover:border-mist"
          }`}
        >
          {r.reaction} {r.count}
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setPicking(!picking)}
          className="rounded-full border border-edge px-2 py-0.5 text-xs text-mist hover:border-mist hover:text-fog"
          title="react"
        >
          +
        </button>
        {picking && (
          <div className="absolute bottom-7 left-0 z-10 flex gap-1 rounded-xl border border-edge bg-panel-2 p-1.5 shadow-xl">
            {allReactions.map((emoji) => (
              <button key={emoji} onClick={() => toggle(emoji)} className="rounded-lg p-1 text-lg hover:bg-edge">
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PostCard({
  post,
  allReactions,
  onChange,
}: {
  post: PostSummary;
  allReactions: string[];
  onChange: () => void;
}) {
  const [thread, setThread] = useState<Reply[] | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  async function loadThread() {
    const { replies } = await api.getPost(post.id);
    setThread(replies);
  }

  async function toggleThread() {
    if (thread) setThread(null);
    else await loadThread();
  }

  async function sendReply() {
    const body = replyText.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await api.createReply(post.id, body);
      setReplyText("");
      await loadThread();
      onChange();
    } finally {
      setSending(false);
    }
  }

  return (
    <article className="border-b border-edge px-4 py-3 transition-colors hover:bg-panel/60">
      <div className="flex gap-3">
        <Avatar handle={post.author.handle} name={post.author.display_name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="font-semibold">{post.author.display_name}</span>
            <span className="text-mist">@{post.author.handle}</span>
            <span className="text-mist">·</span>
            <span className="text-mist" title={new Date(post.created_at).toLocaleString()}>
              {timeAgo(post.created_at)}
            </span>
            {post.render_mode !== "text" && (
              <span className="ml-auto rounded border border-edge px-1.5 py-px text-[10px] uppercase tracking-wide text-mist">
                {post.render_mode}
              </span>
            )}
          </div>
          <div className="mt-1">
            <RenderBody body={post.body} mode={post.render_mode} />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <ReactionBar targetId={post.id} reactions={post.reactions} allReactions={allReactions} onChange={onChange} />
            <button onClick={toggleThread} className="text-xs text-mist hover:text-fog">
              {thread ? "hide replies" : post.reply_count > 0 ? `${post.reply_count} ${post.reply_count === 1 ? "reply" : "replies"}` : "reply"}
            </button>
          </div>

          {thread && (
            <div className="mt-3 space-y-3 border-l-2 border-edge pl-3">
              {thread.map((reply) => (
                <div key={reply.id} className="flex gap-2">
                  <Avatar handle={reply.author.handle} name={reply.author.display_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 text-xs">
                      <span className="font-semibold text-snow">{reply.author.display_name}</span>
                      <span className="text-mist">@{reply.author.handle}</span>
                      <span className="text-mist">{timeAgo(reply.created_at)}</span>
                    </div>
                    <div className="mt-0.5">
                      <RenderBody body={reply.body} mode={reply.render_mode} />
                    </div>
                    <div className="mt-1">
                      <ReactionBar
                        targetId={reply.id}
                        reactions={reply.reactions}
                        allReactions={allReactions}
                        onChange={loadThread}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendReply()}
                  placeholder="Reply (markdown ok)…"
                  className="min-w-0 flex-1 rounded-lg border border-edge bg-panel-2 px-3 py-1.5 text-sm outline-none placeholder:text-mist focus:border-mist"
                />
                <button
                  onClick={sendReply}
                  disabled={!replyText.trim() || sending}
                  className="rounded-lg bg-iris/90 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-iris disabled:opacity-40"
                >
                  Reply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
