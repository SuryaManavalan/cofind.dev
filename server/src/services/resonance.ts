import { db } from "../db.js";
import { ApiError, newId } from "../util.js";
import * as market from "./market.js";

// Resonance (ADR-024): aimed, costly, feeling-carrying gestures between
// friends and their agents. Amplify burns conviction on someone else's
// moment; toasts gather the room around a ship; briefings give agents a
// channel to each other; vibes give posts emotional texture that rolls up
// into the room's weather.

export const VIBES = ["breakthrough", "charging", "flowing", "grinding", "seeding"] as const;
export type Vibe = (typeof VIBES)[number];

export const AMPLIFY_COST = 5; // burned — the economy's first sink
export const AMPLIFY_MINT = 3; // author mints (once per post per amplifier)

// --- amplify ---

export function amplify(userId: string, postId: string): { ok: true; amplifier_balance: number } {
  const post = db.prepare("SELECT id, author_id FROM posts WHERE id = ?").get(postId) as { id: string; author_id: string } | undefined;
  if (!post) throw new ApiError(404, "Post not found");
  if (post.author_id === userId) throw new ApiError(400, "You can't amplify your own post — spend it on a friend");
  const already = db.prepare("SELECT 1 FROM amplifies WHERE post_id = ? AND user_id = ?").get(postId, userId);
  if (already) throw new ApiError(409, "Already amplified");
  if (market.balance(userId) < AMPLIFY_COST) throw new ApiError(400, `Amplify costs ${AMPLIFY_COST} conviction — earn it by building`);

  const tx = db.transaction(() => {
    db.prepare("INSERT INTO amplifies (post_id, user_id, created_at) VALUES (?, ?, ?)").run(postId, userId, Date.now());
    market.award(userId, -AMPLIFY_COST, "amplify_sent", postId); // burned, not transferred
    market.award(post.author_id, AMPLIFY_MINT, "amplified", `${postId}:${userId}`);
  });
  tx();
  return { ok: true, amplifier_balance: market.balance(userId) };
}

export function amplifiersOf(postId: string): { handle: string; display_name: string }[] {
  return db
    .prepare(
      `SELECT u.handle, u.display_name FROM amplifies a JOIN users u ON u.id = a.user_id
       WHERE a.post_id = ? ORDER BY a.created_at ASC LIMIT 12`,
    )
    .all(postId) as { handle: string; display_name: string }[];
}

// --- toasts ---

export interface Toast {
  handle: string;
  display_name: string;
  body: string;
  created_at: number;
}

export function toastShip(userId: string, slug: string, body: string): { ok: true } {
  const track = db.prepare("SELECT id, shipped_at, owner_id FROM tracks WHERE slug = ?").get(slug.toLowerCase()) as
    | { id: string; shipped_at: number | null; owner_id: string | null }
    | undefined;
  if (!track) throw new ApiError(404, "Track not found");
  if (!track.shipped_at) throw new ApiError(409, "Toasts are for shipped tracks — this one is still building");
  const text = body.trim();
  if (!text) throw new ApiError(400, "A toast needs words");
  if (text.length > 140) throw new ApiError(400, "Toasts are one line — 140 chars max");
  // The shipper doesn't toast their own ship; the room does.
  const shippers = market.shipContributors(track.id).map((c) => c.id);
  if (track.owner_id ? track.owner_id === userId : shippers.includes(userId))
    throw new ApiError(400, "The toast is for you, not from you — let the room raise the glass");
  const already = db.prepare("SELECT 1 FROM toasts WHERE track_id = ? AND user_id = ?").get(track.id, userId);
  if (already) throw new ApiError(409, "One toast per person per ship");
  db.prepare("INSERT INTO toasts (track_id, user_id, body, created_at) VALUES (?, ?, ?, ?)").run(track.id, userId, text, Date.now());
  return { ok: true };
}

export function toastsFor(trackId: string): Toast[] {
  return db
    .prepare(
      `SELECT u.handle, u.display_name, t.body, t.created_at FROM toasts t JOIN users u ON u.id = t.user_id
       WHERE t.track_id = ? ORDER BY t.created_at ASC`,
    )
    .all(trackId) as Toast[];
}

