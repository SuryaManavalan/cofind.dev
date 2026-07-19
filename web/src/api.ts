import type { AccessToken, AgentActivity, GraphData, Member, PostSummary, RelatedTrack, Reply, TrackSummary, User } from "./types";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    credentials: "same-origin",
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  join: (invite_code: string, handle: string, display_name: string, password: string) =>
    request<{ user: User }>("/auth/join", { method: "POST", body: JSON.stringify({ invite_code, handle, display_name, password }) }),
  login: (handle: string, password: string) =>
    request<{ user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ handle, password }) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  me: () => request<{ user: User }>("/me"),
  members: () => request<{ members: Member[] }>("/members"),
  activity: () => request<{ activity: AgentActivity[] }>("/activity"),
  meta: () => request<{ reactions: string[] }>("/meta"),
  feed: (cursor?: string, filter?: string) => {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (filter) params.set("filter", filter);
    const qs = params.toString();
    return request<{ posts: PostSummary[]; next_cursor?: string }>(`/feed${qs ? `?${qs}` : ""}`);
  },
  getPost: (id: string) => request<{ post: PostSummary; replies: Reply[] }>(`/posts/${id}`),
  createPost: (body: string, render_mode: string, tracks?: string[]) =>
    request<{ post_id: string }>("/posts", { method: "POST", body: JSON.stringify({ body, render_mode, tracks }) }),
  createReply: (postId: string, body: string, render_mode = "markdown") =>
    request<{ reply_id: string }>(`/posts/${postId}/replies`, { method: "POST", body: JSON.stringify({ body, render_mode }) }),
  react: (target_id: string, reaction: string) =>
    request<{ ok: true; added: boolean }>("/react", { method: "POST", body: JSON.stringify({ target_id, reaction }) }),
  markSeen: (post_ids: string[]) => request<{ ok: true }>("/seen", { method: "POST", body: JSON.stringify({ post_ids }) }),
  listTracks: () => request<{ tracks: TrackSummary[] }>("/tracks"),
  getTrack: (slug: string) => request<{ track: TrackSummary; posts: PostSummary[]; related: RelatedTrack[] }>(`/tracks/${slug.split("/").map(encodeURIComponent).join("/")}`),
  updateTrack: (slug: string, fields: { title?: string; description?: string }) =>
    request<{ track: TrackSummary }>(`/tracks/${slug.split("/").map(encodeURIComponent).join("/")}`, { method: "PATCH", body: JSON.stringify(fields) }),
  updateProfile: (fields: { display_name?: string; bio?: string; link?: string }) =>
    request<{ user: User }>("/profile", { method: "PATCH", body: JSON.stringify(fields) }),
  graph: () => request<GraphData>("/graph"),
  shipTrack: (slug: string, ship: boolean) =>
    request<{ track: TrackSummary }>("/tracks-ship", { method: "POST", body: JSON.stringify({ slug, ship }) }),
  listTokens: () => request<{ tokens: AccessToken[] }>("/tokens"),
  createToken: (label: string) =>
    request<{ id: string; token: string; label: string }>("/tokens", { method: "POST", body: JSON.stringify({ label }) }),
  revokeToken: (id: string) => request<{ ok: true }>(`/tokens/${id}`, { method: "DELETE" }),
};
