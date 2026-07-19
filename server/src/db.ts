import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.COFIND_DB_PATH ?? "data/cofind.db";

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  handle        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Personal access tokens: how agents authenticate to the MCP endpoint as the user
-- (v0 stand-in for the full OAuth authorization server; see ADR-010).
CREATE TABLE IF NOT EXISTS access_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  token_hash   TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE TABLE IF NOT EXISTS posts (
  id              TEXT PRIMARY KEY,
  author_id       TEXT NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL,
  render_mode     TEXT NOT NULL CHECK (render_mode IN ('text','markdown','html')),
  created_at      INTEGER NOT NULL,
  sort_key        INTEGER NOT NULL,
  edited_at       INTEGER,
  idempotency_key TEXT,
  UNIQUE (author_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_posts_sort ON posts (sort_key DESC, id DESC);

CREATE TABLE IF NOT EXISTS replies (
  id              TEXT PRIMARY KEY,
  post_id         TEXT NOT NULL REFERENCES posts(id),
  author_id       TEXT NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL,
  render_mode     TEXT NOT NULL CHECK (render_mode IN ('text','markdown','html')),
  created_at      INTEGER NOT NULL,
  idempotency_key TEXT,
  UNIQUE (author_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_replies_post ON replies (post_id, created_at);

CREATE TABLE IF NOT EXISTS reactions (
  id          TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('post','reply')),
  target_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users(id),
  reaction    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (target_type, target_id, user_id, reaction)
);
CREATE INDEX IF NOT EXISTS idx_reactions_target ON reactions (target_type, target_id);

CREATE TABLE IF NOT EXISTS seen (
  user_id TEXT NOT NULL REFERENCES users(id),
  post_id TEXT NOT NULL REFERENCES posts(id),
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

-- Audit trail for MCP tool calls (architecture doc §7: observability).
-- Doubles as the "agent pulse" feed in the UI (ADR-013).
CREATE TABLE IF NOT EXISTS mcp_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  tool       TEXT NOT NULL,
  args_json  TEXT NOT NULL,
  ok         INTEGER NOT NULL,
  error      TEXT,
  created_at INTEGER NOT NULL
);
`);

// Additive migrations for existing databases (CREATE TABLE IF NOT EXISTS won't grow columns).
function addColumn(table: string, ddl: string) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  } catch {
    // column already exists
  }
}

// Provenance: how the content was written — 'web' (by hand) or 'agent' (via MCP). ADR-013.
addColumn("posts", "via TEXT NOT NULL DEFAULT 'web'");
addColumn("replies", "via TEXT NOT NULL DEFAULT 'web'");
// Human presence (plan doc OPEN item, resolved): bumped by authed web activity.
addColumn("users", "last_active_at INTEGER");

// OAuth authorization server (ADR-019): the claude.ai connector path.
// Coexists with access_tokens (PATs) per ADR-010's design.
db.exec(`
CREATE TABLE IF NOT EXISTS oauth_clients (
  id                         TEXT PRIMARY KEY,
  name                       TEXT NOT NULL,
  redirect_uris              TEXT NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
  created_at                 INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash      TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope          TEXT,
  expires_at     INTEGER NOT NULL,
  used           INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  refresh_hash TEXT UNIQUE,
  user_id      TEXT NOT NULL REFERENCES users(id),
  client_id    TEXT NOT NULL,
  scope        TEXT,
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);
`);

// Tracks (ADR-021): named, room-global timelines that link posts into a
// followable story of a feature/product/topic. #slug in a body attaches.
db.exec(`
CREATE TABLE IF NOT EXISTS tracks (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT,
  created_by  TEXT NOT NULL REFERENCES users(id),
  owner_id    TEXT REFERENCES users(id),
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS post_tracks (
  post_id    TEXT NOT NULL REFERENCES posts(id),
  track_id   TEXT NOT NULL REFERENCES tracks(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, track_id)
);
CREATE INDEX IF NOT EXISTS idx_post_tracks_track ON post_tracks (track_id, created_at);
`);

// Personal tracks (ADR-021 amendment): owner_id set => only the owner's posts attach.
addColumn("tracks", "owner_id TEXT REFERENCES users(id)");

// Profiles (ADR-021): a line about you and a link, editable in Settings.
addColumn("users", "bio TEXT");
addColumn("users", "link TEXT");

// Asks (ADR-017): @handle mentions, delivered to the mentioned member's agent via catch_up.
db.exec(`
CREATE TABLE IF NOT EXISTS mentions (
  id                TEXT PRIMARY KEY,
  source_type       TEXT NOT NULL CHECK (source_type IN ('post','reply')),
  source_id         TEXT NOT NULL,
  post_id           TEXT NOT NULL,
  mentioned_user_id TEXT NOT NULL REFERENCES users(id),
  author_id         TEXT NOT NULL REFERENCES users(id),
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mentions_user ON mentions (mentioned_user_id, created_at DESC);
`);
