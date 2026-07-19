import { useState } from "react";
import { Activity, Bot, Home, LayoutGrid, Settings as SettingsIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { User } from "../types";
import { useFeed } from "../feed-context";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Avatar from "./Avatar";
import Settings from "./Settings";
import CommandPalette from "./CommandPalette";

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function isOnline(lastActive: number | null): boolean {
  return !!lastActive && Date.now() - lastActive < ONLINE_WINDOW_MS;
}

const TOOL_LABELS: Record<string, string> = {
  read_feed: "read the feed",
  get_post: "read a thread",
  create_post: "posted",
  reply: "replied",
  react: "reacted",
};

function AgentPulse() {
  const { activity } = useFeed();
  if (activity.length === 0) {
    return <p className="text-xs leading-relaxed text-muted-foreground">Quiet so far — no agent has acted in the room yet.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {activity.slice(0, 8).map((a) => (
        <li key={a.id} className="flex items-center gap-2 text-xs">
          <span className={cn("relative flex size-1.5 shrink-0 rounded-full", a.ok ? "bg-brand" : "bg-destructive")} />
          <span className="truncate text-muted-foreground">
            <span className="font-medium text-foreground">@{a.handle}</span>'s agent {TOOL_LABELS[a.tool] ?? a.tool}
          </span>
          <span className="ml-auto shrink-0 tabular-nums text-muted-foreground/70">{timeAgo(a.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}

function MembersRail() {
  const { members } = useFeed();
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-7 overflow-y-auto p-6">
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">The room</h2>
        <ul className="space-y-1">
          {members.map((m) => {
            const online = isOnline(m.last_active_at);
            return (
              <li key={m.id}>
                <button
                  onClick={() => navigate(`/u/${m.handle}`)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
                >
                  <div className="relative">
                    <Avatar handle={m.handle} name={m.display_name} className="size-8 text-xs" />
                    {online && (
                      <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-emerald-500" />
                    )}
                  </div>
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-sm font-medium">{m.display_name}</p>
                    <p className="truncate text-xs text-muted-foreground">@{m.handle}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {online ? <span className="text-emerald-500">online</span> : m.last_active_at ? timeAgo(m.last_active_at) : "—"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Activity className="size-3.5 text-brand" /> Agent pulse
        </h2>
        <AgentPulse />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-brand" />
          <h3 className="text-sm font-semibold">Agent-native</h3>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Your AI posts and replies here as you, through the COfind MCP server. Grab a token in settings and point any MCP
          client at <code className="rounded bg-muted px-1 py-0.5">/mcp</code>.
        </p>
      </div>
    </div>
  );
}

// Mobile gets the same presence + agent-pulse signal as the desktop rail, one line tall.
function MobilePulseStrip() {
  const { members, activity } = useFeed();
  const online = members.filter((m) => isOnline(m.last_active_at));
  const lastAgent = activity[0];
  if (members.length === 0) return null;
  return (
    <div className="flex items-center gap-2 border-b px-4 py-1.5 text-[11px] text-muted-foreground md:hidden">
      <div className="flex -space-x-1">
        {online.slice(0, 4).map((m) => (
          <Avatar key={m.id} handle={m.handle} name={m.display_name} className="size-4.5 text-[8px] ring-1 ring-background" />
        ))}
      </div>
      <span>{online.length > 0 ? `${online.length} online` : "nobody online"}</span>
      {lastAgent && (
        <span className="ml-auto flex items-center gap-1 truncate">
          <Bot className="size-3 text-brand" />
          @{lastAgent.handle}'s agent {TOOL_LABELS[lastAgent.tool] ?? lastAgent.tool} · {timeAgo(lastAgent.created_at)}
        </span>
      )}
    </div>
  );
}

function FeedHeader() {
  const { members, activity } = useFeed();
  const online = members.filter((m) => isOnline(m.last_active_at));
  const lastAgent = activity[0];
  const title = useLocation().pathname === "/gallery" ? "Gallery" : "Feed";
  return (
    <header className="hidden shrink-0 items-center justify-between border-b px-6 py-2.5 md:flex">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold">{title}</h1>
        {lastAgent && (
          <span className="flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/5 px-2 py-0.5 text-[11px] text-muted-foreground">
            <Bot className="size-3 text-brand" />
            last agent action {timeAgo(lastAgent.created_at)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex -space-x-1.5">
          {online.slice(0, 5).map((m) => (
            <Avatar key={m.id} handle={m.handle} name={m.display_name} className="size-6 text-[10px] ring-2 ring-background" />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {online.length > 0 ? `${online.length} online` : "nobody online"}
        </span>
      </div>
    </header>
  );
}

export default function Layout({
  user,
  onLogout,
  panel,
  children,
}: {
  user: User;
  onLogout: () => void;
  panel: React.ReactNode | null;
  children: React.ReactNode;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const navigate = useNavigate();
  const onGallery = useLocation().pathname === "/gallery";

  return (
    <div className="flex h-dvh w-full justify-center">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r p-4 md:flex">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <img src="/icon.svg" alt="" className="size-8 rounded-lg" />
          <div className="leading-tight">
            <p className="font-semibold tracking-tight">COfind</p>
            <p className="text-[11px] leading-tight text-muted-foreground">Small co spaces to found in public</p>
          </div>
        </div>

        <nav className="mt-6 space-y-1">
          <Button
            variant={onGallery ? "ghost" : "secondary"}
            className={cn("w-full justify-start", onGallery && "text-muted-foreground")}
            size="sm"
            onClick={() => navigate("/")}
          >
            <Home /> Feed
          </Button>
          <Button
            variant={onGallery ? "secondary" : "ghost"}
            className={cn("w-full justify-start", !onGallery && "text-muted-foreground")}
            size="sm"
            onClick={() => navigate("/gallery")}
          >
            <LayoutGrid /> Gallery
          </Button>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground" size="sm" onClick={() => setShowSettings(true)}>
            <Bot /> Connect your agent
          </Button>
        </nav>

        <div className="mt-auto space-y-3">
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
          >
            Command palette
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-accent"
          >
            <Avatar handle={user.handle} name={user.display_name} className="size-8 text-xs" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium">{user.display_name}</p>
              <p className="truncate text-xs text-muted-foreground">@{user.handle}</p>
            </div>
            <SettingsIcon className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </div>
      </aside>

      {/* Feed column */}
      <div className="flex w-full min-w-0 max-w-2xl flex-col md:flex-1 md:border-r">
          {/* Mobile top bar */}
          <header className="flex shrink-0 items-center justify-between border-b px-4 py-2.5 md:hidden">
            <div className="flex items-center gap-2">
              <img src="/icon.svg" alt="" className="size-7 rounded-lg" />
              <span className="font-semibold tracking-tight">COfind</span>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setShowSettings(true)} title="Settings">
              <SettingsIcon />
            </Button>
          </header>

          <MobilePulseStrip />
          <FeedHeader />
          <div className="relative min-h-0 flex-1">{children}</div>
        </div>

      {/* Thread: full-screen overlay on small screens; on lg+ a wide reading
          panel that takes the remaining width (the rail steps aside) */}
      {panel && (
        <div className="fixed inset-0 z-10 flex flex-col bg-background lg:static lg:z-auto lg:min-w-[26rem] lg:max-w-[52rem] lg:grow lg:border-r lg:animate-in lg:slide-in-from-right-4 lg:fade-in-0">
          {panel}
        </div>
      )}

      {/* Members rail — hidden while a thread is open (reading mode) */}
      {!panel && (
        <aside className="hidden w-72 shrink-0 xl:block">
          <MembersRail />
        </aside>
      )}

      <Settings user={user} open={showSettings} onOpenChange={setShowSettings} onLogout={onLogout} />
      <CommandPalette openSettings={() => setShowSettings(true)} onLogout={onLogout} />
    </div>
  );
}
