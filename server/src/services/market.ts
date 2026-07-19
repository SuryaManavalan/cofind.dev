import { db } from "../db.js";
import { ApiError, newId } from "../util.js";
import type { Author } from "./posts.js";

// The Line (ADR-023): an abstracted prediction market where tracks are the
// events. Ship lines resolve OBJECTIVELY — shipping is an on-platform,
// timestamped act, so the oracle problem solves itself. Pricing is LMSR
// (the standard AMM for small markets): trade any time, price = the room's
// live probability. Conviction is minted only by building; it never touches
// money and never will.

const B = 30; // LMSR liquidity — sized so a 100-conviction trade moves a fresh market ~8-12 points
export const SHARE_PAYOUT = 10; // one winning share pays 10 conviction
const MAX_POSITION_COST = 500; // per-market ruin cap
const DAILY_STIPEND = 10;
const SIGNUP_BONUS = 100;

// --- conviction ledger ---

export function award(userId: string, delta: number, reason: string, refId?: string): void {
  if (delta === 0) return;
  db.prepare("INSERT INTO ledger (user_id, delta, reason, ref_id, created_at) VALUES (?, ?, ?, ?, ?)").run(
    userId,
    Math.round(delta),
    reason,
    refId ?? null,
    Date.now(),
  );
}

export function balance(userId: string): number {
  return (db.prepare("SELECT COALESCE(SUM(delta),0) AS b FROM ledger WHERE user_id = ?").get(userId) as { b: number }).b;
}

export function grantSignupBonus(userId: string): void {
  award(userId, SIGNUP_BONUS, "welcome");
}

export function maybeDailyStipend(userId: string): void {
  const dayStart = new Date().setUTCHours(0, 0, 0, 0);
  const already = db
    .prepare("SELECT 1 FROM ledger WHERE user_id = ? AND reason = 'daily' AND created_at >= ? LIMIT 1")
    .get(userId, dayStart);
  if (!already) award(userId, DAILY_STIPEND, "daily");
}

export function wallet(userId: string): { balance: number; recent: { delta: number; reason: string; created_at: number }[] } {
  return {
    balance: balance(userId),
    recent: db
      .prepare("SELECT delta, reason, created_at FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 15")
      .all(userId) as { delta: number; reason: string; created_at: number }[],
  };
}

// --- LMSR core ---

function cost(qYes: number, qNo: number): number {
  // b * ln(e^{qy/b} + e^{qn/b}) with overflow guard
  const m = Math.max(qYes, qNo) / B;
  return B * (m + Math.log(Math.exp(qYes / B - m) + Math.exp(qNo / B - m)));
}

export function priceYes(qYes: number, qNo: number): number {
  const m = Math.max(qYes, qNo) / B;
  const ey = Math.exp(qYes / B - m);
  const en = Math.exp(qNo / B - m);
  return ey / (ey + en);
}

// conviction cost of buying `shares` of `side`
function tradeCost(qYes: number, qNo: number, side: "yes" | "no", shares: number): number {
  const ny = side === "yes" ? qYes + shares : qYes;
  const nn = side === "no" ? qNo + shares : qNo;
  return (cost(ny, nn) - cost(qYes, qNo)) * SHARE_PAYOUT;
}

// invert: how many shares does `spend` conviction buy? (binary search)
function sharesForSpend(qYes: number, qNo: number, side: "yes" | "no", spend: number): number {
  let lo = 0;
  let hi = spend; // price per share is always > SHARE_PAYOUT * ~0 — generous upper bound
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (tradeCost(qYes, qNo, side, mid) < spend) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 100) / 100;
}

// --- markets ---

interface MarketRow {
  id: string;
  kind: string;
  track_id: string;
  question: string;
  target_at: number;
  b: number;
  q_yes: number;
  q_no: number;
  created_by: string;
  created_at: number;
  resolved_at: number | null;
  outcome: "yes" | "no" | null;
}

export interface MarketDto {
  id: string;
  track: { slug: string; title: string; shipped_at: number | null };
  question: string;
  target_at: number;
  created_at: number;
  price_yes: number;
  volume: number;
  trader_count: number;
  move_24h: number;
  resolved_at: number | null;
  outcome: "yes" | "no" | null;
  my: { yes_shares: number; no_shares: number; cost_basis: number; payout: number | null };
  book: { handle: string; display_name: string; yes_shares: number; no_shares: number }[];
}

function getMarketRow(id: string): MarketRow {
  const row = db.prepare("SELECT * FROM markets WHERE id = ?").get(id) as MarketRow | undefined;
  if (!row) throw new ApiError(404, "Market not found");
  return row;
}

// Lazy objective resolution: past-target unshipped lines settle NO the next
// time anyone looks. Shipping settles YES via the shipTrack hook.
function maybeResolve(row: MarketRow): MarketRow {
  if (row.resolved_at) return row;
  const shipped = (db.prepare("SELECT shipped_at FROM tracks WHERE id = ?").get(row.track_id) as { shipped_at: number | null }).shipped_at;
  if (shipped && shipped <= row.target_at) return settle(row, "yes");
  if (Date.now() > row.target_at) return settle(row, "no");
  return row;
}

