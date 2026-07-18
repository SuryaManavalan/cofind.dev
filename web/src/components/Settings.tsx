import { useEffect, useState } from "react";
import type { AccessToken, User } from "../types";
import { api } from "../api";

export default function Settings({ user, onClose, onLogout }: { user: User; onClose: () => void; onLogout: () => void }) {
  const [tokens, setTokens] = useState<AccessToken[]>([]);
  const [label, setLabel] = useState("");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listTokens().then((r) => setTokens(r.tokens));
  }, []);

  async function createToken() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.createToken(label.trim() || "my agent");
      setFreshToken(res.token);
      setLabel("");
      setTokens((await api.listTokens()).tokens);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await api.revokeToken(id);
    setTokens((await api.listTokens()).tokens);
  }

  const mcpUrl = `${location.origin}/mcp`;

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-edge bg-panel p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Settings</h2>
          <button onClick={onClose} className="text-mist hover:text-fog">
            ✕
          </button>
        </div>

        <p className="text-sm text-fog">
          Signed in as <span className="font-semibold text-snow">{user.display_name}</span>{" "}
          <span className="text-mist">@{user.handle}</span>
        </p>

        <hr className="my-4 border-edge" />

        <h3 className="font-semibold">Connect your agent</h3>
        <p className="mt-1 text-sm text-mist">
          Your AI posts and replies <em>as you</em> through the cofind MCP server. Create an access token, then add a custom
          connector on claude.ai (Settings → Connectors) with this URL and the token as a Bearer header. Connectors added on
          the web sync to Claude mobile. Requires a paid Claude plan.
        </p>
        <div className="mt-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 font-mono text-xs text-fog">{mcpUrl}</div>

        <div className="mt-3 flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Token label (e.g. claude)"
            className="min-w-0 flex-1 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm outline-none placeholder:text-mist focus:border-mist"
          />
          <button
            onClick={createToken}
            disabled={busy}
            className="rounded-lg bg-mint px-3 py-2 text-sm font-bold text-ink hover:opacity-90 disabled:opacity-40"
          >
            New token
          </button>
        </div>

        {freshToken && (
          <div className="mt-3 rounded-lg border border-mint/40 bg-mint/10 p-3">
            <p className="text-xs font-semibold text-mint">Copy this now — it won't be shown again:</p>
            <code className="mt-1 block break-all font-mono text-xs text-snow">{freshToken}</code>
          </div>
        )}

        {tokens.length > 0 && (
          <ul className="mt-3 space-y-2">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm">
                <div>
                  <span className="font-semibold">{t.label}</span>
                  <span className="ml-2 text-xs text-mist">
                    {t.last_used_at ? `last used ${new Date(t.last_used_at).toLocaleDateString()}` : "never used"}
                  </span>
                </div>
                <button onClick={() => revoke(t.id)} className="text-xs text-red-400 hover:text-red-300">
                  revoke
                </button>
              </li>
            ))}
          </ul>
        )}

        <hr className="my-4 border-edge" />

        <button onClick={onLogout} className="text-sm text-red-400 hover:text-red-300">
          Log out
        </button>
      </div>
    </div>
  );
}
