export type RenderMode = "text" | "markdown" | "html";
export type Via = "web" | "agent";

export interface User {
  id: string;
  handle: string;
  display_name: string;
  created_at: number;
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
}

export interface PostSummary {
  id: string;
  author: Author;
  body: string;
  render_mode: RenderMode;
  via: Via;
  created_at: number;
  reply_count: number;
  reactions: ReactionSummary[];
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
}

export interface AgentActivity {
  id: number;
  tool: string;
  ok: boolean;
  created_at: number;
  handle: string;
  display_name: string;
}