function settle(row: MarketRow, outcome: "yes" | "no"): MarketRow {
  const now = Date.now();
  db.prepare("UPDATE markets SET resolved_at = ?, outcome = ? WHERE id = ? AND resolved_at IS NULL").run(now, outcome, row.id);
  const holders = db.prepare("SELECT user_id, yes_shares, no_shares FROM positions WHERE market_id = ?").all(row.id) as {
    user_id: string;
    yes_shares: number;
    no_shares: number;
  }[];
  for (const h of holders) {
    const winning = outcome === "yes" ? h.yes_shares : h.no_shares;
    if (winning > 0.001) award(h.user_id, Math.round(winning * SHARE_PAYOUT), "settle", row.id);
  }
  return { ...row, resolved_at: now, outcome };
}

export function resolveLineForShip(trackId: string): void {
  const row = db.prepare("SELECT * FROM markets WHERE track_id = ? AND resolved_at IS NULL").get(trackId) as MarketRow | undefined;
  if (row) maybeResolve(row);
}

function toDto(row: MarketRow, viewerId: string): MarketDto {
  const track = db.prepare("SELECT slug, title, shipped_at FROM tracks WHERE id = ?").get(row.track_id) as MarketDto["track"];
  const my = (db.prepare("SELECT yes_shares, no_shares, cost_basis FROM positions WHERE market_id = ? AND user_id = ?").get(row.id, viewerId) as
    | { yes_shares: number; no_shares: number; cost_basis: number }
    | undefined) ?? { yes_shares: 0, no_shares: 0, cost_basis: 0 };
  const stats = db
    .prepare("SELECT COALESCE(SUM(ABS(cost)),0) AS vol, COUNT(DISTINCT user_id) AS n FROM trades WHERE market_id = ?")
    .get(row.id) as { vol: number; n: number };
  const dayAgo = Date.now() - 86400000;
  const prev = db
    .prepare("SELECT price_after FROM trades WHERE market_id = ? AND created_at <= ? ORDER BY id DESC LIMIT 1")
    .get(row.id, dayAgo) as { price_after: number } | undefined;
  const p = priceYes(row.q_yes, row.q_no);
  const book = db
    .prepare(
      `SELECT u.handle, u.display_name, p.yes_shares, p.no_shares FROM positions p JOIN users u ON u.id = p.user_id
       WHERE p.market_id = ? AND (p.yes_shares > 0.001 OR p.no_shares > 0.001)`,
    )
    .all(row.id) as MarketDto["book"];
  const payout = row.outcome ? Math.round((row.outcome === "yes" ? my.yes_shares : my.no_shares) * SHARE_PAYOUT) : null;
  return {
    id: row.id,
    track,
    question: row.question,
    target_at: row.target_at,
    created_at: row.created_at,
    price_yes: p,
    volume: stats.vol,
    trader_count: stats.n,
    move_24h: prev ? p - prev.price_after : 0,
    resolved_at: row.resolved_at,
    outcome: row.outcome,
    my: { ...my, payout },
    book,
  };
}

export function openLine(userId: string, slug: string, targetAt: number): MarketDto {
  const track = db.prepare("SELECT id, slug, title, owner_id, shipped_at FROM tracks WHERE slug = ?").get(slug.toLowerCase()) as
    | { id: string; slug: string; title: string; owner_id: string | null; shipped_at: number | null }
    | undefined;
  if (!track) throw new ApiError(404, "Track not found");
  if (track.shipped_at) throw new ApiError(409, "Track already shipped");
  if (track.owner_id && track.owner_id !== userId) throw new ApiError(403, "Only the owner can open the line on a personal track");
  if (!track.owner_id) {
    const contributed = db
      .prepare("SELECT 1 FROM post_tracks pt JOIN posts p ON p.id = pt.post_id WHERE pt.track_id = ? AND p.author_id = ? LIMIT 1")
      .get(track.id, userId);
    if (!contributed) throw new ApiError(403, "Only contributors can open the line on a communal track");
  }
  const existing = db.prepare("SELECT id FROM markets WHERE track_id = ? AND resolved_at IS NULL").get(track.id);
  if (existing) throw new ApiError(409, "This track already has an open line");
  if (targetAt < Date.now() + 60 * 60 * 1000) throw new ApiError(400, "Target must be at least an hour out");

  const id = newId("mk");
  const question = `#${track.slug} ships by ${new Date(targetAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}?`;
  db.prepare(
    "INSERT INTO markets (id, kind, track_id, question, target_at, b, created_by, created_at) VALUES (?, 'ship', ?, ?, ?, ?, ?, ?)",
  ).run(id, track.id, question, targetAt, B, userId, Date.now());
  return toDto(getMarketRow(id), userId);
}

