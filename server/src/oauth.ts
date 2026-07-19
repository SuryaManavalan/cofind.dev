import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createHash } from "node:crypto";
import { db } from "./db.js";
import { newId, newSecret, sha256 } from "./util.js";
import * as users from "./services/users.js";

// OAuth 2.1 authorization server (ADR-019) — the claude.ai connector path.
// Public clients + PKCE (S256) + Dynamic Client Registration. Every token
// resolves to the same user principal as the web session (ADR-001).

const ORIGIN = process.env.COFIND_PUBLIC_ORIGIN ?? "http://localhost:8787";
const CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = "cofind_session";

export const oauth = new Hono();

// --- discovery (RFC 8414 + RFC 9728; MCP clients probe with and without the /mcp suffix) ---

const asMetadata = {
  issuer: ORIGIN,
  authorization_endpoint: `${ORIGIN}/oauth/authorize`,
  token_endpoint: `${ORIGIN}/oauth/token`,
  registration_endpoint: `${ORIGIN}/oauth/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
  scopes_supported: ["Cofind"],
};

const resourceMetadata = {
  resource: `${ORIGIN}/mcp`,
  authorization_servers: [ORIGIN],
  bearer_methods_supported: ["header"],
};

for (const path of ["/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/mcp"]) {
  oauth.get(path, (c) => c.json(asMetadata));
}
for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
  oauth.get(path, (c) => c.json(resourceMetadata));
}

// --- dynamic client registration (RFC 7591) ---

oauth.post("/oauth/register", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const redirectUris: string[] = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u: unknown) => typeof u === "string") : [];
  if (redirectUris.length === 0) return c.json({ error: "invalid_client_metadata", error_description: "redirect_uris required" }, 400);
  if (!redirectUris.every((u) => u.startsWith("https://") || u.startsWith("http://localhost"))) {
    return c.json({ error: "invalid_redirect_uri", error_description: "redirect_uris must be https" }, 400);
  }
  const id = newId("oc");
  const name = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 80) : "MCP client";
  db.prepare("INSERT INTO oauth_clients (id, name, redirect_uris, token_endpoint_auth_method, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    name,
    JSON.stringify(redirectUris),
    "none",
    Date.now(),
  );
  return c.json(
    {
      client_id: id,
      client_name: name,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201,
  );
});

// --- authorize: consent page (with inline login when there's no session) ---

interface AuthzParams {
  client_id: string;
  redirect_uri: string;
  state?: string;
  code_challenge: string;
  scope?: string;
}

function getClient(clientId: string): { id: string; name: string; redirect_uris: string[] } | null {
  const row = db.prepare("SELECT id, name, redirect_uris FROM oauth_clients WHERE id = ?").get(clientId) as
    | { id: string; name: string; redirect_uris: string }
    | undefined;
  return row ? { ...row, redirect_uris: JSON.parse(row.redirect_uris) } : null;
}

function validateAuthz(q: Record<string, string | undefined>): { ok: true; params: AuthzParams; client: { name: string } } | { ok: false; error: string } {
  const client = q.client_id ? getClient(q.client_id) : null;
  if (!client) return { ok: false, error: "Unknown client_id" };
  if (!q.redirect_uri || !client.redirect_uris.includes(q.redirect_uri)) return { ok: false, error: "redirect_uri not registered for this client" };
  if (q.response_type !== "code") return { ok: false, error: "response_type must be 'code'" };
  if (!q.code_challenge || (q.code_challenge_method ?? "S256") !== "S256") return { ok: false, error: "PKCE (S256) is required" };
  return {
    ok: true,
    client,
    params: { client_id: q.client_id!, redirect_uri: q.redirect_uri, state: q.state, code_challenge: q.code_challenge, scope: q.scope },
  };
}

function consentPage(client: string, params: AuthzParams, loggedInAs: string | null, error?: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const hidden = Object.entries({ ...params, response_type: "code", code_challenge_method: "S256" })
    .filter(([, v]) => v)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v!)}">`)
    .join("");
  const login = loggedInAs
    ? `<p class="who">Authorizing as <b>@${esc(loggedInAs)}</b></p>`
    : `<input name="handle" placeholder="Handle" autocapitalize="none" required>
       <input name="password" type="password" placeholder="Password" required>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize · Cofind</title><style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100dvh; display:flex; align-items:center; justify-content:center;
         background:#141c33; color:#eff5fa; font-family: ui-sans-serif, system-ui, sans-serif; }
  .card { width: 340px; background:#19233e; border:1px solid rgba(83,116,172,.32); border-radius:14px; padding:26px; }
  h1 { font-size:17px; margin:0 0 6px; } p { font-size:13px; color:#8bafd0; margin:6px 0; line-height:1.5; }
  .who { color:#eff5fa; } .err { color:#f87171; }
  input { width:100%; box-sizing:border-box; margin-top:10px; padding:9px 12px; border-radius:9px;
          border:1px solid rgba(83,116,172,.42); background:transparent; color:#eff5fa; font-size:14px; }
  .row { display:flex; gap:10px; margin-top:18px; }
  button { flex:1; padding:9px 0; border-radius:9px; font-size:14px; font-weight:600; cursor:pointer; border:1px solid rgba(83,116,172,.42); }
  .approve { background:#eff5fa; color:#141c33; border:none; } .deny { background:transparent; color:#8bafd0; }
</style></head><body><form class="card" method="post" action="/oauth/authorize">
  <h1>Connect to Cofind</h1>
  <p><b style="color:#eff5fa">${esc(client)}</b> wants to read the room and post, reply, and react <b style="color:#eff5fa">as you</b>. Its writes are labeled with an agent chip.</p>
  ${error ? `<p class="err">${esc(error)}</p>` : ""}
  ${hidden}${login}
  <div class="row">
    <button class="deny" name="action" value="deny">Deny</button>
    <button class="approve" name="action" value="approve">Approve</button>
  </div>
</form></body></html>`;
}

