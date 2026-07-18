import { useState } from "react";
import type { User } from "../types";
import { api } from "../api";

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

  const inputClass =
    "w-full rounded-xl border border-edge bg-panel-2 px-3.5 py-2.5 text-[15px] outline-none placeholder:text-mist focus:border-mist";

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/icon.svg" alt="" className="mx-auto mb-3 size-14 rounded-2xl" />
          <h1 className="text-2xl font-bold">cofind</h1>
          <p className="mt-1 text-sm text-mist">a build-in-public room for a small circle</p>
        </div>

        <div className="mb-4 flex rounded-xl border border-edge bg-panel p-1">
          {(["login", "join"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-1.5 text-sm font-semibold capitalize transition-colors ${
                tab === t ? "bg-edge text-snow" : "text-mist hover:text-fog"
              }`}
            >
              {t === "join" ? "join with invite" : "log in"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {tab === "join" && (
            <>
              <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Invite code" className={inputClass} />
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                className={inputClass}
              />
            </>
          )}
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Handle" className={inputClass} autoCapitalize="none" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className={inputClass}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-mint py-2.5 font-bold text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {tab === "login" ? "Log in" : "Join the room"}
          </button>
        </form>
      </div>
    </div>
  );
}
