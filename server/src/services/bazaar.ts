import { db } from "../db.js";
import { ApiError } from "../util.js";
import * as market from "./market.js";

// The Bazaar: the conviction marketplace. Built item-kind agnostic — the
// catalog, inventory, and buy flow don't care what an item is, only that it
// has a kind, a spec, and a price. Pixels are the first (and so far only)
// item kind; the roadmap lives in research/bazaar-roadmap.md.

export const PIXEL_PRICE = 50; // conviction per pixel — burned, a pure sink

// The basic palette: 16 colors that hold up as pixel art in every theme.
export const PIXEL_COLORS: { color: string; name: string }[] = [
  { color: "#ffffff", name: "chalk" },
  { color: "#cbd5e1", name: "fog" },
  { color: "#64748b", name: "slate" },
  { color: "#1e293b", name: "ink" },
  { color: "#000000", name: "void" },
  { color: "#ef4444", name: "ember" },
  { color: "#f97316", name: "flame" },
  { color: "#f59e0b", name: "amber" },
  { color: "#facc15", name: "gold" },
  { color: "#22c55e", name: "moss" },
  { color: "#14b8a6", name: "lagoon" },
  { color: "#38bdf8", name: "sky" },
  { color: "#3b82f6", name: "cobalt" },
  { color: "#8b5cf6", name: "violet" },
  { color: "#ec4899", name: "rose" },
  { color: "#a16207", name: "bronze" },
];

const PALETTE = new Set(PIXEL_COLORS.map((p) => p.color));
const AVATAR_SIZES = new Set([4, 8, 16]);

export interface CatalogItem {
  id: string;
  kind: string;
  name: string;
  price: number;
  spec: Record<string, string>;
}

export interface InventoryRow {
  kind: string;
  spec: string;
  qty: number;
}

export interface PixelAvatar {
  size: number;
  cells: (string | null)[];
}

export function catalog(): CatalogItem[] {
  return PIXEL_COLORS.map((p) => ({
    id: `pixel:${p.color}`,
    kind: "pixel",
    name: `${p.name} pixel`,
    price: PIXEL_PRICE,
    spec: { color: p.color },
  }));
}

function findItem(itemId: string): CatalogItem | undefined {
  return catalog().find((i) => i.id === itemId);
}

export function inventoryOf(userId: string): InventoryRow[] {
  return db
    .prepare("SELECT kind, spec, qty FROM inventory WHERE user_id = ? AND qty > 0 ORDER BY kind, spec")
    .all(userId) as InventoryRow[];
}

export function buy(userId: string, itemId: string, qty: number): { ok: true; balance: number } {
  const item = findItem(itemId);
  if (!item) throw new ApiError(404, "That item isn't in the bazaar");
  if (!Number.isInteger(qty) || qty < 1 || qty > 256) throw new ApiError(400, "Quantity must be between 1 and 256");
  const cost = item.price * qty;
  if (market.balance(userId) < cost) {
    throw new ApiError(400, `That costs ${cost} conviction — earn it by building`);
  }

  const specKey = item.kind === "pixel" ? item.spec.color! : JSON.stringify(item.spec);
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO inventory (user_id, kind, spec, qty, acquired_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, kind, spec) DO UPDATE SET qty = qty + excluded.qty, acquired_at = excluded.acquired_at`,
    ).run(userId, item.kind, specKey, qty, Date.now());
    market.award(userId, -cost, "purchase", `${item.id}x${qty}`); // burned, not transferred
  });
  tx();
  return { ok: true, balance: market.balance(userId) };
}

// --- pixel avatars ---

export function avatarOf(userId: string): PixelAvatar | null {
  const row = db.prepare("SELECT size, cells FROM avatars WHERE user_id = ?").get(userId) as
    | { size: number; cells: string }
    | undefined;
  if (!row) return null;
  return { size: row.size, cells: JSON.parse(row.cells) };
}

export function avatarsAll(): Record<string, PixelAvatar> {
  const rows = db.prepare("SELECT user_id, size, cells FROM avatars").all() as {
    user_id: string;
    size: number;
    cells: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.user_id, { size: r.size, cells: JSON.parse(r.cells) }]));
}

export function saveAvatar(userId: string, avatar: PixelAvatar | null): { ok: true; avatar: PixelAvatar | null } {
  if (avatar === null) {
    db.prepare("DELETE FROM avatars WHERE user_id = ?").run(userId);
    return { ok: true, avatar: null };
  }
  const { size, cells } = avatar;
  if (!AVATAR_SIZES.has(size)) throw new ApiError(400, "Grid must be 4, 8, or 16");
  if (!Array.isArray(cells) || cells.length !== size * size) throw new ApiError(400, "Grid doesn't match its size");

  const used = new Map<string, number>();
  for (const cell of cells) {
    if (cell === null) continue;
    if (typeof cell !== "string" || !PALETTE.has(cell)) throw new ApiError(400, "Unknown pixel color");
    used.set(cell, (used.get(cell) ?? 0) + 1);
  }
  const owned = new Map(
    inventoryOf(userId)
      .filter((r) => r.kind === "pixel")
      .map((r) => [r.spec, r.qty]),
  );
  for (const [color, count] of used) {
    const have = owned.get(color) ?? 0;
    if (count > have) {
      const name = PIXEL_COLORS.find((p) => p.color === color)?.name ?? color;
      throw new ApiError(400, `You've placed ${count} ${name} pixels but own ${have}`);
    }
  }

  db.prepare(
    `INSERT INTO avatars (user_id, size, cells, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET size = excluded.size, cells = excluded.cells, updated_at = excluded.updated_at`,
  ).run(userId, size, JSON.stringify(cells), Date.now());
  return { ok: true, avatar: { size, cells } };
}
