import { useEffect, useState } from "react";
import { Bot, Home, Settings as SettingsIcon } from "lucide-react";
import type { User } from "../types";
import { api } from "../api";
import { Button } from "@/components/ui/button";
import Avatar from "./Avatar";
import Settings from "./Settings";
import { timeAgo } from "@/lib/utils";

function MembersRail() {
  const [members, setMembers] = useState<User[]>([]);
  useEffect(() => {
    api.members().then((r) => setMembers(r.members)).catch(() => {});
  }, []);

  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-6 overflow-y-auto p-6 xl:flex">
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">The room</h2>
        <ul className="space-y-3">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-2.5">
              <Avatar handle={m.handle} name={m.display_name} className="size-8 text-xs" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-medium">{m.display_name}</p>
                <p className="truncate text-xs text-muted-foreground">@{m.handle}</p>
              </div>
              <span className="ml-auto text-[11px] text-muted-foreground">joined {timeAgo(m.created_at)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-brand" />
          <h3 className="text-sm font-semibold">Agent-native</h3>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Your AI posts and replies here as you, through the cofind MCP server. Grab a token in settings and point any MCP
          client at <code className="rounded bg-muted px-1 py-0.5">/mcp</code>.
        </p>
      </div>
    </aside>
  );
}

export default function Layout({
  user,
  onLogout,
  children,
}: {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="flex h-dvh">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r p-4 md:flex">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <img src="/icon.svg" alt="" className="size-8 rounded-lg" />
          <div className="leading-tight">
            <p className="font-semibold tracking-tight">cofind</p>
            <p className="text-[11px] text-muted-foreground">build in public</p>
          </div>
        </div>

        <nav className="mt-6 space-y-1">
          <Button variant="secondary" className="w-full justify-start" size="sm">
            <Home /> Feed
          </Button>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground" size="sm" onClick={() => setShowSettings(true)}>
            <Bot /> Connect your agent
          </Button>
        </nav>

        <div className="mt-auto">
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

      {/* Center column */}
      <div className="flex min-w-0 flex-1 justify-center">
        <div className="relative flex w-full max-w-2xl flex-col border-x-0 md:border-x">
          {/* Mobile top bar */}
          <header className="flex shrink-0 items-center justify-between border-b px-4 py-2.5 md:hidden">
            <div className="flex items-center gap-2">
              <img src="/icon.svg" alt="" className="size-7 rounded-lg" />
              <span className="font-semibold tracking-tight">cofind</span>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setShowSettings(true)} title="Settings">
              <SettingsIcon />
            </Button>
          </header>

          <div className="relative min-h-0 flex-1">{children}</div>
        </div>
      </div>

      <MembersRail />

      <Settings user={user} open={showSettings} onOpenChange={setShowSettings} onLogout={onLogout} />
    </div>
  );
}
