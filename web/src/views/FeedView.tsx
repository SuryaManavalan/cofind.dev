import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { api } from "../api";
import { useFeed } from "../feed-context";
import { cn } from "@/lib/utils";
import PostCard from "../components/PostCard";
import Composer from "../components/Composer";
import { Button } from "@/components/ui/button";

export default function FeedView() {
  const { posts, reactions, refresh, loadMore, nextCursor, loadingMore } = useFeed();
  const navigate = useNavigate();
  const [selected, setSelected] = useState(-1);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Keyboard-first navigation: j/k to move, enter to open, esc (in thread) to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j") setSelected((s) => Math.min(s + 1, posts.length - 1));
      else if (e.key === "k") setSelected((s) => Math.max(s - 1, 0));
      else if (e.key === "Enter") {
        const post = posts[selected];
        if (post) navigate(`/post/${post.id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [posts, selected, navigate]);

  useEffect(() => {
    cardRefs.current[selected]?.scrollIntoView({ block: "nearest" });
  }, [selected]);

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
            {posts.map((post, i) => (
              <div
                key={post.id}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                className={cn(selected === i && "ring-2 ring-inset ring-brand/40")}
              >
                <PostCard post={post} allReactions={reactions} onChange={refresh} />
              </div>
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
        listenForPalette
        onSubmit={async (body, mode) => {
          await api.createPost(body, mode);
          await refresh();
        }}
      />
    </div>
  );
}
