import { useCallback, useEffect, useRef, useState } from "react";
import type { PostSummary, User } from "./types";
import { api } from "./api";
import AuthScreen from "./components/AuthScreen";
import Composer from "./components/Composer";
import PostCard from "./components/PostCard";
import Settings from "./components/Settings";

const POLL_MS = 15_000; // v0 feed sync is polling (architecture doc §7); realtime comes later.

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [reactions, setReactions] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const seenSent = useRef(new Set<string>());

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  const refresh = useCallback(async () => {
    const page = await api.feed();
    setPosts((prev) => {
      // Replace first page; keep already-loaded older pages that fall past it.
      const pageIds = new Set(page.posts.map((p) => p.id));
      const oldest = page.posts[page.posts.length - 1];
      const tail = oldest ? prev.filter((p) => !pageIds.has(p.id) && p.created_at < oldest.created_at) : [];
      return [...page.posts, ...tail];
    });
    setNextCursor((prev) => prev ?? page.next_cursor);
  }, []);

  useEffect(() => {
    if (!user) return;
    api.meta().then((r) => setReactions(r.reactions));
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [user, refresh]);

  // Write the seen table early — cheap insurance for v2 "unseen surfaces sooner".
  useEffect(() => {
    if (!user || posts.length === 0) return;
    const unsent = posts.map((p) => p.id).filter((id) => !seenSent.current.has(id));
    if (unsent.length === 0) return;
    unsent.forEach((id) => seenSent.current.add(id));
    api.markSeen(unsent).catch(() => {});
  }, [user, posts]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.feed(nextCursor);
      setPosts((prev) => {
        const known = new Set(prev.map((p) => p.id));
        return [...prev, ...page.posts.filter((p) => !known.has(p.id))];
      });
      setNextCursor(page.next_cursor);
    } finally {
      setLoadingMore(false);
    }
  }

  async function logout() {
    await api.logout();
    setUser(null);
    setPosts([]);
    setShowSettings(false);
  }

  if (!authChecked) return null;
  if (!user) return <AuthScreen onAuthed={setUser} />;

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col">
      <header className="flex items-center justify-between border-b border-edge bg-panel/80 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <img src="/icon.svg" alt="" className="size-7 rounded-lg" />
          <span className="font-bold">cofind</span>
        </div>
        <button onClick={() => setShowSettings(true)} className="rounded-lg p-1.5 text-mist hover:bg-panel-2 hover:text-fog" title="settings">
          ⚙
        </button>
      </header>

      {/* Content flows top→down (ADR-002/003): newest at top, scroll down for older. */}
      <main className="flex-1 overflow-y-auto">
        {posts.length === 0 ? (
          <div className="flex h-full items-center justify-center px-8 text-center text-sm text-mist">
            Nothing here yet. Post what you're building — or let your agent do it.
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <PostCard key={post.id} post={post} allReactions={reactions} onChange={refresh} />
            ))}
            {nextCursor && (
              <button onClick={loadMore} disabled={loadingMore} className="w-full py-4 text-sm text-mist hover:text-fog">
                {loadingMore ? "loading…" : "load older posts"}
              </button>
            )}
          </>
        )}
      </main>

      <Composer onPosted={refresh} />

      {showSettings && <Settings user={user} onClose={() => setShowSettings(false)} onLogout={logout} />}
    </div>
  );
}
