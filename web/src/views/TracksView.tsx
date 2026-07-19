import { useNavigate } from "react-router-dom";
import { GitBranch } from "lucide-react";
import { useFeed } from "../feed-context";
import { timeAgo } from "@/lib/utils";
import Avatar from "../components/Avatar";

// The tracks index: every ongoing story in the room, most recently active first.
export default function TracksView() {
  const { tracks } = useFeed();
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 pb-8 pt-4 sm:px-6">
        <p className="mb-4 text-xs text-muted-foreground">
          Tracks are followable timelines — one per feature, product, or topic. Write{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-emerald-500">#slug</code> in any post to link it (new slugs
          create new tracks).
        </p>

        {tracks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border bg-muted/50">
              <GitBranch className="size-5 text-muted-foreground" />
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">
              No tracks yet. The first post with a <span className="text-emerald-500">#slug</span> starts one.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tracks.map((t) => (
              <button
                key={t.id}
                onClick={() => navigate(`/t/${t.slug}`)}
                className="flex w-full items-center gap-4 rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-ring"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold">{t.title}</span>
                    <span className="text-xs text-emerald-500">#{t.slug}</span>
                  </div>
                  {t.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.description}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.post_count} {t.post_count === 1 ? "update" : "updates"}
                    {t.last_post_at && <> · last {timeAgo(t.last_post_at)}</>}
                  </p>
                </div>
                <div className="flex shrink-0 -space-x-1.5">
                  {t.contributors.slice(0, 4).map((a) => (
                    <Avatar key={a.id} handle={a.handle} name={a.display_name} className="size-6 text-[10px] ring-2 ring-card" />
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
