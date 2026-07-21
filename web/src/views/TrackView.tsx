import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowDownUp, ArrowLeft, Check, Flame, Pencil, Ship } from "lucide-react";
import type { PostSummary, RelatedTrack, TrackSummary, Toast } from "../types";
import { api } from "../api";
import { useFeed } from "../feed-context";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Avatar from "../components/Avatar";
import PostCard from "../components/PostCard";
import PullToRefresh from "../components/PullToRefresh";
import Composer from "../components/Composer";
import LineWidget from "../components/LineWidget";
import { burst, fireworks } from "@/lib/juice";

// A track is the story of one thing being built. Newest-first by default
// (consistent with the whole app); "from the start" toggle for narrative reads.
export default function TrackView() {
  const params = useParams<{ ns?: string; slug: string }>();
  const slug = params.ns ? `${params.ns}/${params.slug}` : params.slug;
  const navigate = useNavigate();
  const { me, reactions, refresh: refreshFeed } = useFeed();
  const [track, setTrack] = useState<TrackSummary | null>(null);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [related, setRelated] = useState<RelatedTrack[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toastDraft, setToastDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState("");
  const [oldestFirst, setOldestFirst] = useState(() => localStorage.getItem("cofind-track-order") === "story");

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const data = await api.getTrack(slug);
      setTrack(data.track);
      setPosts(data.posts);
      setRelated(data.related);
      setToasts(data.toasts);
      setDesc(data.track.description ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load track");
    }
  }, [slug]);

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

  async function saveDesc() {
    if (!slug) return;
    const { track: updated } = await api.updateTrack(slug, { description: desc });
    setTrack(updated);
    setEditing(false);
  }

  function toggleOrder() {
    const next = !oldestFirst;
    setOldestFirst(next);
    localStorage.setItem("cofind-track-order", next ? "story" : "latest");
  }

  async function sendToast() {
    if (!slug || !toastDraft?.trim()) return;
    await api.toast(slug, toastDraft.trim());
    setToastDraft(null);
    burst(window.innerWidth / 2, window.innerHeight / 3, 24);
    await load();
  }

  async function toggleShip() {
    if (!slug || !track) return;
    const verb = track.shipped_at ? "Reopen this track?" : "Ship this track? Its story closes and no new stops can join.";
    if (!confirm(verb)) return;
    const { track: updated } = await api.shipTrack(slug, !track.shipped_at);
    setTrack(updated);
    if (updated.shipped_at) fireworks(1.5);
    refreshFeed();
  }

  const isShipped = !!track?.shipped_at;
  const isPersonal = !!track?.owner;
  const canPost = !isShipped && (!isPersonal || track?.owner?.handle.toLowerCase() === me.handle.toLowerCase());
  const canShip =
    !!track && (isPersonal ? track.owner!.handle.toLowerCase() === me.handle.toLowerCase() : track.contributors.some((c) => c.handle === me.handle));
  const hot = !!track && !isShipped && track.recent_count >= 3;
  const daysBuilt = track ? Math.max(1, Math.round(((track.shipped_at ?? Date.now()) - track.created_at) / 86400000)) : 0;

  const ordered = oldestFirst ? posts : [...posts].reverse();
  const latestIdx = oldestFirst ? posts.length - 1 : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2.5 sm:px-4">
        <Button variant="ghost" size="icon-sm" onClick={back} title="Back">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 leading-tight">
          <h1 className="flex items-center gap-1.5 truncate text-sm font-semibold">
            {track?.owner && <Avatar handle={track.owner.handle} name={track.owner.display_name} className="size-4.5 text-[8px]" />}
            <span className="truncate">{track?.title ?? slug}</span>
            <span className="shrink-0 font-normal text-success">#{slug}</span>
            {track?.owner && (
              <span
                className="shrink-0 rounded-full border border-success/30 px-1.5 text-[10px] font-medium text-success"
                title={`Personal track — only @${track.owner.handle}'s posts join`}
              >
                @{track.owner.handle}'s
              </span>
            )}
            {hot && <Flame className="size-3.5 shrink-0 text-warning" aria-label="Momentum: 3+ stops this week" />}
            {isShipped && (
              <span className="shrink-0 rounded-full border border-success/50 bg-success/15 px-1.5 text-[10px] font-bold text-success">
                🚢 shipped
              </span>
            )}
          </h1>
          {track && (
            <p className="text-xs text-muted-foreground">
              {track.post_count} {track.post_count === 1 ? "stop" : "stops"} ·{" "}
              {isShipped ? `built in ${daysBuilt} ${daysBuilt === 1 ? "day" : "days"}` : `started ${timeAgo(track.created_at)}`}
            </p>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <div className="flex -space-x-1.5">
            {track?.contributors.slice(0, 5).map((a) => (
              <Avatar key={a.id} handle={a.handle} name={a.display_name} className="size-6 text-[10px] ring-2 ring-background" />
            ))}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={toggleOrder} title={oldestFirst ? "Show newest first" : "Read from the start"}>
            <ArrowDownUp />
          </Button>
          {canShip && (
            <Button
              variant={isShipped ? "ghost" : "outline"}
              size="sm"
              onClick={toggleShip}
              title={isShipped ? "Reopen the story" : "Close the story — tip: have your agent post a retrospective first"}
            >
              <Ship /> {isShipped ? "Reopen" : "Ship it"}
            </Button>
          )}
        </div>
      </header>

      <PullToRefresh onRefresh={load}>
        {error && <p className="px-6 py-8 text-sm text-destructive">{error}</p>}

        {track && <LineWidget key={track.id} track={track} onChanged={refreshFeed} />}

        {/* Toasts (ADR-024): the room gathers around a ship. */}
        {track && isShipped && (
          <div className="border-b bg-gradient-to-b from-success/[0.04] to-transparent px-4 py-3 sm:px-6">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              🥂 Toasts
            </h3>
            {toasts.length > 0 && (
              <ul className="space-y-1.5">
                {toasts.map((t) => (
                  <li key={t.handle} className="flex items-start gap-2 text-sm">
                    <Avatar handle={t.handle} name={t.display_name} className="mt-0.5 size-5 text-[9px]" />
                    <span className="leading-snug">
                      <span className="font-semibold">@{t.handle}</span>{" "}
                      <span className="text-foreground/90">{t.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!toasts.some((t) => t.handle.toLowerCase() === me.handle.toLowerCase()) &&
              !(track.owner ? track.owner.handle.toLowerCase() === me.handle.toLowerCase() : track.contributors.some((c) => c.handle === me.handle)) && (
                <div className="mt-2">
                  {toastDraft === null ? (
                    <button
                      onClick={() => setToastDraft("")}
                      className="rounded-full border border-success/30 bg-success/5 px-3 py-1 text-xs text-success transition-colors hover:bg-success/15"
                    >
                      🥂 Raise a toast
                    </button>
                  ) : (
                    <div className="flex gap-1.5">
                      <Input
                        value={toastDraft}
                        onChange={(e) => setToastDraft(e.target.value)}
                        placeholder="One line for the shipper — make it specific"
                        maxLength={140}
                        autoFocus
                        onKeyDown={(e) => e.key === "Enter" && sendToast()}
                      />
                      <Button size="sm" className="h-9 shrink-0" onClick={sendToast} disabled={!toastDraft.trim()}>
                        Toast
                      </Button>
                    </div>
                  )}
                </div>
              )}
          </div>
        )}

        {track && (
          <div className="border-b px-4 py-3 sm:px-6">
            {editing ? (
              <div className="flex items-center gap-2">
                <Input
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveDesc()}
                  placeholder="What is this track about?"
                  className="h-8 text-sm"
                  autoFocus
                />
                <Button size="icon-sm" variant="ghost" onClick={saveDesc} title="Save">
                  <Check />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                title="Edit description"
              >
                {track.description ?? <span className="italic">Add a description…</span>}
                <Pencil className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
            {related.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">crosses</span>
                {related.map((r) => (
                  <button
                    key={r.slug}
                    onClick={() => navigate(`/t/${r.slug}`)}
                    className="rounded-full border border-success/30 bg-success/5 px-2 py-0.5 text-[11px] text-success transition-colors hover:bg-success/15"
                    title={`${r.shared_posts} shared ${r.shared_posts === 1 ? "post" : "posts"} · ${r.shared_contributors} shared ${r.shared_contributors === 1 ? "contributor" : "contributors"}`}
                  >
                    #{r.slug}
                    {r.shared_posts > 0 && <span className="ml-1 opacity-70">⤫{r.shared_posts}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* the timeline: a literal track down the left, one stop per update;
            dots scale with reactions — the story shows its peaks */}
        <div className="relative px-2 py-4 sm:px-4">
          <div
            className={cn(
              "absolute bottom-4 left-[26px] top-4 w-px sm:left-[34px]",
              isShipped
                ? "bg-success/60"
                : oldestFirst
                  ? "bg-gradient-to-b from-border via-border to-success/60"
                  : "bg-gradient-to-b from-success/60 via-border to-border",
            )}
          />
          {ordered.map((post, i) => {
            const reactionWeight = post.reactions.reduce((a, r) => a + r.count, 0);
            return (
              <div key={post.id} className="relative pl-8 sm:pl-10">
                <span
                  className={cn(
                    "absolute left-[22px] top-7 rounded-full border-2 border-background sm:left-[30px]",
                    i === latestIdx ? "bg-success" : "bg-muted-foreground/50",
                    reactionWeight >= 3 ? "size-3.5 -translate-x-0.5" : reactionWeight >= 1 ? "size-3 -translate-x-px" : "size-2.5",
                  )}
                  title={reactionWeight > 0 ? `${reactionWeight} reactions — a peak` : undefined}
                />
                <div className="mb-1 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {new Date(post.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  {i === latestIdx && <span className="ml-2 font-semibold text-success">latest</span>}
                </div>
                <div className="overflow-hidden rounded-xl border bg-card/50">
                  <PostCard post={post} allReactions={reactions} onChange={load} />
                </div>
              </div>
            );
          })}
        </div>
      </PullToRefresh>

      {canPost && slug && (
        <Composer
          placeholder={`Add the next stop on #${slug}…`}
          defaultMode="markdown"
          onSubmit={async (body, mode, vibe) => {
            await api.createPost(body, mode, [slug], vibe);
            await Promise.all([load(), refreshFeed()]);
          }}
        />
      )}
      {!canPost && isShipped && (
        <div className="border-t px-6 py-3 text-center text-xs text-muted-foreground">
          🚢 This story is shipped — {daysBuilt} days, {track?.post_count} stops. Reactions and replies stay open.
        </div>
      )}
      {!canPost && !isShipped && isPersonal && (
        <div className="border-t px-6 py-3 text-center text-xs text-muted-foreground">
          Only @{track?.owner?.handle} posts here — reply on a stop to join the conversation.
        </div>
      )}
    </div>
  );
}
