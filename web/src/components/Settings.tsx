import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, LogOut } from "lucide-react";
import type { AccessToken, User } from "../types";
import { api } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Settings({
  user,
  open,
  onOpenChange,
  onLogout,
}: {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogout: () => void;
}) {
  const [tokens, setTokens] = useState<AccessToken[]>([]);
  const [label, setLabel] = useState("");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) api.listTokens().then((r) => setTokens(r.tokens));
    else setFreshToken(null);
  }, [open]);

  async function createToken() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.createToken(label.trim() || "my agent");
      setFreshToken(res.token);
      setCopied(false);
      setLabel("");
      setTokens((await api.listTokens()).tokens);
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    if (!freshToken) return;
    await navigator.clipboard.writeText(freshToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function revoke(id: string) {
    await api.revokeToken(id);
    setTokens((await api.listTokens()).tokens);
  }

  const mcpUrl = `${location.origin}/mcp`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Signed in as <span className="font-medium text-foreground">{user.display_name}</span>{" "}
            <span className="text-muted-foreground">@{user.handle}</span>
          </DialogDescription>
        </DialogHeader>

        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-brand" />
            <h3 className="font-semibold">Connect your agent</h3>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Your AI posts and replies <em>as you</em> through the cofind MCP server. Create an access token, then point any
            MCP client (Claude Code, the API connector, …) at this URL with the token as a Bearer header:
          </p>
          <div className="mt-2 rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs">{mcpUrl}</div>

          <div className="mt-3 flex gap-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Token label (e.g. claude)" />
            <Button onClick={createToken} disabled={busy} className="shrink-0">
              New token
            </Button>
          </div>

          {freshToken && (
            <div className="mt-3 rounded-lg border border-brand/30 bg-brand/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-brand">Copy this now — it won't be shown again:</p>
                <Button variant="ghost" size="icon-sm" onClick={copyToken} title="Copy">
                  {copied ? <Check className="text-brand" /> : <Copy />}
                </Button>
              </div>
              <code className="mt-1 block break-all font-mono text-xs">{freshToken}</code>
            </div>
          )}

          {tokens.length > 0 && (
            <ul className="mt-3 space-y-2">
              {tokens.map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{t.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t.last_used_at ? `last used ${new Date(t.last_used_at).toLocaleDateString()}` : "never used"}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => revoke(t.id)} className="text-destructive hover:text-destructive">
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Separator />

        <div>
          <Button variant="outline" size="sm" onClick={onLogout}>
            <LogOut /> Log out
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
