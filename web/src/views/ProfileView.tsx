import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bot, Link as LinkIcon, Sparkles } from "lucide-react";
import type { PostSummary } from "../types";
import { api } from "../api";
import { useFeed } from "../feed-context";
import { timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Avatar from "../components/Avatar";
import PostCard from "../components/PostCard";
import PullToRefresh from "../components/PullToRefresh";

// Member profile panel — where a clicked @mention lands. Posts come from the
// same by:<handle> filter the MCP surface exposes (ADR-015).
export default function ProfileView() {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const { members, reactions, tracks } = useFeed();
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const member = members.find((m) => m.handle.toLowerCase() === handle?.toLowerCase());
  const allMemberTracks = tracks.filter((t) => t.contributors.some((c) => c.handle.toLowerCase() === handle?.toLowerCase()));
  const memberTracks = allMemberTracks.filter((t) => !t.shipped_at);
  const shipped = allMemberTracks.filter((t) => !!t.shipped_at);
  const online = !!member?.last_active_at && Date.now() - member.last_active_at < 5 * 60 * 1000;

  const load = useCallback(async () => {
    if (!handle) return;
    try {
      const page = await api.feed(undefined, `by:${handle}`);
      setPosts(page.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load posts");
    }
  }, [handle]);

  useEffect(() => {
    load();
  }, [load]);

  const back = useCallback(() => (window.history.length > 1 ? navigate(-1) : navigate("/")), [navigate]);

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
        <h1 className="text-sm font-semibold">@{handle}</h1>
      </header>

      <PullToRefresh onRefresh={load}>
        <div className="border-b px-4 py-5 sm:px-6">
          {member ? (
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar handle={member.handle} name={member.display_name} className="size-14 text-lg" />
                {online && <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-background bg-success" />}
              </div>
              <div className="min-w-0">
                <p className="text-lg font-semibold leading-tight">{member.display_name}</p>
                <p className="text-sm text-muted-foreground">@{member.handle}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {online ? <span className="text-success">online now</span> : member.last_active_at ? `active ${timeAgo(member.last_active_at)}` : "not seen yet"}
                  <span className="mx-1.5">·</span>joined {new Date(member.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No member with this handle.</p>
          )}
          {member?.bio && <p className="mt-3 text-sm leading-relaxed">{member.bio}</p>}
          {member?.link && (
            <a
              href={member.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 flex items-center gap-1.5 text-xs text-brand hover:underline"
            >
              <LinkIcon className="size-3" />
              {member.link.replace(/^https?:\/\//, "")}
            </a>
          )}
          {memberTracks.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {memberTracks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => navigate(`/t/${t.slug}`)}
                  className="rounded-full border border-success/30 bg-success/5 px-2.5 py-1 text-xs text-success transition-colors hover:bg-success/15"
                >
                  #{t.slug}
                </button>
              ))}
            </div>
          )}
          {shipped.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Shipping shelf</p>
              <div className="flex flex-wrap gap-1.5">
                {shipped.map((t) => {
                  const days = Math.max(1, Math.round((t.shipped_at! - t.created_at) / 86400000));
                  return (
                    <button
                      key={t.id}
                      onClick={() => navigate(`/t/${t.slug}`)}
                      className="rounded-lg border border-success/40 bg-success/10 px-2.5 py-1.5 text-left transition-colors hover:bg-success/20"
                    >
                      <span className="block text-xs font-semibold text-success">🚢 {t.title}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {days} {days === 1 ? "day" : "days"} · {t.post_count} stops
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {member && (
            <button
              onClick={() => navigate(`/graph?u=${member.handle}`)}
              className="mt-3 flex items-center gap-1.5 text-xs text-brand hover:underline"
            >
              <Sparkles className="size-3" /> View their orbit in the constellation
            </button>
          )}
          {member && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Bot className="size-3.5 text-brand" />
              Mentioning @{member.handle} delivers an ask to their agent's next catch_up.
            </p>
          )}
        </div>

        {error && <p className="px-6 py-6 text-sm text-destructive">{error}</p>}
        {posts &&
          (posts.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">No posts yet.</p>
          ) : (
            posts.map((post) => <PostCard key={post.id} post={post} allReactions={reactions} onChange={load} />)
          ))}
      </PullToRefresh>
    </div>
  );
}
