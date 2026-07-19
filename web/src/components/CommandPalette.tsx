import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { Bot, Copy, GitBranch, Home, KeyRound, LayoutGrid, LogOut, MessageSquare, PenLine, Search, Sparkles } from "lucide-react";
import { useFeed } from "../feed-context";

// ⌘K — table stakes for founder tools (Linear/Raycast idiom, per research theme C/D).
export default function CommandPalette({
  openSettings,
  onLogout,
}: {
  openSettings: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { posts, tracks } = useFeed();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  function run(fn: () => void) {
    setOpen(false);
    fn();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[18vh]" onClick={() => setOpen(false)}>
      <Command
        label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl animate-in fade-in-0 zoom-in-95"
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Command.Input
            autoFocus
            placeholder="Type a command or search posts…"
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">esc</kbd>
        </div>
        <Command.List className="max-h-80 overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No results.</Command.Empty>

          <Command.Group heading="Actions">
            <Item onSelect={() => run(() => window.dispatchEvent(new CustomEvent("cofind:focus-composer")))}>
              <PenLine /> New post
            </Item>
            <Item onSelect={() => run(() => navigate("/"))}>
              <Home /> Go to feed
            </Item>
            <Item onSelect={() => run(() => navigate("/gallery"))}>
              <LayoutGrid /> Artifact gallery
            </Item>
            <Item onSelect={() => run(() => navigate("/tracks"))}>
              <GitBranch /> Tracks
            </Item>
            <Item onSelect={() => run(() => navigate("/graph"))}>
              <Sparkles /> Constellation
            </Item>
            <Item onSelect={() => run(openSettings)}>
              <KeyRound /> Settings & agent tokens
            </Item>
            <Item onSelect={() => run(() => navigator.clipboard.writeText(`${location.origin}/mcp`))}>
              <Copy /> Copy MCP server URL
            </Item>
            <Item onSelect={() => run(() => window.dispatchEvent(new CustomEvent("cofind:agent-draft")))}>
              <Bot /> Draft post with your agent
            </Item>
            <Item onSelect={() => run(onLogout)}>
              <LogOut /> Log out
            </Item>
          </Command.Group>

          {tracks.length > 0 && (
            <Command.Group heading="Tracks">
              {tracks.slice(0, 10).map((t) => (
                <Item key={t.id} onSelect={() => run(() => navigate(`/t/${t.slug}`))} value={`#${t.slug} ${t.title}`}>
                  <GitBranch />
                  <span className="truncate">
                    <span className="font-medium text-emerald-500">#{t.slug}</span>{" "}
                    <span className="text-muted-foreground">{t.post_count} stops</span>
                  </span>
                </Item>
              ))}
            </Command.Group>
          )}

          {posts.length > 0 && (
            <Command.Group heading="Jump to post">
              {posts.slice(0, 20).map((p) => (
                <Item key={p.id} onSelect={() => run(() => navigate(`/post/${p.id}`))} value={`${p.author.display_name} ${p.body.slice(0, 80)}`}>
                  <MessageSquare />
                  <span className="truncate">
                    <span className="font-medium">{p.author.display_name}:</span>{" "}
                    <span className="text-muted-foreground">{p.body.slice(0, 60)}</span>
                  </span>
                </Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}

function Item({ children, onSelect, value }: { children: React.ReactNode; onSelect: () => void; value?: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
    >
      {children}
    </Command.Item>
  );
}
