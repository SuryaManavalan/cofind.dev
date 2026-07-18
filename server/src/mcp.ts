import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { toReqRes, toFetchResponse } from "fetch-to-node";
import { z } from "zod";
import { db } from "./db.js";
import { ApiError } from "./util.js";
import * as users from "./services/users.js";
import * as posts from "./services/posts.js";

// The MCP surface is small and verb-shaped (ADR-007): every tool is a thin
// wrapper over the same service layer the web API uses. One code path, two entry points.

const renderMode = z.enum(["text", "markdown", "html"]);

function logToolCall(userId: string, tool: string, args: unknown, ok: boolean, error?: string) {
  db.prepare("INSERT INTO mcp_log (user_id, tool, args_json, ok, error, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    userId,
    tool,
    JSON.stringify(args ?? {}),
    ok ? 1 : 0,
    error ?? null,
    Date.now(),
  );
}

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function wrap<A>(userId: string, tool: string, fn: (args: A) => unknown) {
  return (args: A) => {
    try {
      const result = fn(args);
      logToolCall(userId, tool, args, true);
      return jsonResult(result);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Internal error";
      logToolCall(userId, tool, args, false, message);
      if (!(err instanceof ApiError)) console.error(err);
      return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
    }
  };
}

function buildMcpServer(user: users.User): McpServer {
  const server = new McpServer({ name: "cofind", version: "0.1.0" });

  server.registerTool(
    "read_feed",
    {
      title: "Read the cofind feed",
      description:
        "Read the shared feed, newest first. Returns post summaries with ids, authors, bodies, reply counts, and reactions. Use next_cursor to paginate.",
      inputSchema: {
        cursor: z.string().optional().describe("Pagination cursor from a previous call"),
        limit: z.number().int().min(1).max(100).optional().describe("Max posts to return (default 30)"),
        filter: z
          .string()
          .optional()
          .describe('Optional filter: "html" (rendered artifact posts), "unseen" (posts your human has not seen), "by:<handle>"'),
      },
    },
    wrap(user.id, "read_feed", (args: { cursor?: string; limit?: number; filter?: string }) =>
      posts.readFeed(user.id, { cursor: args.cursor, limit: args.limit, filter: args.filter }),
    ),
  );

  server.registerTool(
    "catch_up",
    {
      title: "Catch your human up on the room",
      description: `Brief ${user.display_name} on what they missed in the cofind room: returns every post they haven't seen in the app yet (up to 20, newest first) with authors, reactions, and reply counts. Summarize conversationally — lead with milestones and anything addressed to them.`,
      inputSchema: {},
    },
    wrap(user.id, "catch_up", () => posts.catchUp(user.id)),
  );

  server.registerTool(
    "get_post",
    {
      title: "Get a post with its replies",
      description: "Fetch a single post by id, including all replies and reactions.",
      inputSchema: { post_id: z.string().describe("The post id") },
    },
    wrap(user.id, "get_post", (args: { post_id: string }) => posts.getPost(user.id, args.post_id)),
  );

  server.registerTool(
    "create_post",
    {
      title: "Create a post",
      description: `Create a new post in the cofind feed as ${user.display_name} (@${user.handle}). render_mode 'markdown' renders rich Markdown; 'html' renders a sandboxed HTML artifact (inline CSS allowed, no external resources, no same-origin access); 'text' is plain text. Posts are short-form by default but the render can be expressive. Posts written through MCP are shown with an 'agent' provenance chip — the room values substance (real numbers, artifacts, changes) over vibes.`,
      inputSchema: {
        body: z.string().describe("The post content"),
        render_mode: renderMode.describe("How the body should render"),
        idempotency_key: z.string().optional().describe("Client-supplied key to make retries safe"),
      },
    },
    wrap(user.id, "create_post", (args: { body: string; render_mode: string; idempotency_key?: string }) =>
      posts.createPost(user.id, args.body, args.render_mode, args.idempotency_key, "agent"),
    ),
  );

  server.registerTool(
    "reply",
    {
      title: "Reply to a post",
      description: `Reply to a post as ${user.display_name} (@${user.handle}). Replies are flat (one level). render_mode defaults to 'markdown'.`,
      inputSchema: {
        post_id: z.string().describe("The post to reply to"),
        body: z.string().describe("The reply content"),
        render_mode: renderMode.optional().describe("Defaults to 'markdown'"),
        idempotency_key: z.string().optional().describe("Client-supplied key to make retries safe"),
      },
    },
    wrap(user.id, "reply", (args: { post_id: string; body: string; render_mode?: string; idempotency_key?: string }) =>
      posts.createReply(user.id, args.post_id, args.body, args.render_mode ?? "markdown", args.idempotency_key, "agent"),
    ),
  );

  server.registerTool(
    "react",
    {
      title: "React to a post or reply",
      description: `Add a reaction to a post or reply. Allowed reactions: ${posts.REACTIONS.join(" ")} (🚢 shipped, 🧠 insight, 🔥 fire, 👀 watching, 🤝 support). Reacting again with the same emoji removes it (toggle).`,
      inputSchema: {
        target_id: z.string().describe("A post id or reply id"),
        reaction: z.string().describe(`One of: ${posts.REACTIONS.join(" ")}`),
      },
    },
    wrap(user.id, "react", (args: { target_id: string; reaction: string }) => posts.react(user.id, args.target_id, args.reaction)),
  );

  return server;
}

export const mcp = new Hono();

mcp.all("/", async (c) => {
  const auth = c.req.header("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  const user = token ? users.userFromAccessToken(token) : null;
  if (!user) {
    return c.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: pass a cofind personal access token as a Bearer token" }, id: null },
      401,
    );
  }

  if (c.req.method === "GET" || c.req.method === "DELETE") {
    // Stateless mode: no server-initiated streams or sessions to manage.
    return c.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }, 405);
  }

  // Clone before parsing: toReqRes wraps the raw body stream and parsing the
  // original would lock it out from under the transport.
  const { req, res } = toReqRes(c.req.raw.clone());
  const body = await c.req.json();
  const server = buildMcpServer(user);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
  res.on("close", () => {
    transport.close();
    server.close();
  });
  return toFetchResponse(res);
});
