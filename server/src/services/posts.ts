import { db } from "../db.js";
import { ApiError, newId } from "../util.js";
import * as market from "./market.js";

export type RenderMode = "text" | "markdown" | "html";
export const RENDER_MODES: RenderMode[] = ["text", "markdown", "html"];

// Curated reaction set tuned for building-in-public (plan doc §9 — resolved: curated over free emoji).
export const REACTIONS = ["🚢", "🧠", "🔥", "👀", "🤝"] as const;

// Long posts are welcome (ADR-016) — the feed stays skimmable because clients
// render capped preview cards and only the opened post shows everything.
const MAX_BODY_LENGTH = 100_000;

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

export type Via = "web" | "agent";

export interface PostSummary {
  id: string;
  author: Author;
  body: string;
  render_mode: RenderMode;
  via: Via;
  created_at: number;
  edited_at: number | null;
  reply_count: number;
  reactions: ReactionSummary[];
  seen_by_me: boolean;
  tracks: TrackRef[];
}

export interface TrackRef {
  slug: string;
  title: string;
}

export interface ReplyDto {
  id: string;
  post_id: string;
  author: Author;
  body: string;
  render_mode: RenderMode;
  via: Via;
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
  via: Via;
  created_at: number;
  edited_at: number | null;
  sort_key: number;
  reply_count: number;
}

function toSummary(row: PostRow, viewerId: string): PostSummary {
  return {
    id: row.id,
    author: { id: row.author_id, handle: row.handle, display_name: row.display_name },
    body: row.body,
    render_mode: row.render_mode,
    via: row.via,
    created_at: row.created_at,
    edited_at: row.edited_at,
    reply_count: row.reply_count,
    reactions: reactionSummaries("post", row.id, viewerId),
    seen_by_me: !!db.prepare("SELECT 1 FROM seen WHERE user_id = ? AND post_id = ?").get(viewerId, row.id),
    tracks: db
      .prepare(
        "SELECT t.slug, t.title FROM post_tracks pt JOIN tracks t ON t.id = pt.track_id WHERE pt.post_id = ? ORDER BY pt.created_at",
      )
      .all(row.id) as TrackRef[],
  };
}

const POST_SELECT = `
  SELECT p.id, p.author_id, u.handle, u.display_name, p.body, p.render_mode, p.via, p.created_at, p.edited_at, p.sort_key,
         (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count
  FROM posts p JOIN users u ON u.id = p.author_id`;

// The `filter` param reserved in the v0 MCP schema, now implemented:
// "html" (artifact posts), "unseen" (posts the viewer hasn't seen), "by:<handle>".
function filterClause(filter: string | undefined, viewerId: string): { where: string; params: unknown[] } {
  if (!filter) return { where: "", params: [] };
  if (filter === "html") return { where: "p.render_mode = 'html'", params: [] };
  if (filter === "unseen")
    return { where: "NOT EXISTS (SELECT 1 FROM seen s WHERE s.user_id = ? AND s.post_id = p.id)", params: [viewerId] };
  if (filter.startsWith("by:")) return { where: "u.handle = ? COLLATE NOCASE", params: [filter.slice(3)] };
  throw new ApiError(400, 'filter must be "html", "unseen", or "by:<handle>"');
}

export function readFeed(
  viewerId: string,
  opts: { cursor?: string; limit?: number; filter?: string } = {},
): { posts: PostSummary[]; next_cursor?: string } {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const { where, params } = filterClause(opts.filter, viewerId);
  const conditions = where ? [where] : [];
  const queryParams: unknown[] = [...params];

  if (opts.cursor) {
    const [sortKeyStr, id] = opts.cursor.split("|");
    const sortKey = Number(sortKeyStr);
    if (!id || Number.isNaN(sortKey)) throw new ApiError(400, "Invalid cursor");
    conditions.push("(p.sort_key < ? OR (p.sort_key = ? AND p.id < ?))");
    queryParams.push(sortKey, sortKey, id);
  }

  const whereSql = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .prepare(`${POST_SELECT}${whereSql} ORDER BY p.sort_key DESC, p.id DESC LIMIT ?`)
    .all(...queryParams, limit + 1) as PostRow[];

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    posts: page.map((r) => toSummary(r, viewerId)),
    next_cursor: hasMore && last ? `${last.sort_key}|${last.id}` : undefined,
  };
}

