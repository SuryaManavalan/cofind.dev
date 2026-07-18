import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { api } from "./api.js";
import { mcp } from "./mcp.js";
import { existsSync } from "node:fs";

const app = new Hono();

app.use(logger());

app.route("/api", api);
app.route("/mcp", mcp);

app.get("/healthz", (c) => c.json({ ok: true }));

// In production the server also serves the built web client (single deploy target, §2).
const webDist = new URL("../../web/dist", import.meta.url).pathname;
if (existsSync(webDist)) {
  app.use("*", serveStatic({ root: "../web/dist" }));
  app.get("*", serveStatic({ path: "../web/dist/index.html" }));
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`cofind server listening on http://localhost:${info.port}`);
});
