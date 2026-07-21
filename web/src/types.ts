export type RenderMode = "text" | "markdown" | "html";
export type Via = "web" | "agent";

export interface User {
  id: string;
  handle: string;
  display_name: string;
  created_at: number;
  bio?: string | null;
  link?: string | null;
  manifesting?: string | null;
}

export interface Author {
  id: string;
  handle: string;
  display_name: string;
}

export interface ReactionSummary {
  reaction: string;
  count: number;
  reacted_by_me: boolean;
  // Only present on your own posts/replies — who left each reaction.
  reactors?: { handle: string; display_name: string }[];
}

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
  vibe: string | null;
  amplified_by: { handle: string; display_name: string }[];
  amplified_by_me: boolean;
}

export interface Toast {
  handle: string;
  display_name: string;
  body: string;
  created_at: number;
}

export interface TrackRef {
  slug: string;
  title: string;
}

export interface TrackSummary {
  id: string;
  slug: string;
  title: string;
  owner: Author | null;
  description: string | null;
  created_at: number;
  shipped_at: number | null;
  post_count: number;
  recent_count: number;
  last_post_at: number | null;
  contributors: Author[];
  heat: TrackHeat | null;
}

export interface TrackHeat {
  tier: "blazing" | "loved" | "steady";
  label: string;
}

export interface RelatedTrack {
  slug: string;
  title: string;
  shared_posts: number;
  shared_contributors: number;
}

export interface GraphData {
  tracks: (TrackSummary & { node: string })[];
  people: { node: string; id: string; handle: string; display_name: string; created_at: number; post_count: number }[];
  edges: { source: string; target: string; kind: "contributes" | "crossing" | "interacts"; weight: number; first_at: number }[];
}

export interface Reply {
  id: string;
  post_id: string;
  author: Author;
  body: string;
  render_mode: RenderMode;
  via: Via;
  created_at: number;
  reactions: ReactionSummary[];
}

export interface AccessToken {
  id: string;
  label: string;
  created_at: number;
  last_used_at: number | null;
}

export interface Member extends User {
  last_active_at: number | null;
  avatar?: PixelAvatar | null;
}

// --- The Bazaar ---

export interface PixelAvatar {
  size: number;
  cells: (string | null)[];
}

export interface BazaarItem {
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

export interface AgentActivity {
  id: number;
  tool: string;
  ok: boolean;
  created_at: number;
  handle: string;
  display_name: string;
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
  insider: boolean;
  my: { yes_shares: number; no_shares: number; cost_basis: number; payout: number | null };
  book: { handle: string; display_name: string; yes_shares: number; no_shares: number }[];
}

export interface TradeEvent {
  t: number;
  p: number;
  handle: string;
  side: "yes" | "no";
  action: "buy" | "sell";
  cost: number;
}

export interface LineDto extends MarketDto {
  history: TradeEvent[];
}

export interface TapeEvent extends TradeEvent {
  slug: string;
  question: string;
}

export interface FloorMarket extends MarketDto {
  spark: number[];
}

export interface Wallet {
  balance: number;
  at_stake: number;
  portfolio: number;
  earned_total: number;
  recent: { delta: number; reason: string; created_at: number }[];
  history: { t: number; v: number }[];
}
