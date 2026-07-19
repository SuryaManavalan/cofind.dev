import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Pencil } from "lucide-react";
import type { PostSummary, TrackSummary } from "../types";
import { api } from "../api";
import { useFeed } from "../feed-context";
import { timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Avatar from "../components/Avatar";
import PostCard from "../components/PostCard";

// A track reads oldest-first — it's the story of one thing being built,
// rendered as a literal timeline. The feed covers recency; this covers narrative.
export default function TrackView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { reactions } = useFeed();
  const [track, setTrack] = useState<TrackSummary | null>(null);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState("");

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const data = await api.getTrack(slug);
      setTrack(data.track);
      setPosts(data.posts);
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2.5 sm:px-4">
        <Button variant="ghost" size="icon-sm" onClick={back} title="Back">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-sm font-semibold">
            {track?.title ?? slug} <span className="ml-1 font-normal text-emerald-500">#{slug}</span>
          </h1>
          {track && (
            <p className="text-xs text-muted-foreground">
              {track.post_count} {track.post_count === 1 ? "update" : "updates"} · started {timeAgo(track.created_at)}
            </p>
          )}
        </div>
        <div className="ml-auto flex shrink-0 -space-x-1.5">
          {track?.contributors.slice(0, 5).map((a) => (
            <Avatar key={a.id} handle={a.handle} name={a.display_name} className="size-6 text-[10px] ring-2 ring-background" />
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {error && <p className="px-6 py-8 text-sm text-destructive">{error}</p>}

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
          </div>
        )}

        {/* the timeline: a literal track down the left, one stop per update */}
        <div className="relative px-2 py-4 sm:px-4">
          <div className="absolute bottom-4 left-[26px] top-4 w-px bg-gradient-to-b from-emerald-500/60 via-border to-border sm:left-[34px]" />
          {posts.map((post, i) => (
            <div key={post.id} className="relative pl-8 sm:pl-10">
              <span
                className={`absolute left-[22px] top-7 size-2.5 rounded-full border-2 border-background sm:left-[30px] ${
                  i === posts.length - 1 ? "bg-emerald-500" : "bg-muted-foreground/50"
                }`}
              />
              <div className="mb-1 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                {new Date(post.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                {i === posts.length - 1 && <span className="ml-2 font-semibold text-emerald-500">latest</span>}
              </div>
              <div className="overflow-hidden rounded-xl border bg-card/50">
                <PostCard post={post} allReactions={reactions} onChange={load} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