// --- briefings: the agent-to-agent channel ---

export function briefAgent(fromUserId: string, toHandle: string, note: string, postId?: string): { ok: true } {
  const to = db.prepare("SELECT id FROM users WHERE handle = ? COLLATE NOCASE").get(toHandle.replace(/^@/, "")) as
    | { id: string }
    | undefined;
  if (!to) throw new ApiError(404, "No such member");
  if (to.id === fromUserId) throw new ApiError(400, "Your agent already knows — brief a friend's agent");
  const text = note.trim();
  if (!text) throw new ApiError(400, "A briefing needs content");
  if (text.length > 1000) throw new ApiError(400, "Briefings are notes, not essays — 1000 chars max");
  if (postId && !db.prepare("SELECT 1 FROM posts WHERE id = ?").get(postId)) throw new ApiError(404, "Referenced post not found");
  db.prepare("INSERT INTO briefings (id, from_user, to_user, note, post_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    newId("bf"),
    fromUserId,
    to.id,
    text,
    postId ?? null,
    Date.now(),
  );
  return { ok: true };
}

export interface BriefingDto {
  from: string;
  note: string;
  post_id: string | null;
  created_at: number;
}

// Unread briefings for catch_up — reading them marks them read (delivered once).
export function collectBriefings(userId: string): BriefingDto[] {
  const rows = db
    .prepare(
      `SELECT b.id, u.handle AS "from", b.note, b.post_id, b.created_at FROM briefings b
       JOIN users u ON u.id = b.from_user WHERE b.to_user = ? AND b.read_at IS NULL ORDER BY b.created_at ASC LIMIT 20`,
    )
    .all(userId) as (BriefingDto & { id: string })[];
  if (rows.length > 0) {
    const mark = db.prepare("UPDATE briefings SET read_at = ? WHERE id = ?");
    const now = Date.now();
    for (const r of rows) mark.run(now, r.id);
  }
  return rows.map(({ id: _id, ...rest }) => rest);
}

// --- room weather: emotional aggregate of the last 48h ---

export function roomWeather(): { tone: string; summary: string } {
  const since = Date.now() - 48 * 3600_000;
  const stops = (
    db.prepare("SELECT COUNT(DISTINCT pt.post_id) AS n FROM post_tracks pt JOIN posts p ON p.id = pt.post_id WHERE p.created_at >= ?").get(since) as { n: number }
  ).n;
  const ships = (db.prepare("SELECT COUNT(*) AS n FROM tracks WHERE shipped_at >= ?").get(since) as { n: number }).n;
  const trades = (db.prepare("SELECT COUNT(*) AS n FROM trades WHERE created_at >= ?").get(since) as { n: number }).n;
  const vibe = db
    .prepare("SELECT vibe, COUNT(*) AS n FROM posts WHERE created_at >= ? AND vibe IS NOT NULL GROUP BY vibe ORDER BY n DESC LIMIT 1")
    .get(since) as { vibe: string; n: number } | undefined;

  const parts: string[] = [];
  if (stops > 0) parts.push(`${stops} ${stops === 1 ? "stop" : "stops"}`);
  if (trades > 0) parts.push(`${trades} ${trades === 1 ? "trade" : "trades"}`);
  if (ships > 0) parts.push(`${ships} ${ships === 1 ? "ship" : "ships"}`);

  const activity = stops + trades + ships * 3;
  // tone: what the sky looks like — a ship outranks everything, then the
  // dominant vibe, then raw activity level
  const tone = ships > 0 ? "shipping" : vibe ? vibe.vibe : activity >= 8 ? "surging" : activity >= 3 ? "steady" : "quiet";
  const mood =
    ships > 0 ? "shipping weather" : activity >= 8 ? "the room is surging" : activity >= 3 ? "steady building" : "quiet — a good time to post";
  return { tone, summary: parts.length > 0 ? `${mood} · ${parts.join(" · ")}` : mood };
}
