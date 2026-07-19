import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { api } from "../api";
import { useFeed } from "../feed-context";
import { cn } from "@/lib/utils";
import PostCard from "../components/PostCard";
import Composer from "../components/Composer";
import PullToRefresh from "../components/PullToRefresh";
import { Button } from "@/components/ui/button";

// Survives across the thread overlay: on iOS a `position: fixed` overlay
// (the thread) drops the scroll offset of the feed underneath it, so we
// remember it here and put it back when the feed is the visible route again.
let feedScrollMemory = 0;

export default function FeedView() {
  const { posts, reactions, refresh, loadMore, nextCursor, loadingMore, initialUnseen } = useFeed();
  const navigate = useNavigate();
  const location = useLocation();
  const [selected, setSelected] = useState(-1);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // True only while the feed is the visible route — so we don't record the
  // scroll offset an overlay (thread) forces to 0 while it covers the feed.
  const active = useRef(location.pathname === "/");
  active.current = location.pathname === "/";

  // Remember where the feed is scrolled — but only while it's actually on top.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (active.current) feedScrollMemory = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // When the feed becomes the active route again (back from a thread/profile/
  // track), restore the remembered offset after layout settles.
  useEffect(() => {
    if (location.pathname !== "/") return;
    if (feedScrollMemory <= 0) return;
    const restore = () => {
      const el = scrollRef.current;
      if (el) el.scrollTop = feedScrollMemory;
    };
    const raf = requestAnimationFrame(() => requestAnimationFrame(restore));
    const timer = setTimeout(restore, 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [location.pathname]);

  // "Caught up" divider: sits between what was new when you arrived and
  // everything you'd already seen (powered by the seen table).
  const dividerIndex =
    initialUnseen.size > 0 && posts[0] && initialUnseen.has(posts[0].id)
      ? posts.findIndex((p) => !initialUnseen.has(p.id))
      : -1;

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
      <PullToRefresh onRefresh={refresh} scrollRef={scrollRef}>
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
              <div key={post.id}>
                {i === dividerIndex && i > 0 && (
                  <div className="flex items-center gap-3 px-6 py-2">
                    <div className="h-px flex-1 bg-brand/30" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-brand">caught up</span>
                    <div className="h-px flex-1 bg-brand/30" />
                  </div>
                )}
                <div
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  className={cn(selected === i && "ring-2 ring-inset ring-brand/40")}
                >
                  <PostCard post={post} allReactions={reactions} onChange={refresh} />
                </div>
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
      </PullToRefresh>

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
