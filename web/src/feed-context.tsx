import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AgentActivity, Member, PostSummary, TrackSummary, User } from "./types";
import { api } from "./api";

const POLL_MS = 15_000; // v0 feed sync is polling (architecture doc §7); realtime comes later.

interface FeedState {
  me: User;
  posts: PostSummary[];
  nextCursor?: string;
  loadingMore: boolean;
  reactions: string[];
  members: Member[];
  activity: AgentActivity[];
  tracks: TrackSummary[];
  initialUnseen: Set<string>;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

const FeedContext = createContext<FeedState | null>(null);

export function useFeed(): FeedState {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("useFeed outside FeedProvider");
  return ctx;
}

export function FeedProvider({ user, children }: { user: User; children: React.ReactNode }) {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [reactions, setReactions] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<AgentActivity[]>([]);
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const seenSent = useRef(new Set<string>());
  // Snapshot of what was unseen when the session opened — powers the
  // "caught up" divider even after we mark things seen.
  const initialUnseen = useRef<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    api.members().then((r) => setMembers(r.members)).catch(() => {});
    api.activity().then((r) => setActivity(r.activity)).catch(() => {});
    api.listTracks().then((r) => setTracks(r.tracks)).catch(() => {});
    const page = await api.feed();
    if (initialUnseen.current === null) {
      initialUnseen.current = new Set(page.posts.filter((p) => !p.seen_by_me).map((p) => p.id));
    }
    setPosts((prev) => {
      const pageIds = new Set(page.posts.map((p) => p.id));
      const oldest = page.posts[page.posts.length - 1];
      const tail = oldest ? prev.filter((p) => !pageIds.has(p.id) && p.created_at < oldest.created_at) : [];
      return [...page.posts, ...tail];
    });
    setNextCursor((prev) => prev ?? page.next_cursor);
  }, []);

  const loadMore = useCallback(async () => {
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
  }, [nextCursor, loadingMore]);

  useEffect(() => {
    api.meta().then((r) => setReactions(r.reactions));
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [user.id, refresh]);

  // Write the seen table early — cheap insurance for v2 "unseen surfaces sooner".
  useEffect(() => {
    if (posts.length === 0) return;
    const unsent = posts.map((p) => p.id).filter((id) => !seenSent.current.has(id));
    if (unsent.length === 0) return;
    unsent.forEach((id) => seenSent.current.add(id));
    api.markSeen(unsent).catch(() => {});
  }, [posts]);

  return (
    <FeedContext.Provider value={{ me: user, posts, nextCursor, loadingMore, reactions, members, activity, tracks, initialUnseen: initialUnseen.current ?? new Set(), refresh, loadMore }}>
      {children}
    </FeedContext.Provider>
  );
}