// Agent briefing (ADR-015): everything your human missed, in one call.
export function catchUp(viewerId: string): {
  unseen_count: number;
  unseen_posts: PostSummary[];
  asks: Ask[];
  tracks_moved: { slug: string; title: string; new_stops: number }[];
  note: string;
} {
  const unseen = readFeed(viewerId, { filter: "unseen", limit: 20 });
  const count = (
    db
      .prepare("SELECT COUNT(*) AS n FROM posts p WHERE NOT EXISTS (SELECT 1 FROM seen s WHERE s.user_id = ? AND s.post_id = p.id)")
      .get(viewerId) as { n: number }
  ).n;
  const asks = asksFor(viewerId);
  const tracksMoved = db
    .prepare(
      `SELECT t.slug, t.title, COUNT(*) AS new_stops FROM post_tracks pt
       JOIN posts p ON p.id = pt.post_id JOIN tracks t ON t.id = pt.track_id
       WHERE NOT EXISTS (SELECT 1 FROM seen s WHERE s.user_id = ? AND s.post_id = p.id)
       GROUP BY pt.track_id ORDER BY MAX(p.created_at) DESC LIMIT 10`,
    )
    .all(viewerId) as { slug: string; title: string; new_stops: number }[];
  return {
    unseen_count: count,
    unseen_posts: unseen.posts,
    asks,
    tracks_moved: tracksMoved,
    note:
      (count === 0 ? "Your human is fully caught up on the room. " : "Summarize these conversationally for your human — lead with milestones and questions addressed to them. ") +
      (asks.length > 0
        ? "asks[] contains @mentions of your human — if you can answer one from context, reply on that post via the reply tool."
        : ""),
  };
}

