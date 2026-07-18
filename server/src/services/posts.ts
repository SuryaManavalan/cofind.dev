import { db } from "../db.js";
import { ApiError, newId } from "../util.js";

export type RenderMode = "text" | "markdown" | "html";
export const RENDER_MODES: RenderMode[] = ["text", "markdown", "html"];

// Curated reaction set tuned for building-in-public (plan doc §9 — resolved: curated over free emoji).
export const REACTIONS = ["🚢", "🧠", "🔥", "👀", "🤝"] as const;

const MAX_BODY_LENGTH = 20_000;

export interface Author {
  id: string;
  handle: string;
  display_name: string;
}

export interface ReactionSummary {
  reaction: string;
  count: number;
  reacted_by_me: boolean;
}

export interface PostSummary {
  id: string;
  author: Author;
  body: string;
  render_mode: RenderMode;
  created_at: number;
  reply_count: number;
  reactions: ReactionSummary[];
}

export interface ReplyDto {
  id: string;
  post_id: string;
  author: Author;
  body: string;
  render_mode: RenderMode;
  created_at: number;
  reactions: ReactionSummary[];
}

// --- simple per-user write rate limit (architecture doc §7: agents can loop) ---
const WRITE_LIMIT = 30;
const WRITE_WINDOW_MS = 5 * 60 * 1000;
const writeLog = new Map<string, number[]>();

function checkWriteRate(userId: string): void {
  const now = Date.now();
  const recent = (writeLog.get(userId) ?? []).filter((t) => now - t < WRITE_WINDOW_MS);
  if (recent.length >= WRITE_LIMIT) throw new ApiError(429, "Rate limit exceeded: max 30 writes per 5 minutes");
  recent.push(now);
  writeLog.set(userId, recent);
}

function validateBody(body: string): void {
  if (!body.trim()) throw new ApiError(400, "Body cannot be empty");
  if (body.length > MAX_BODY_LENGTH) throw new ApiError(400, `Body too long (max ${MAX_BODY_LENGTH} chars)`);
}

function validateRenderMode(mode: string): asserts mode is RenderMode {
  if (!RENDER_MODES.includes(mode as RenderMode)) throw new ApiError(400, "render_mode must be text, markdown, or html");
}

function reactionSummaries(targetType: "post" | "reply", targetId: string, viewerId: string): ReactionSummary[] {
  const rows = db
    .prepare(
      `SELECT reaction, COUNT(*) AS count, MAX(user_id = ?) AS reacted_by_me
       FROM reactions WHERE target_type = ? AND target_id = ? GROUP BY reaction`,
    )
    .all(viewerId, targetType, targetId) as { reaction: string; count: number; reacted_by_me: number }[];
  return rows.map((r) => ({ reaction: r.reaction, count: r.count, reacted_by_me: !!r.reacted_by_me }));
}

interface PostRow {
  id: string;
  author_id: string;
  handle: string;
  display_name: string;
  body: string;
  render_mode: RenderMode;
  created_at: number;
  sort_key: number;
  reply_count: number;
}

function toSummary(row: PostRow, viewerId: string): PostSummary {
  return {
    id: row.id,
    author: { id: row.author_id, handle: row.handle, display_name: row.display_name },
    body: row.body,
    render_mode: row.render_mode,
    created_at: row.created_at,
    reply_count: row.reply_count,
    reactions: reactionSummaries("post", row.id, viewerId),
  };
}

const POST_SELECT = `
  SELECT p.id, p.author_id, u.handle, u.display_name, p.body, p.render_mode, p.created_at, p.sort_key,
         (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count
  FROM posts p JOIN users u ON u.id = p.author_id`;

export function readFeed(
  viewerId: string,
  opts: { cursor?: string; limit?: number } = {},
): { posts: PostSummary[]; next_cursor?: string } {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  let rows: PostRow[];
  if (opts.cursor) {
    const [sortKeyStr, id] = opts.cursor.split("|");
    const sortKey = Number(sortKeyStr);
    if (!id || Number.isNaN(sortKey)) throw new ApiError(400, "Invalid cursor");
    rows = db
      .prepare(`${POST_SELECT} WHERE (p.sort_key < ? OR (p.sort_key = ? AND p.id < ?)) ORDER BY p.sort_key DESC, p.id DESC LIMIT ?`)
      .all(sortKey, sortKey, id, limit + 1) as PostRow[];
  } else {
    rows = db.prepare(`${POST_SELECT} ORDER BY p.sort_key DESC, p.id DESC LIMIT ?`).all(limit + 1) as PostRow[];
  }
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    posts: page.map((r) => toSummary(r, viewerId)),
    next_cursor: hasMore && last ? `${last.sort_key}|${last.id}` : undefined,
  };
}

