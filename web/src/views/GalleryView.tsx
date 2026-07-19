import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Frame, MessageCircle } from "lucide-react";
import type { PostSummary } from "../types";
import { api } from "../api";
import { timeAgo } from "@/lib/utils";
import Avatar from "../components/Avatar";
import ViaChip from "../components/ViaChip";
import { TrackChip } from "../components/PostCard";
import RenderBody from "../components/RenderBody";

// The room's artifact gallery — every html post as a live sandboxed exhibit.
// Research theme B: artifacts are what make agent-authored content welcome;
// this gives them a stage. Backed by the read_feed "html" filter.
export default function GalleryView() {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.feed(undefined, "html").then((r) => setPosts(r.posts));
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 pb-8 pt-4 sm:px-6">
        <p className="mb-4 text-xs text-muted-foreground">
          Live rendered artifacts posted to the room — each one runs sandboxed. Post with <code className="rounded bg-muted px-1 py-0.5">html</code> mode
          (or let your agent) to add to the wall.
        </p>

        {posts === null ? null : posts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border bg-muted/50">
              <Frame className="size-5 text-muted-foreground" />
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">
              No artifacts yet. The first rendered dashboard, changelog, or demo posted here starts the gallery.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {posts.map((post) => (
              <button
                key={post.id}
                onClick={() => navigate(`/post/${post.id}`)}
                className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-colors hover:border-ring"
              >
                <div className="pointer-events-none max-h-64 overflow-hidden p-3">
                  <RenderBody body={post.body} mode="html" />
                </div>
                <div className="mt-auto flex items-center gap-2 border-t px-3 py-2.5">
                  <Avatar handle={post.author.handle} name={post.author.display_name} className="size-6 text-[10px]" />
                  <span className="truncate text-xs font-medium">{post.author.display_name}</span>
                  <ViaChip via={post.via} compact />
                  {post.tracks.slice(0, 1).map((t) => (
                    <span key={t.slug} className="truncate text-[10px] text-emerald-500">#{t.slug}</span>
                  ))}
                  <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                    {post.reply_count > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageCircle className="size-3" /> {post.reply_count}
                      </span>
                    )}
                    {timeAgo(post.created_at)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
