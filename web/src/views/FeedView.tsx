import { Sparkles } from "lucide-react";
import { api } from "../api";
import { useFeed } from "../feed-context";
import PostCard from "../components/PostCard";
import Composer from "../components/Composer";
import { Button } from "@/components/ui/button";

export default function FeedView() {
  const { posts, reactions, refresh, loadMore, nextCursor, loadingMore } = useFeed();

  return (
    <div className="flex h-full flex-col">
      {/* Content flows top→down (ADR-002/003): newest at top, scroll down for older. */}
      <div className="flex-1 overflow-y-auto">
        {posts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border bg-muted/50">
              <Sparkles className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Nothing here yet. Post what you're building — or let your agent do it.
            </p>
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <PostCard key={post.id} post={post} allReactions={reactions} onChange={refresh} />
            ))}
            {nextCursor && (
              <div className="flex justify-center py-4">
                <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore} className="text-muted-foreground">
                  {loadingMore ? "Loading…" : "Load older posts"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <Composer
        placeholder="What are you building?"
        onSubmit={async (body, mode) => {
          await api.createPost(body, mode);
          await refresh();
        }}
      />
    </div>
  );
}