export function getPost(viewerId: string, postId: string): { post: PostSummary; replies: ReplyDto[] } {
  const row = db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(postId) as PostRow | undefined;
  if (!row) throw new ApiError(404, "Post not found");
  const replyRows = db
    .prepare(
      `SELECT r.id, r.post_id, r.author_id, u.handle, u.display_name, r.body, r.render_mode, r.created_at
       FROM replies r JOIN users u ON u.id = r.author_id WHERE r.post_id = ? ORDER BY r.created_at ASC`,
    )
    .all(postId) as (Omit<ReplyDto, "author" | "reactions"> & { author_id: string; handle: string; display_name: string })[];
  return {
    post: toSummary(row, viewerId),
    replies: replyRows.map((r) => ({
      id: r.id,
      post_id: r.post_id,
      author: { id: r.author_id, handle: r.handle, display_name: r.display_name },
      body: r.body,
      render_mode: r.render_mode,
      created_at: r.created_at,
      reactions: reactionSummaries("reply", r.id, viewerId),
    })),
  };
}

export function createPost(
  authorId: string,
  body: string,
  renderMode: string,
  idempotencyKey?: string,
): { post_id: string } {
  validateBody(body);
  validateRenderMode(renderMode);

  if (idempotencyKey) {
    const existing = db.prepare("SELECT id FROM posts WHERE author_id = ? AND idempotency_key = ?").get(authorId, idempotencyKey) as
      | { id: string }
      | undefined;
    if (existing) return { post_id: existing.id };
  }

  checkWriteRate(authorId);
  const id = newId("p");
  const now = Date.now();
  // sort_key = created_at for v0 reverse-chron (ADR-002); v1 engagement bump recomputes this field.
  db.prepare(
    "INSERT INTO posts (id, author_id, body, render_mode, created_at, sort_key, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, authorId, body, renderMode, now, now, idempotencyKey ?? null);
  return { post_id: id };
}

export function createReply(
  authorId: string,
  postId: string,
  body: string,
  renderMode: string = "markdown",
  idempotencyKey?: string,
): { reply_id: string } {
  validateBody(body);
  validateRenderMode(renderMode);
  const post = db.prepare("SELECT id FROM posts WHERE id = ?").get(postId);
  if (!post) throw new ApiError(404, "Post not found");

  if (idempotencyKey) {
    const existing = db.prepare("SELECT id FROM replies WHERE author_id = ? AND idempotency_key = ?").get(authorId, idempotencyKey) as
      | { id: string }
      | undefined;
    if (existing) return { reply_id: existing.id };
  }

  checkWriteRate(authorId);
  const id = newId("r");
  db.prepare(
    "INSERT INTO replies (id, post_id, author_id, body, render_mode, created_at, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, postId, authorId, body, renderMode, Date.now(), idempotencyKey ?? null);
  return { reply_id: id };
}

export function react(userId: string, targetId: string, reaction: string): { ok: true; added: boolean } {
  if (!(REACTIONS as readonly string[]).includes(reaction)) {
    throw new ApiError(400, `Reaction must be one of: ${REACTIONS.join(" ")}`);
  }
  const targetType = db.prepare("SELECT id FROM posts WHERE id = ?").get(targetId)
    ? "post"
    : db.prepare("SELECT id FROM replies WHERE id = ?").get(targetId)
      ? "reply"
      : null;
  if (!targetType) throw new ApiError(404, "Target not found");

  const existing = db
    .prepare("SELECT id FROM reactions WHERE target_type = ? AND target_id = ? AND user_id = ? AND reaction = ?")
    .get(targetType, targetId, userId, reaction) as { id: string } | undefined;
  if (existing) {
    // Toggle off — matches the human UI; the MCP tool documents this behavior.
    db.prepare("DELETE FROM reactions WHERE id = ?").run(existing.id);
    return { ok: true, added: false };
  }
  checkWriteRate(userId);
  db.prepare("INSERT INTO reactions (id, target_type, target_id, user_id, reaction, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    newId("re"),
    targetType,
    targetId,
    userId,
    reaction,
    Date.now(),
  );
  return { ok: true, added: true };
}

export function markSeen(userId: string, postIds: string[]): void {
  const stmt = db.prepare("INSERT OR IGNORE INTO seen (user_id, post_id, seen_at) VALUES (?, ?, ?)");
  const now = Date.now();
  const tx = db.transaction((ids: string[]) => {
    for (const id of ids) stmt.run(userId, id, now);
  });
  tx(postIds);
}
