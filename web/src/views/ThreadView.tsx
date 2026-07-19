import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { PostSummary, Reply } from "../types";
import { api } from "../api";
import { useFeed } from "../feed-context";
import { timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import Avatar from "../components/Avatar";
import RenderBody from "../components/RenderBody";
import Composer from "../components/Composer";
import { ReactionBar, ReplyItem, TrackChip } from "../components/PostCard";

// Twitter-style thread page: go in from the feed, return with the back arrow.
export default function ThreadView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { reactions, refresh: refreshFeed } = useFeed();
  const [post, setPost] = useState<PostSummary | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getPost(id);
      setPost(data.post);
      setReplies(data.replies);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load post");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const onChange = useCallback(async () => {
    await Promise.all([load(), refreshFeed()]);
  }, [load, refreshFeed]);

  const back = useCallback(() => (window.history.length > 1 ? navigate(-1) : navigate("/")), [navigate]);

  // Esc closes the thread — pairs with j/k/enter feed navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "Escape" && target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2.5 sm:px-4">
        <Button variant="ghost" size="icon-sm" onClick={back} title="Back">
          <ArrowLeft />
        </Button>
        <div className="leading-tight">
          <h1 className="text-sm font-semibold">Thread</h1>
          {post && (
            <p className="text-xs text-muted-foreground">
              {post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}
            </p>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {error && <p className="px-6 py-8 text-sm text-destructive">{error}</p>}
        {post && (
          <>
            <div className="px-4 pb-4 pt-5 sm:px-6">
              <div className="flex items-center gap-3">
                <Avatar handle={post.author.handle} name={post.author.display_name} className="size-10" />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-semibold">{post.author.display_name}</p>
                  <p className="truncate text-xs text-muted-foreground">@{post.author.handle}</p>
                </div>
                {post.render_mode !== "text" && (
                  <Badge variant={post.render_mode === "html" ? "brand" : "outline"}>
                    {post.render_mode === "markdown" ? "md" : post.render_mode}
                  </Badge>
                )}
              </div>

              <div className="mt-4 text-[15px]">
                <RenderBody body={post.body} mode={post.render_mode} variant="full" />
              </div>

              <p className="mt-3 text-xs text-muted-foreground" title={new Date(post.created_at).toLocaleString()}>
                {new Date(post.created_at).toLocaleString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                <span className="mx-1.5">·</span>
                {timeAgo(post.created_at)}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ReactionBar targetId={post.id} reactions={post.reactions} allReactions={reactions} onChange={onChange} />
                {post.tracks.map((t) => (
                  <TrackChip key={t.slug} track={t} />
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-5 px-4 py-5 sm:px-6">
              {replies.length === 0 ? (
                <p className="text-sm text-muted-foreground">No replies yet.</p>
              ) : (
                replies.map((reply) => <ReplyItem key={reply.id} reply={reply} allReactions={reactions} onChange={onChange} />)
              )}
            </div>
          </>
        )}
      </div>

      <Composer
        placeholder="Reply (markdown ok)…"
        defaultMode="markdown"
        postId={id}
        onSubmit={async (body, mode) => {
          if (!id) return;
          await api.createReply(id, body, mode);
          await onChange();
        }}
      />
    </div>
  );
}
