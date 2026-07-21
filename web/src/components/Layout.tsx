import { useRef, useEffect, useState } from "react";
import { Activity, Bot, Flame, GitBranch, Home, LayoutGrid, Menu, Settings as SettingsIcon, Sparkles, TrendingUp, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { User } from "../types";
import { useFeed } from "../feed-context";
import { cn, timeAgo } from "@/lib/utils";
import { useSlotNumber } from "@/lib/useSlotNumber";
import { api } from "../api";
import { haptic } from "@/lib/haptics";
import { WEATHER_ICONS } from "@/lib/icons";
import type { MarketDto } from "../types";
import { Button } from "@/components/ui/button";
import Avatar from "./Avatar";
import { ConvictionCoin } from "./Conviction";
import Settings from "./Settings";
import CommandPalette from "./CommandPalette";

// The dev environment (dev.cofind.dev) wears a badge so nobody mistakes it for prod.
const IS_DEV_ENV = typeof location !== "undefined" && location.hostname.startsWith("dev.");

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
                      <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-success" />
                    )}
                  </div>
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-sm font-medium">{m.display_name}</p>
                    <p className="truncate text-xs text-muted-foreground">@{m.handle}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {online ? <span className="text-success">online</span> : m.last_active_at ? timeAgo(m.last_active_at) : "—"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <RoomWeather />
      <TheLineTicker />
      <MovingNow />

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
          Your AI posts and replies here as you, through the Cofind MCP server. Grab a token in settings and point any MCP
          client at <code className="rounded bg-muted px-1 py-0.5">/mcp</code>.
        </p>
      </div>
    </div>
  );
}