export function quote(marketId: string, side: "yes" | "no", spend: number): { shares: number; avg_price: number; price_after: number } {
  const row = maybeResolve(getMarketRow(marketId));
  if (row.resolved_at) throw new ApiError(409, "Market is settled");
  const shares = sharesForSpend(row.q_yes, row.q_no, side, spend);
  const ny = side === "yes" ? row.q_yes + shares : row.q_yes;
  const nn = side === "no" ? row.q_no + shares : row.q_no;
  return { shares, avg_price: shares > 0 ? spend / (shares * SHARE_PAYOUT) : 0, price_after: priceYes(ny, nn) };
}

export function trade(
  userId: string,
  marketId: string,
  side: "yes" | "no",
  action: "buy" | "sell",
  amount: number, // buy: conviction to spend · sell: shares to sell
): { market: MarketDto; shares: number; cost: number } {
  const row = maybeResolve(getMarketRow(marketId));
  if (row.resolved_at) throw new ApiError(409, "Market is settled — the line is closed");

  let shares: number;
  let costC: number; // conviction, positive = paid, negative = received

  if (action === "buy") {
    const spend = Math.floor(amount);
    if (spend < 5) throw new ApiError(400, "Minimum trade is 5 conviction");
    if (spend > balance(userId)) throw new ApiError(400, "Not enough conviction — earn it by building");
    const pos = (db.prepare("SELECT cost_basis FROM positions WHERE market_id = ? AND user_id = ?").get(marketId, userId) as
      | { cost_basis: number }
      | undefined) ?? { cost_basis: 0 };
    if (pos.cost_basis + spend > MAX_POSITION_COST) throw new ApiError(400, `Position cap is ${MAX_POSITION_COST} conviction per line`);
    shares = sharesForSpend(row.q_yes, row.q_no, side, spend);
    if (shares <= 0) throw new ApiError(400, "Trade too small");
    costC = spend;
  } else {
    shares = amount;
    const pos = db.prepare("SELECT yes_shares, no_shares FROM positions WHERE market_id = ? AND user_id = ?").get(marketId, userId) as
      | { yes_shares: number; no_shares: number }
      | undefined;
    const held = side === "yes" ? (pos?.yes_shares ?? 0) : (pos?.no_shares ?? 0);
    if (shares <= 0 || shares > held + 0.001) throw new ApiError(400, "You don't hold that many shares");
    shares = Math.min(shares, held);
    costC = Math.round(tradeCost(row.q_yes, row.q_no, side, -shares)); // negative
  }

  const signedShares = action === "buy" ? shares : -shares;
  const nqYes = side === "yes" ? row.q_yes + signedShares : row.q_yes;
  const nqNo = side === "no" ? row.q_no + signedShares : row.q_no;
  const pAfter = priceYes(nqYes, nqNo);

  const tx = db.transaction(() => {
    db.prepare("UPDATE markets SET q_yes = ?, q_no = ? WHERE id = ?").run(nqYes, nqNo, marketId);
    db.prepare(
      `INSERT INTO positions (market_id, user_id, yes_shares, no_shares, cost_basis) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(market_id, user_id) DO UPDATE SET
         yes_shares = yes_shares + excluded.yes_shares,
         no_shares = no_shares + excluded.no_shares,
         cost_basis = MAX(0, cost_basis + excluded.cost_basis)`,
    ).run(marketId, userId, side === "yes" ? signedShares : 0, side === "no" ? signedShares : 0, costC);
    db.prepare("INSERT INTO trades (market_id, user_id, side, shares, cost, price_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      marketId,
      userId,
      side,
      signedShares,
      costC,
      pAfter,
      Date.now(),
    );
    award(userId, -costC, action === "buy" ? "trade_buy" : "trade_sell", marketId);
  });
  tx();

  return { market: toDto(getMarketRow(marketId), userId), shares, cost: costC };
}

export function listMarkets(viewerId: string): { markets: MarketDto[]; wallet: ReturnType<typeof wallet> } {
  const rows = db.prepare("SELECT * FROM markets ORDER BY (resolved_at IS NOT NULL), created_at DESC LIMIT 50").all() as MarketRow[];
  return { markets: rows.map((r) => toDto(maybeResolve(r), viewerId)), wallet: wallet(viewerId) };
}

export function marketForTrack(trackId: string, viewerId: string): (MarketDto & { history: { p: number; t: number }[] }) | null {
  const row = db.prepare("SELECT * FROM markets WHERE track_id = ? ORDER BY created_at DESC LIMIT 1").get(trackId) as MarketRow | undefined;
  if (!row) return null;
  const resolved = maybeResolve(row);
  const history = (
    db.prepare("SELECT price_after AS p, created_at AS t FROM trades WHERE market_id = ? ORDER BY id ASC LIMIT 200").all(row.id) as {
      p: number;
      t: number;
    }[]
  );
  return { ...toDto(resolved, viewerId), history };
}

export function shipContributors(trackId: string): Author[] {
  return db
    .prepare(
      `SELECT DISTINCT u.id, u.handle, u.display_name FROM post_tracks pt
       JOIN posts p ON p.id = pt.post_id JOIN users u ON u.id = p.author_id WHERE pt.track_id = ?`,
    )
    .all(trackId) as Author[];
}
