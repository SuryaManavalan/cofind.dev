export type RenderMode = "text" | "markdown" | "html";

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
  created_at: number;
  reactions: ReactionSummary[];
}

export interface AccessToken {
  id: string;
  label: string;
  created_at: number;
  last_used_at: number | null;
}
