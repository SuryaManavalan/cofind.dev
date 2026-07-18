import { useState } from "react";
import type { User } from "../types";
import { api } from "../api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AuthScreen({ onAuthed }: { onAuthed: (user: User) => void }) {
  const [tab, setTab] = useState<"login" | "join">("login");
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } =
        tab === "login" ? await api.login(handle, password) : await api.join(inviteCode, handle, displayName, password);
      onAuthed(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/icon.svg" alt="" className="mx-auto mb-4 size-14 rounded-2xl border shadow-sm" />
          <h1 className="text-2xl font-semibold tracking-tight">cofind</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">a build-in-public room for a small circle</p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1">
            {(["login", "join"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-md py-1.5 text-sm font-medium transition-colors",
                  tab === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "join" ? "Join with invite" : "Log in"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            {tab === "join" && (
              <>
                <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Invite code" />
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" />
              </>
            )}
            <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Handle" autoCapitalize="none" />
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {tab === "login" ? "Log in" : "Join the room"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