// Tracks with fresh stops — the room's heartbeat per-story, not per-person.
function MovingNow() {
  const { tracks } = useFeed();
  const navigate = useNavigate();
  const moving = tracks.filter((t) => t.last_post_at && !t.shipped_at).slice(0, 4);
  if (moving.length === 0) return null;
  return (
    <div>
      <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <GitBranch className="size-3.5 text-success" /> Moving now
      </h2>
      <ul className="space-y-1.5">
        {moving.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => navigate(`/t/${t.slug}`)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition-colors hover:bg-accent"
            >
              <span className="truncate font-medium text-success">#{t.slug}</span>
              {t.recent_count >= 3 && <Flame className="size-3 shrink-0 text-warning" />}
              <span className="ml-auto shrink-0 text-muted-foreground">
                {t.post_count} · {t.last_post_at ? timeAgo(t.last_post_at) : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Conviction balance, always in the corner of your eye — spins when it changes.
function WalletChip() {
  const { wallet } = useFeed();
  const bal = useSlotNumber(wallet?.balance ?? 0, { duration: 900 });
  if (!wallet) return null;
  return (
    <span
      title={`${wallet.balance} conviction — the room's currency. Mint it by building; spend it on each other.`}
      className="ml-auto flex items-center gap-1 rounded-full bg-conviction/10 px-1.5 py-px text-[10px] font-semibold tabular-nums text-conviction"
    >
      <ConvictionCoin className="size-3" />
      {bal}
    </span>
  );
}

// The room's weather (ADR-024): one line of emotional/activity truth.
function RoomWeather() {
  const [weather, setWeather] = useState<{ tone: string; summary: string } | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => api.weather().then((r) => { if (live) setWeather(r); }).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { live = false; clearInterval(t); };
  }, []);
  if (!weather) return null;
  const WIcon = WEATHER_ICONS[weather.tone] ?? WEATHER_ICONS.quiet!;
  return (
    <p
      className="flex items-start gap-1.5 rounded-lg border border-dashed px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground"
      title="Room weather — the last 48h, felt"
    >
      <WIcon className="mt-px size-3.5 shrink-0 text-brand" />
      <span>{weather.summary}</span>
    </p>
  );
}

// The rail's ticker: lines with the biggest 24h swing — where the room disagrees.
function TheLineTicker() {
  const [movers, setMovers] = useState<MarketDto[]>([]);
  const navigate = useNavigate();
  useEffect(() => {
    let live = true;
    const load = () =>
      api.markets().then((r) => {
        if (live) setMovers(r.markets.filter((m) => !m.resolved_at).sort((a, b) => Math.abs(b.move_24h) - Math.abs(a.move_24h)).slice(0, 3));
      }).catch(() => {});
    load();
    const t = setInterval(load, 45000);
    return () => { live = false; clearInterval(t); };
  }, []);
  if (movers.length === 0) return null;
  return (
    <div>
      <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <TrendingUp className="size-3.5 text-brand" /> The Line
      </h2>
      <ul className="space-y-1.5">
        {movers.map((m) => (
          <li key={m.id}>
            <button
              onClick={() => navigate(`/t/${m.track.slug}`)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition-colors hover:bg-accent"
            >
              <span className="truncate font-medium text-brand">#{m.track.slug}</span>
              <span className="ml-auto shrink-0 tabular-nums text-foreground">{Math.round(m.price_yes * 100)}%</span>
              {m.move_24h !== 0 && (
                <span className={cn("shrink-0 tabular-nums", m.move_24h > 0 ? "text-success" : "text-destructive")}>
                  {m.move_24h > 0 ? "▲" : "▼"}{Math.round(Math.abs(m.move_24h) * 100)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
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
  const path = useLocation().pathname;
  const title = path === "/gallery" ? "Gallery" : path === "/tracks" ? "Tracks" : path === "/graph" ? "Constellation" : path === "/floor" ? "The Floor" : "Feed";
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

// Mobile drawer: the phone's door to everything the desktop sidebar + rail hold.
function MobileDrawer({
  open,
  onClose,
  onNavigate,
  openSettings,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  openSettings: () => void;
}) {
  const path = useLocation().pathname;
  const closeSwipe = useSwipe(() => {}, onClose);
  if (!open) return null;
  const items = [
    { label: "Feed", icon: <Home />, to: "/" },
    { label: "Tracks", icon: <GitBranch />, to: "/tracks" },
    { label: "Gallery", icon: <LayoutGrid />, to: "/gallery" },
    { label: "Constellation", icon: <Sparkles />, to: "/graph" },
    { label: "The Floor", icon: <TrendingUp />, to: "/floor" },
  ];
  return (
    <div className="fixed inset-0 z-40 md:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 animate-in fade-in-0" />
      <div
        {...closeSwipe}
        className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col overflow-y-auto border-r bg-background shadow-2xl animate-in slide-in-from-left duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="" className="size-7 rounded-lg" />
            <span className="font-semibold tracking-tight">Cofind</span>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X />
          </Button>
        </div>
        <nav className="space-y-1 p-3">
          {items.map((it) => (
            <Button
              key={it.to}
              variant={path === it.to ? "secondary" : "ghost"}
              className={cn("w-full justify-start", path !== it.to && "text-muted-foreground")}
              size="sm"
              onClick={() => {
                onNavigate(it.to);
                onClose();
              }}
            >
              {it.icon} {it.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            size="sm"
            onClick={() => {
              openSettings();
              onClose();
            }}
          >
            <Bot /> Connect your agent
          </Button>
        </nav>
        <div className="border-t">
          <MembersRail />
        </div>
      </div>
    </div>
  );
}

// Modern touch navigation (mobile only):
//  · swipe right on a panel — interactive drag-back (iOS style)
//  · swipe right on a root view — opens the drawer
//  · swipe left on the drawer — closes it
// Guards: horizontal intent required; skips [data-no-swipe] zones (the
// constellation drags nodes) and horizontally-scrollable <pre> blocks.
// iOS (Safari + standalone PWA) has a NATIVE edge-swipe-back gesture. If our
// JS also navigates on edge swipes, both fire: two history pops, the second
// often crossing a document boundary — a full page reload that dumps the user
// at the top of a fresh feed. So on iOS we yield edge swipes to the OS (its
// pop is a same-document popstate React Router handles in place) and only
// handle swipes that start away from the edge, which the OS ignores.
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function useSwipe(onRight: (edge: boolean) => void, onLeft?: () => void, onDrag?: (dx: number | null) => void) {
  const st = useRef<{ x: number; y: number; lastX: number; edge: boolean; locked: "h" | "v" | null } | null>(null);
  const isMobile = () => window.matchMedia("(max-width: 1023px)").matches;
  return {
    onTouchStart(e: React.TouchEvent) {
      if (!isMobile()) return;
      const target = e.target as HTMLElement;
      if (target.closest?.("pre, [data-no-swipe], input, textarea")) {
        st.current = null;
        return;
      }
      const t = e.touches[0]!;
      const edge = t.clientX < 32;
      if (edge && IS_IOS) {
        // the OS owns this gesture — doing our own back too double-pops
        st.current = null;
        return;
      }
      st.current = { x: t.clientX, y: t.clientY, lastX: t.clientX, edge, locked: null };
    },
    onTouchMove(e: React.TouchEvent) {
      const s0 = st.current;
      if (!s0) return;
      const t = e.touches[0]!;
      s0.lastX = t.clientX;
      const dx = t.clientX - s0.x;
      const dy = t.clientY - s0.y;
      if (!s0.locked) {
        if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.4) s0.locked = "h";
        else if (Math.abs(dy) > 14) s0.locked = "v";
      }
      if (s0.locked === "h" && dx > 0) onDrag?.(dx);
    },
    onTouchEnd(e: React.TouchEvent) {
      const s0 = st.current;
      st.current = null;
      onDrag?.(null);
      if (!s0 || s0.locked !== "h") return;
      const dx = (e.changedTouches[0]?.clientX ?? s0.lastX) - s0.x;
      const threshold = s0.edge ? 56 : 100;
      if (dx > threshold) onRight(s0.edge);
      else if (dx < -threshold && onLeft) onLeft();
    },
  };
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelDx, setPanelDx] = useState<number | null>(null);
  const navigate = useNavigate();
  const path = useLocation().pathname;
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));
  // Panels: interactive drag-back. Root: big right-swipe opens the drawer.
  const panelSwipe = useSwipe(
    () => {
      haptic("light");
      goBack();
    },
    undefined,
    (dx) => setPanelDx(dx),
  );
  const rootSwipe = useSwipe(() => {
    if (!panel && !drawerOpen) {
      haptic("light");
      setDrawerOpen(true);
    }
  });
  const onGallery = path === "/gallery";
  const onTracks = path === "/tracks";
  const onGraph = path === "/graph";
  const onFloor = path === "/floor";
  const onFeed = !onGallery && !onTracks && !onGraph && !onFloor;

  return (
    <div className="flex h-dvh w-full justify-center" {...(!panel && !drawerOpen ? rootSwipe : {})}>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r p-4 md:flex">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <img src="/icon.svg" alt="" className="size-8 rounded-lg" />
          <div className="leading-tight">
            <p className="flex items-center gap-1.5 font-semibold tracking-tight">
              Cofind
              {IS_DEV_ENV && (
                <span className="rounded border border-warning/40 bg-warning/10 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-warning">
                  dev
                </span>
              )}
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground">Small co spaces to found in public</p>
          </div>
        </div>

        <nav className="mt-6 space-y-1">
          <Button
            variant={onFeed ? "secondary" : "ghost"}
            className={cn("w-full justify-start", !onFeed && "text-muted-foreground")}
            size="sm"
            onClick={() => navigate("/")}
          >
            <Home /> Feed
          </Button>
          <Button
            variant={onTracks ? "secondary" : "ghost"}
            className={cn("w-full justify-start", !onTracks && "text-muted-foreground")}
            size="sm"
            onClick={() => navigate("/tracks")}
          >
            <GitBranch /> Tracks
          </Button>
          <Button
            variant={onGallery ? "secondary" : "ghost"}
            className={cn("w-full justify-start", !onGallery && "text-muted-foreground")}
            size="sm"
            onClick={() => navigate("/gallery")}
          >
            <LayoutGrid /> Gallery
          </Button>
          <Button
            variant={onGraph ? "secondary" : "ghost"}
            className={cn("w-full justify-start", !onGraph && "text-muted-foreground")}
            size="sm"
            onClick={() => navigate("/graph")}
          >
            <Sparkles /> Constellation
          </Button>
          <Button
            variant={onFloor ? "secondary" : "ghost"}
            className={cn("w-full justify-start", !onFloor && "text-muted-foreground")}
            size="sm"
            onClick={() => navigate("/floor")}
          >
            <TrendingUp /> The Floor
            <WalletChip />
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
          <header className="flex shrink-0 items-center justify-between border-b px-3 py-2.5 md:hidden">
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon-sm" onClick={() => setDrawerOpen(true)} title="Menu">
                <Menu />
              </Button>
              <img src="/icon.svg" alt="" className="size-7 rounded-lg" />
              <span className="font-semibold tracking-tight">Cofind</span>
              {IS_DEV_ENV && (
                <span className="rounded border border-warning/40 bg-warning/10 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-warning">
                  dev
                </span>
              )}
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
        <div
          {...panelSwipe}
          style={panelDx !== null ? { transform: `translateX(${panelDx}px)`, transition: "none" } : { transition: "transform 200ms ease" }}
          className="fixed inset-0 z-10 flex flex-col bg-background lg:static lg:z-auto lg:!transform-none lg:min-w-[26rem] lg:max-w-[52rem] lg:grow lg:border-r lg:animate-in lg:slide-in-from-right-4 lg:fade-in-0"
        >
          {/* iOS-style edge strip: back-swipe works even over artifact iframes,
              which otherwise swallow touches entirely. */}
          <div className="absolute inset-y-0 left-0 z-20 w-5 lg:hidden" />
          {panel}
        </div>
      )}

      {/* Members rail — hidden while a thread is open (reading mode) */}
      {!panel && (
        <aside className="hidden w-72 shrink-0 xl:block">
          <MembersRail />
        </aside>
      )}

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onNavigate={navigate} openSettings={() => setShowSettings(true)} />
      <Settings user={user} open={showSettings} onOpenChange={setShowSettings} onLogout={onLogout} />
      <CommandPalette openSettings={() => setShowSettings(true)} onLogout={onLogout} />
    </div>
  );
}
