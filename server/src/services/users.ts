import { db } from "../db.js";
import { ApiError, hashPassword, newId, newSecret, sha256, verifyPassword } from "../util.js";

const INVITE_CODE = process.env.COFIND_INVITE_CODE ?? "cofind-friends";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 days — small trusted room

export interface User {
  id: string;
  handle: string;
  display_name: string;
  created_at: number;
}

export interface Member extends User {
  last_active_at: number | null;
}

const userColumns = "id, handle, display_name, created_at";

// Presence (plan doc OPEN item, resolved): bump on authed web activity,
// throttled in-memory so it isn't a write per request.
const lastBump = new Map<string, number>();

export function touchPresence(userId: string): void {
  const now = Date.now();
  if (now - (lastBump.get(userId) ?? 0) < 60_000) return;
  lastBump.set(userId, now);
  db.prepare("UPDATE users SET last_active_at = ? WHERE id = ?").run(now, userId);
}

export function join(inviteCode: string, handle: string, displayName: string, password: string): { user: User; sessionToken: string } {
  if (inviteCode !== INVITE_CODE) throw new ApiError(403, "Invalid invite code");
  if (!/^[a-zA-Z0-9_]{2,24}$/.test(handle)) throw new ApiError(400, "Handle must be 2-24 chars, alphanumeric or underscore");
  if (!displayName.trim()) throw new ApiError(400, "Display name required");
  if (password.length < 8) throw new ApiError(400, "Password must be at least 8 characters");

  const existing = db.prepare("SELECT id FROM users WHERE handle = ?").get(handle);
  if (existing) throw new ApiError(409, "Handle already taken");

  const user: User = {
    id: newId("u"),
    handle,
    display_name: displayName.trim(),
    created_at: Date.now(),
  };
  db.prepare("INSERT INTO users (id, handle, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
    user.id,
    user.handle,
    user.display_name,
    hashPassword(password),
    user.created_at,
  );
  return { user, sessionToken: createSession(user.id) };
}

export function login(handle: string, password: string): { user: User; sessionToken: string } {
  const row = db.prepare(`SELECT ${userColumns}, password_hash FROM users WHERE handle = ?`).get(handle) as
    | (User & { password_hash: string })
    | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) throw new ApiError(401, "Invalid handle or password");
  const { password_hash: _ph, ...user } = row;
  return { user, sessionToken: createSession(user.id) };
}

function createSession(userId: string): string {
  const token = newSecret("sess");
  const now = Date.now();
  db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    sha256(token),
    userId,
    now,
    now + SESSION_TTL_MS,
  );
  return token;
}

export function userFromSession(token: string): User | null {
  const row = db
    .prepare(
      `SELECT u.id, u.handle, u.display_name, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(sha256(token), Date.now()) as User | undefined;
  return row ?? null;
}

export function logout(token: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sha256(token));
}

export function createAccessToken(userId: string, label: string): { id: string; token: string; label: string } {
  const token = newSecret("cofind_pat");
  const id = newId("tok");
  db.prepare("INSERT INTO access_tokens (id, user_id, token_hash, label, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    userId,
    sha256(token),
    label || "unnamed",
    Date.now(),
  );
  return { id, token, label: label || "unnamed" };
}

export function listAccessTokens(userId: string) {
  return db
    .prepare("SELECT id, label, created_at, last_used_at FROM access_tokens WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId);
}

export function revokeAccessToken(userId: string, tokenId: string): void {
  const res = db.prepare("DELETE FROM access_tokens WHERE id = ? AND user_id = ?").run(tokenId, userId);
  if (res.changes === 0) throw new ApiError(404, "Token not found");
}

export function userFromAccessToken(token: string): User | null {
  const row = db
    .prepare(
      `SELECT u.id, u.handle, u.display_name, u.created_at, t.id AS token_id
       FROM access_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?`,
    )
    .get(sha256(token)) as (User & { token_id: string }) | undefined;
  if (!row) return null;
  db.prepare("UPDATE access_tokens SET last_used_at = ? WHERE id = ?").run(Date.now(), row.token_id);
  const { token_id: _tid, ...user } = row;
  return user;
}

export function listMembers(): Member[] {
  return db.prepare(`SELECT ${userColumns}, last_active_at FROM users ORDER BY created_at ASC`).all() as Member[];
}

export interface AgentActivity {
  id: number;
  tool: string;
  ok: boolean;
  created_at: number;
  handle: string;
  display_name: string;
}

// The MCP audit log surfaced as the room's "agent pulse" (ADR-013).
export function recentAgentActivity(limit = 25): AgentActivity[] {
  const rows = db
    .prepare(
      `SELECT l.id, l.tool, l.ok, l.created_at, u.handle, u.display_name
       FROM mcp_log l JOIN users u ON u.id = l.user_id
       ORDER BY l.id DESC LIMIT ?`,
    )
    .all(limit) as (Omit<AgentActivity, "ok"> & { ok: number })[];
  return rows.map((r) => ({ ...r, ok: !!r.ok }));
}