export function getPost(viewerId: string, postId: string): { post: PostSummary; replies: ReplyDto[] } {
  const row = db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(postId) as PostRow | undefined;
  if (!row) throw new ApiError(404, "Post not found");
  const replyRows = db
    .prepare(
      `SELECT r.id, r.post_id, r.author_id, u.handle, u.display_name, r.body, r.render_mode, r.via, r.created_at
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
      via: r.via,
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
  via: Via = "web",
  trackSlugs: string[] = [],
): { post_id: string } {
  validateBody(body);
  validateRenderMode(renderMode);
  body = normalizeTrackSugar(body, authorId, renderMode);

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
    "INSERT INTO posts (id, author_id, body, render_mode, via, created_at, sort_key, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, authorId, body, renderMode, via, now, now, idempotencyKey ?? null);
  recordMentions("post", id, id, authorId, body);
  attachTracks(id, authorId, body, renderMode, trackSlugs);
  // conviction: a stop on a track earns more than a loose post (ADR-023)
  const onTrack = db.prepare("SELECT 1 FROM post_tracks WHERE post_id = ? LIMIT 1").get(id);
  market.award(authorId, onTrack ? 5 : 2, onTrack ? "stop" : "post", id);
  return { post_id: id };
}

export function createReply(
  authorId: string,
  postId: string,
  body: string,
  renderMode: string = "markdown",
  idempotencyKey?: string,
  via: Via = "web",
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
    "INSERT INTO replies (id, post_id, author_id, body, render_mode, via, created_at, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, postId, authorId, body, renderMode, via, Date.now(), idempotencyKey ?? null);
  recordMentions("reply", id, postId, authorId, body);
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
  // conviction flows to the author when the room reacts (never to self-reacts)
  const authorRow = db.prepare(`SELECT author_id FROM ${targetType === "post" ? "posts" : "replies"} WHERE id = ?`).get(targetId) as
    | { author_id: string }
    | undefined;
  if (authorRow && authorRow.author_id !== userId) market.award(authorRow.author_id, 3, "reaction", targetId);
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

// --- Asks: @handle mentions delivered to the mentioned member's agent (ADR-017) ---

const MENTION_RE = /(?:^|[^a-zA-Z0-9_@])@([a-zA-Z0-9_]{2,24})/g;

function recordMentions(sourceType: "post" | "reply", sourceId: string, postId: string, authorId: string, body: string): void {
  db.prepare("DELETE FROM mentions WHERE source_type = ? AND source_id = ?").run(sourceType, sourceId);
  const handles = new Set<string>();
  for (const match of body.matchAll(MENTION_RE)) {
    const handle = match[1];
    if (handle) handles.add(handle.toLowerCase());
  }
  const now = Date.now();
  for (const handle of handles) {
    const user = db.prepare("SELECT id FROM users WHERE handle = ? COLLATE NOCASE").get(handle) as { id: string } | undefined;
    if (!user || user.id === authorId) continue;
    db.prepare(
      "INSERT INTO mentions (id, source_type, source_id, post_id, mentioned_user_id, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(newId("m"), sourceType, sourceId, postId, user.id, authorId, now);
  }
}

export interface Ask {
  id: string;
  post_id: string;
  source_type: "post" | "reply";
  from: Author;
  snippet: string;
  created_at: number;
}

export function asksFor(userId: string, limit = 10): Ask[] {
  const rows = db
    .prepare(
      `SELECT m.id, m.post_id, m.source_type, m.source_id, m.created_at,
              u.id AS from_id, u.handle, u.display_name
       FROM mentions m JOIN users u ON u.id = m.author_id
       WHERE m.mentioned_user_id = ? ORDER BY m.created_at DESC LIMIT ?`,
    )
    .all(userId, limit) as {
    id: string; post_id: string; source_type: "post" | "reply"; source_id: string; created_at: number;
    from_id: string; handle: string; display_name: string;
  }[];
  return rows.map((r) => {
    const table = r.source_type === "post" ? "posts" : "replies";
    const src = db.prepare(`SELECT body FROM ${table} WHERE id = ?`).get(r.source_id) as { body: string } | undefined;
    return {
      id: r.id,
      post_id: r.post_id,
      source_type: r.source_type,
      from: { id: r.from_id, handle: r.handle, display_name: r.display_name },
      snippet: (src?.body ?? "").slice(0, 280),
      created_at: r.created_at,
    };
  });
}

// --- Living posts: authors (usually their agents) update a post in place (ADR-017) ---

export function updatePost(
  authorId: string,
  postId: string,
  body: string,
  renderMode?: string,
  trackSlugs: string[] = [],
): { post_id: string; edited_at: number } {
  validateBody(body);
  const post = db.prepare("SELECT author_id, render_mode FROM posts WHERE id = ?").get(postId) as
    | { author_id: string; render_mode: string }
    | undefined;
  if (!post) throw new ApiError(404, "Post not found");
  if (post.author_id !== authorId) throw new ApiError(403, "You can only update your own posts");
  const mode = renderMode ?? post.render_mode;
  validateRenderMode(mode);
  body = normalizeTrackSugar(body, authorId, mode);
  checkWriteRate(authorId);
  const now = Date.now();
  db.prepare("UPDATE posts SET body = ?, render_mode = ?, edited_at = ? WHERE id = ?").run(body, mode, now, postId);
  recordMentions("post", postId, postId, authorId, body);
  attachTracks(postId, authorId, body, mode, trackSlugs);
  return { post_id: postId, edited_at: now };
}

// --- Tracks (ADR-021): followable timelines of a feature/product/topic ---

const TRACK_INLINE_RE = /(?:^|[\s(])#((?:[a-z0-9_]{2,24}\/)?[a-z][a-z0-9-]{1,40})/g;
const TRACK_SLUG_RE = /^(?:[a-z0-9_]{2,24}\/)?[a-z][a-z0-9-]{1,40}$/;

function slugTitle(slug: string): string {
  const base = slug.includes("/") ? slug.split("/")[1]! : slug;
  return base.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function authorHandle(userId: string): string {
  return (db.prepare("SELECT handle FROM users WHERE id = ?").get(userId) as { handle: string }).handle.toLowerCase();
}

// #me/slug and #~slug are input sugar for #<yourhandle>/slug — rewritten in the
// stored body at write time so everyone always reads the canonical name.
export function normalizeTrackSugar(body: string, authorId: string, renderMode: string): string {
  if (renderMode === "html") return body;
  const handle = authorHandle(authorId);
  return body.replace(/#me\//gi, `#${handle}/`).replace(/#~(?=[a-z])/g, `#${handle}/`);
}

// Namespaced slugs ("handle/slug") are PERSONAL: only that member's posts
// attach — everyone else's usage renders as a reference, never an injection.
// Returns null when attachment isn't allowed (or the namespace is someone else's).
function ensureTrack(slug: string, userId: string, strict: boolean): string | null {
  const existing = db.prepare("SELECT id, owner_id, shipped_at FROM tracks WHERE slug = ?").get(slug) as
    | { id: string; owner_id: string | null; shipped_at: number | null }
    | undefined;
  const ns = slug.includes("/") ? slug.split("/")[0]! : null;

  if (existing) {
    if (existing.owner_id && existing.owner_id !== userId) {
      if (strict) throw new ApiError(403, `#${slug} is @${ns}'s personal track — only their posts can join it`);
      return null;
    }
    if (existing.shipped_at) {
      if (strict) throw new ApiError(409, `#${slug} is shipped — its story is closed. Unship it first to add more stops.`);
      return null;
    }
    return existing.id;
  }

  let ownerId: string | null = null;
  if (ns) {
    const owner = db.prepare("SELECT id FROM users WHERE handle = ? COLLATE NOCASE").get(ns) as { id: string } | undefined;
    if (!owner) {
      if (strict) throw new ApiError(400, `No member @${ns} — personal tracks are #<handle>/slug (or #me/slug for your own)`);
      return null;
    }
    if (owner.id !== userId) {
      if (strict) throw new ApiError(403, `#${slug} would be @${ns}'s personal track — you can reference it, not create it`);
      return null;
    }
    ownerId = owner.id;
  }

  const id = newId("t");
  db.prepare("INSERT INTO tracks (id, slug, title, created_by, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    slug,
    slugTitle(slug),
    userId,
    ownerId,
    Date.now(),
  );
  return id;
}

// Inline #slug works in text/markdown (silent skip when not permitted); html
// artifacts attach via the explicit tracks param (MCP), which errors loudly.
function attachTracks(postId: string, authorId: string, body: string, renderMode: string, explicit: string[]): void {
  const handle = authorHandle(authorId);
  const strictSlugs = new Set<string>();
  for (const raw of explicit) {
    let slug = raw.toLowerCase().replace(/^#/, "").trim();
    slug = slug.replace(/^me\//, `${handle}/`).replace(/^~/, `${handle}/`);
    if (!TRACK_SLUG_RE.test(slug)) throw new ApiError(400, `Invalid track slug: "${raw}"`);
    strictSlugs.add(slug);
  }
  const inlineSlugs = new Set<string>();
  if (renderMode !== "html") {
    for (const match of body.matchAll(TRACK_INLINE_RE)) {
      if (match[1]) inlineSlugs.add(match[1].toLowerCase());
    }
  }
  const now = Date.now();
  for (const [slugSet, strict] of [[strictSlugs, true], [inlineSlugs, false]] as const) {
    for (const slug of slugSet) {
      const trackId = ensureTrack(slug, authorId, strict);
      if (trackId)
        db.prepare("INSERT OR IGNORE INTO post_tracks (post_id, track_id, created_at) VALUES (?, ?, ?)").run(postId, trackId, now);
    }
  }
}

export interface TrackSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  created_at: number;
  owner: Author | null;
  shipped_at: number | null;
  post_count: number;
  recent_count: number;
  last_post_at: number | null;
  contributors: Author[];
}

function trackSummary(row: { id: string; slug: string; title: string; description: string | null; created_at: number; owner_id?: string | null; shipped_at?: number | null }): TrackSummary {
  const owner = row.owner_id
    ? (db.prepare("SELECT id, handle, display_name FROM users WHERE id = ?").get(row.owner_id) as Author)
    : null;
  const stats = db
    .prepare(
      `SELECT COUNT(*) AS n, MAX(p.created_at) AS last,
              SUM(CASE WHEN p.created_at > ? THEN 1 ELSE 0 END) AS recent
       FROM post_tracks pt JOIN posts p ON p.id = pt.post_id WHERE pt.track_id = ?`,
    )
    .get(Date.now() - 7 * 24 * 60 * 60 * 1000, row.id) as { n: number; last: number | null; recent: number | null };
  const contributors = db
    .prepare(
      `SELECT DISTINCT u.id, u.handle, u.display_name FROM post_tracks pt
       JOIN posts p ON p.id = pt.post_id JOIN users u ON u.id = p.author_id
       WHERE pt.track_id = ? ORDER BY u.handle LIMIT 8`,
    )
    .all(row.id) as Author[];
  const { owner_id: _o, ...rest } = row;
  return {
    ...rest,
    owner,
    shipped_at: row.shipped_at ?? null,
    post_count: stats.n,
    recent_count: stats.recent ?? 0,
    last_post_at: stats.last,
    contributors,
  };
}

export function listTracks(): TrackSummary[] {
  const rows = db.prepare("SELECT id, slug, title, description, owner_id, shipped_at, created_at FROM tracks").all() as Parameters<typeof trackSummary>[0][];
  return rows.map(trackSummary).sort((a, b) => (b.last_post_at ?? 0) - (a.last_post_at ?? 0));
}

// A track reads chronologically — it's the story of the thing being built.
export function getTrack(viewerId: string, slug: string): { track: TrackSummary; posts: PostSummary[]; related: RelatedTrack[] } {
  const row = db.prepare("SELECT id, slug, title, description, owner_id, shipped_at, created_at FROM tracks WHERE slug = ?").get(slug.toLowerCase()) as
    | Parameters<typeof trackSummary>[0]
    | undefined;
  if (!row) throw new ApiError(404, "Track not found");
  const postRows = db
    .prepare(`${POST_SELECT} JOIN post_tracks pt ON pt.post_id = p.id WHERE pt.track_id = ? ORDER BY p.created_at ASC`)
    .all(row.id) as PostRow[];
  return { track: trackSummary(row), posts: postRows.map((r) => toSummary(r, viewerId)), related: relatedTracks(row.id) };
}

export interface RelatedTrack {
  slug: string;
  title: string;
  shared_posts: number;
  shared_contributors: number;
}

// Crossings: tracks that share posts (strong tie) or contributors (weak tie).
function relatedTracks(trackId: string): RelatedTrack[] {
  const byPost = db
    .prepare(
      `SELECT t.slug, t.title, COUNT(*) AS n FROM post_tracks a
       JOIN post_tracks b ON b.post_id = a.post_id AND b.track_id != a.track_id
       JOIN tracks t ON t.id = b.track_id WHERE a.track_id = ? GROUP BY b.track_id`,
    )
    .all(trackId) as { slug: string; title: string; n: number }[];
  const byPerson = db
    .prepare(
      `SELECT t.slug, t.title, COUNT(DISTINCT p2.author_id) AS n
       FROM post_tracks a JOIN posts p1 ON p1.id = a.post_id
       JOIN posts p2 ON p2.author_id = p1.author_id
       JOIN post_tracks b ON b.post_id = p2.id AND b.track_id != a.track_id
       JOIN tracks t ON t.id = b.track_id WHERE a.track_id = ? GROUP BY b.track_id`,
    )
    .all(trackId) as { slug: string; title: string; n: number }[];
  const merged = new Map<string, RelatedTrack>();
  for (const r of byPerson) merged.set(r.slug, { slug: r.slug, title: r.title, shared_posts: 0, shared_contributors: r.n });
  for (const r of byPost) {
    const e = merged.get(r.slug) ?? { slug: r.slug, title: r.title, shared_posts: 0, shared_contributors: 0 };
    e.shared_posts = r.n;
    merged.set(r.slug, e);
  }
  return [...merged.values()].sort((a, b) => b.shared_posts - a.shared_posts || b.shared_contributors - a.shared_contributors).slice(0, 6);
}

// Shipping ritual (ADR-022): close the story. Any contributor may ship a
// communal track; personal tracks ship only by their owner.
export function shipTrack(userId: string, slug: string, ship: boolean): TrackSummary {
  const row = db.prepare("SELECT id, slug, title, description, owner_id, shipped_at, created_at FROM tracks WHERE slug = ?").get(slug.toLowerCase()) as
    | (Parameters<typeof trackSummary>[0] & { id: string; owner_id: string | null })
    | undefined;
  if (!row) throw new ApiError(404, "Track not found");
  if (row.owner_id && row.owner_id !== userId) throw new ApiError(403, "Only the owner can ship a personal track");
  if (!row.owner_id) {
    const contributed = db
      .prepare("SELECT 1 FROM post_tracks pt JOIN posts p ON p.id = pt.post_id WHERE pt.track_id = ? AND p.author_id = ? LIMIT 1")
      .get(row.id, userId);
    if (!contributed) throw new ApiError(403, "Only contributors can ship a communal track");
  }
  const shippedAt = ship ? Date.now() : null;
  db.prepare("UPDATE tracks SET shipped_at = ? WHERE id = ?").run(shippedAt, row.id);
  if (ship) {
    for (const c of market.shipContributors(row.id)) market.award(c.id, 50, "ship", row.id);
    market.resolveLineForShip(row.id);
  }
  return trackSummary({ ...row, shipped_at: shippedAt });
}

// The room as a graph: tracks + people as nodes; edges from contribution,
// shared posts, and person-to-person interaction (replies + mentions).
export function graphData(): {
  tracks: (TrackSummary & { node: string })[];
  people: { node: string; id: string; handle: string; display_name: string; created_at: number; post_count: number }[];
  edges: { source: string; target: string; kind: "contributes" | "crossing" | "interacts"; weight: number; first_at: number }[];
} {
  const tracks = listTracks().map((t) => ({ ...t, node: `t:${t.id}` }));
  const people = (
    db.prepare("SELECT id, handle, display_name, created_at FROM users").all() as { id: string; handle: string; display_name: string; created_at: number }[]
  ).map((u) => ({
    node: `u:${u.id}`,
    ...u,
    post_count: (db.prepare("SELECT COUNT(*) AS n FROM posts WHERE author_id = ?").get(u.id) as { n: number }).n,
  }));
  const edges: { source: string; target: string; kind: "contributes" | "crossing" | "interacts"; weight: number; first_at: number }[] = [];
  const contrib = db
    .prepare(
      `SELECT pt.track_id, p.author_id, COUNT(*) AS n, MIN(p.created_at) AS first_at
       FROM post_tracks pt JOIN posts p ON p.id = pt.post_id GROUP BY pt.track_id, p.author_id`,
    )
    .all() as { track_id: string; author_id: string; n: number; first_at: number }[];
  for (const c of contrib) edges.push({ source: `u:${c.author_id}`, target: `t:${c.track_id}`, kind: "contributes", weight: c.n, first_at: c.first_at });
  const crossings = db
    .prepare(
      `SELECT a.track_id AS ta, b.track_id AS tb, COUNT(*) AS n, MIN(p.created_at) AS first_at
       FROM post_tracks a JOIN post_tracks b ON b.post_id = a.post_id AND b.track_id > a.track_id
       JOIN posts p ON p.id = a.post_id GROUP BY a.track_id, b.track_id`,
    )
    .all() as { ta: string; tb: string; n: number; first_at: number }[];
  for (const c of crossings) edges.push({ source: `t:${c.ta}`, target: `t:${c.tb}`, kind: "crossing", weight: c.n, first_at: c.first_at });
  const interacts = db
    .prepare(
      `SELECT r.author_id AS a, p.author_id AS b, COUNT(*) AS n, MIN(r.created_at) AS first_at
       FROM replies r JOIN posts p ON p.id = r.post_id WHERE r.author_id != p.author_id GROUP BY r.author_id, p.author_id`,
    )
    .all() as { a: string; b: string; n: number; first_at: number }[];
  for (const i of interacts) edges.push({ source: `u:${i.a}`, target: `u:${i.b}`, kind: "interacts", weight: i.n, first_at: i.first_at });
  return { tracks, people, edges };
}

export function updateTrack(slug: string, fields: { title?: string; description?: string }): TrackSummary {
  const row = db.prepare("SELECT id, slug, title, description, owner_id, shipped_at, created_at FROM tracks WHERE slug = ?").get(slug.toLowerCase()) as
    | Parameters<typeof trackSummary>[0]
    | undefined;
  if (!row) throw new ApiError(404, "Track not found");
  const title = fields.title?.trim() || row.title;
  const description = fields.description !== undefined ? fields.description.trim() || null : row.description;
  db.prepare("UPDATE tracks SET title = ?, description = ? WHERE id = ?").run(title, description, row.id);
  return trackSummary({ ...row, title, description });
}
