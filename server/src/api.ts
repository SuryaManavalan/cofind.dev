import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { ApiError } from "./util.js";
import * as users from "./services/users.js";
import * as posts from "./services/posts.js";

type Env = { Variables: { user: users.User } };

const SESSION_COOKIE = "cofind_session";

export const api = new Hono<Env>();

api.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ error: err.message }, err.status as 400);
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

function setSessionCookie(c: Parameters<typeof setCookie>[0], token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}

// --- public auth routes ---

api.post("/auth/join", async (c) => {
  const { invite_code, handle, display_name, password } = await c.req.json();
  const { user, sessionToken } = users.join(invite_code ?? "", handle ?? "", display_name ?? "", password ?? "");
  setSessionCookie(c, sessionToken);
  return c.json({ user });
});

api.post("/auth/login", async (c) => {
  const { handle, password } = await c.req.json();
  const { user, sessionToken } = users.login(handle ?? "", password ?? "");
  setSessionCookie(c, sessionToken);
  return c.json({ user });
});

// --- session-authed routes ---

api.use("*", async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? users.userFromSession(token) : null;
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  c.set("user", user);
  users.touchPresence(user.id);
  await next();
});

api.post("/auth/logout", (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) users.logout(token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

api.get("/me", (c) => c.json({ user: c.get("user") }));

api.get("/members", (c) => c.json({ members: users.listMembers() }));

api.get("/activity", (c) => c.json({ activity: users.recentAgentActivity() }));

api.get("/meta", (c) => c.json({ reactions: posts.REACTIONS }));

api.get("/feed", (c) => {
  const cursor = c.req.query("cursor") || undefined;
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
  const filter = c.req.query("filter") || undefined;
  return c.json(posts.readFeed(c.get("user").id, { cursor, limit, filter }));
});

api.get("/posts/:id", (c) => c.json(posts.getPost(c.get("user").id, c.req.param("id"))));

api.post("/posts", async (c) => {
  const { body, render_mode, idempotency_key } = await c.req.json();
  return c.json(posts.createPost(c.get("user").id, body ?? "", render_mode ?? "text", idempotency_key), 201);
});

api.patch("/posts/:id", async (c) => {
  const { body, render_mode } = await c.req.json();
  return c.json(posts.updatePost(c.get("user").id, c.req.param("id"), body ?? "", render_mode));
});

api.post("/posts/:id/replies", async (c) => {
  const { body, render_mode, idempotency_key } = await c.req.json();
  return c.json(posts.createReply(c.get("user").id, c.req.param("id"), body ?? "", render_mode ?? "markdown", idempotency_key), 201);
});

api.post("/react", async (c) => {
  const { target_id, reaction } = await c.req.json();
  return c.json(posts.react(c.get("user").id, target_id ?? "", reaction ?? ""));
});

api.post("/seen", async (c) => {
  const { post_ids } = await c.req.json();
  if (Array.isArray(post_ids)) posts.markSeen(c.get("user").id, post_ids.filter((p) => typeof p === "string"));
  return c.json({ ok: true });
});

// --- personal access tokens (agent auth; ADR-010) ---

api.get("/tokens", (c) => c.json({ tokens: users.listAccessTokens(c.get("user").id) }));

api.post("/tokens", async (c) => {
  const { label } = await c.req.json().catch(() => ({ label: "" }));
  return c.json(users.createAccessToken(c.get("user").id, label ?? ""), 201);
});

api.delete("/tokens/:id", (c) => {
  users.revokeAccessToken(c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});