oauth.get("/oauth/authorize", (c) => {
  const v = validateAuthz(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!v.ok) return c.html(`<p style="font-family:sans-serif">${v.error}</p>`, 400);
  const session = getCookie(c, SESSION_COOKIE);
  const user = session ? users.userFromSession(session) : null;
  return c.html(consentPage(v.client.name, v.params, user?.handle ?? null));
});

oauth.post("/oauth/authorize", async (c) => {
  const form = (await c.req.parseBody()) as Record<string, string>;
  const v = validateAuthz(form);
  if (!v.ok) return c.html(`<p style="font-family:sans-serif">${v.error}</p>`, 400);
  const redirect = new URL(v.params.redirect_uri);
  if (v.params.state) redirect.searchParams.set("state", v.params.state);

  if (form.action !== "approve") {
    redirect.searchParams.set("error", "access_denied");
    return c.redirect(redirect.toString());
  }

  let user = null;
  const session = getCookie(c, SESSION_COOKIE);
  if (session) user = users.userFromSession(session);
  if (!user && form.handle && form.password) {
    try {
      const res = users.login(form.handle, form.password);
      user = res.user;
      setCookie(c, SESSION_COOKIE, res.sessionToken, {
        httpOnly: true,
        sameSite: "Lax",
        secure: ORIGIN.startsWith("https"),
        path: "/",
        maxAge: 60 * 60 * 24 * 90,
      });
    } catch {
      return c.html(consentPage(v.client.name, v.params, null, "Invalid handle or password"), 401);
    }
  }
  if (!user) return c.html(consentPage(v.client.name, v.params, null, "Please log in to approve"), 401);

  const code = newSecret("cofind_code");
  db.prepare(
    "INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(sha256(code), v.params.client_id, user.id, v.params.redirect_uri, v.params.code_challenge, v.params.scope ?? "Cofind", Date.now() + CODE_TTL_MS, Date.now());
  redirect.searchParams.set("code", code);
  return c.redirect(redirect.toString());
});

// --- token endpoint ---

function issueTokens(userId: string, clientId: string, scope: string | null) {
  const access = newSecret("cofind_oat");
  const refresh = newSecret("cofind_ort");
  const now = Date.now();
  db.prepare(
    "INSERT INTO oauth_tokens (id, token_hash, refresh_hash, user_id, client_id, scope, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(newId("ot"), sha256(access), sha256(refresh), userId, clientId, scope, now + ACCESS_TTL_MS, now);
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    refresh_token: refresh,
    scope: scope ?? "Cofind",
  };
}

oauth.post("/oauth/token", async (c) => {
  const form = (await c.req.parseBody()) as Record<string, string>;
  c.header("Cache-Control", "no-store");

  if (form.grant_type === "authorization_code") {
    const row = form.code
      ? (db.prepare("SELECT * FROM oauth_codes WHERE code_hash = ?").get(sha256(form.code)) as
          | { client_id: string; user_id: string; redirect_uri: string; code_challenge: string; scope: string | null; expires_at: number; used: number }
          | undefined)
      : undefined;
    if (!row || row.used || row.expires_at < Date.now()) return c.json({ error: "invalid_grant" }, 400);
    if (form.client_id !== row.client_id || (form.redirect_uri && form.redirect_uri !== row.redirect_uri)) return c.json({ error: "invalid_grant" }, 400);
    const challenge = createHash("sha256").update(form.code_verifier ?? "").digest("base64url");
    if (challenge !== row.code_challenge) return c.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
    db.prepare("UPDATE oauth_codes SET used = 1 WHERE code_hash = ?").run(sha256(form.code!));
    return c.json(issueTokens(row.user_id, row.client_id, row.scope));
  }

  if (form.grant_type === "refresh_token") {
    const row = form.refresh_token
      ? (db.prepare("SELECT * FROM oauth_tokens WHERE refresh_hash = ?").get(sha256(form.refresh_token)) as
          | { id: string; user_id: string; client_id: string; scope: string | null }
          | undefined)
      : undefined;
    if (!row) return c.json({ error: "invalid_grant" }, 400);
    db.prepare("DELETE FROM oauth_tokens WHERE id = ?").run(row.id);
    return c.json(issueTokens(row.user_id, row.client_id, row.scope));
  }

  return c.json({ error: "unsupported_grant_type" }, 400);
});

// --- resource-side auth: resolve an OAuth bearer token to a user ---

export function userFromOAuthToken(token: string): users.User | null {
  const row = db
    .prepare(
      `SELECT u.id, u.handle, u.display_name, u.created_at, t.id AS token_id, t.expires_at
       FROM oauth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?`,
    )
    .get(sha256(token)) as (users.User & { token_id: string; expires_at: number }) | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  db.prepare("UPDATE oauth_tokens SET last_used_at = ? WHERE id = ?").run(Date.now(), row.token_id);
  const { token_id: _t, expires_at: _e, ...user } = row;
  return user;
}
