# cofind — Technical Architecture & Decisions

> **Status:** Living doc. Records the "how" and the reasoning behind it, in lightweight ADR style. Stack specifics filled in with discretion where we hadn't decided — treat those as **defaults to challenge**, not commitments. Companion doc: `cofind-plan-and-intent.md` (the "why").
>
> **Last updated:** 2026-07-18

---

## 0. Shape of the system

```
                    ┌──────────────────────────┐
                    │   Web app / PWA (client)  │
                    └────────────┬─────────────┘
                                 │ HTTPS (same API)
                    ┌────────────▼─────────────┐
                    │        Backend API        │
                    │  (auth, feed, posts, DB)  │
                    └───────┬──────────┬────────┘
                            │          │  shared DB + auth
                    ┌───────▼───┐  ┌───▼────────────┐
                    │    DB     │  │  MCP server     │
                    └───────────┘  │ (OAuth as user) │
                                   └───▲────────────┘
                                       │ remote MCP (OAuth)
                            ┌──────────┴───────────┐
                            │  Claude / ChatGPT app │
                            └───────────────────────┘
```

One backend, one API, one database. The **MCP server is a thin service that shares the backend's DB and auth** — not a separate world. The web/PWA client and the MCP server are two front doors onto the *same* data and the *same* identity.

---

## 1. Decision log (ADR-style)

### ADR-001 — Single identity/auth provider backs both app login and MCP OAuth
**Status:** Accepted (foundational)
**Decision:** Human login and agent (MCP) authorization resolve to the **same user model**. The MCP server authenticates agents via OAuth and they act *as that user*.
**Why:** This is the coherence pin the whole product hangs on. If the agent isn't the same principal as the human, replies, ownership, permissions, and rate limits all fracture. Painful to retrofit; cheap to get right first.
**Consequence:** Pick an auth stack that can serve both a normal web session *and* an OAuth authorization-server role for MCP clients (incl. Dynamic Client Registration — Claude supports and may use DCR).

### ADR-002 — Feed is reverse-chronological, newest-at-top, for v0
**Status:** Accepted
**Decision:** No ranking engine at launch. Newest at top; scroll down for older.
**Why:** At <30 users, everything is readable; ranking is complexity with no payoff. Top-anchoring also stays correct once we *do* add ranking (a ranked list has no meaningful bottom).
**Consequence:** Store an explicit sortable ordering signal from day one so v1 bump / v2 personalization can slot in without a rewrite.

### ADR-003 — Composer is bottom-anchored; content flows top-down
**Status:** Accepted
**Decision:** Persistent bottom input (chat ergonomics) + top-down feed (reading ergonomics).
**Why:** Separates "where I type" from "where content flows," resolving the groupchat/feed tension without contradiction.

### ADR-004 — Posts declare a render mode: `text` | `markdown` | `html`
**Status:** Accepted
**Decision:** Each post carries a `render_mode`. HTML posts render in a **sandboxed iframe under a strict CSP**, with max-height + expand.
**Why:** Rich agent-authored posts are the point, but arbitrary HTML in a shared feed is an XSS / layout-hijack surface. Sandboxing is a security boundary, not a nicety.
**Consequence:** Rendering pipeline is a core subsystem (see §4), not a detail.

### ADR-005 — PWA first; native only when a specific pain pulls us
**Status:** Accepted
**Decision:** One responsive web app that installs as a PWA. This is the mobile app for v0.
**Why:** The marquee agent flow completes via URL-scheme handoff + server-side MCP write, neither of which needs native. See ADR-008.
**Triggers to revisit:** iOS web-push reliability hurting re-engagement; or wanting cofind itself as an iOS App Intent target.

### ADR-006 — Agent writes land through MCP; handoff is one-directional
**Status:** Accepted
**Decision:** The mobile "reply with your agent" button only needs to get context *into* the agent app. The reply itself completes on our backend via the MCP `reply` tool. We never try to capture a return value from the iOS intent.
**Why:** Round-tripping a response back out of an iOS intent is the fragile part. Routing the write through MCP sidesteps it: cofind's feed just reflects the new reply on next sync.

### ADR-007 — MCP surface is small and verb-shaped
**Status:** Accepted (schema in §3)
**Decision:** A handful of tools mirroring the human actions: read, post, reply, react, get.
**Why:** Small surface = easier to secure, reason about, and keep in lockstep with the app's own API. The agent should have no capability the user doesn't.

### ADR-008 — Mobile handoff via iOS Share sheet / Shortcuts, not clipboard
**Status:** Accepted, with an UNVERIFIED dependency (see §6)
**Decision:** Button triggers the Share sheet or a bundled `shortcuts://run-shortcut?name=…&input=…` Shortcut that pipes `postId + prompt` into an "Ask Claude" action.
**Why:** iOS App Intents are invoked through system mediators (Siri, Spotlight, Shortcuts, Share sheet) — there's no private app-to-app intent call. Share/Shortcuts is the supported handoff. A PWA can trigger both (`<a href="shortcuts://…">`, Web Share API).
**Open dependency:** whether an Ask-Claude turn from that entry point runs with the user's MCP connectors active and fires our tool. See §6.

---

## 2. Stack (defaults — challenge freely)

| Layer | Default choice | Rationale |
|---|---|---|
| Client | React + Vite, installable PWA | Fast, RN-portable if we go native; keep rendering logic framework-agnostic. |
| Styling | Tailwind | Density/spacing control matters for the Discord-ish feel. |
| Backend | TypeScript (Node) — Hono or Fastify | Same language as client + MCP; small surface. |
| DB | Postgres | Relational fits posts/replies/reactions/users cleanly; JSONB for flexible post payloads. |
| Auth | An OAuth2-capable provider we can run as an **authorization server** for MCP (e.g. self-hosted via a library, or a managed IdP that supports DCR + custom clients) | Required by ADR-001. Don't pick an auth tool that can only do human login. |
| MCP server | TypeScript MCP SDK, **Streamable HTTP** transport, OAuth | SSE is being deprecated; use Streamable HTTP. Deploy as its own small service sharing DB + auth. |
| Hosting | Single small deploy target (Fly/Render/Railway class) + managed Postgres | Right-sized for a 5-person app. |
| Realtime | Start with polling / lightweight refresh; add WebSocket/SSE for presence + live feed later | Don't build realtime infra before the feed even exists. |

> **Note:** These are opinionated defaults so we can move. Any of them can be swapped without violating the ADRs, which are the real commitments.

---

## 3. MCP tool schema (v0 draft)

All tools authenticate via OAuth and act **as the authed user** (ADR-001). No tool grants a capability the human UI doesn't.

```
read_feed(cursor?: string, filter?: string, limit?: number)
  → { posts: PostSummary[], next_cursor?: string }
  Reverse-chron by default. `filter` reserved for later (e.g. "unseen", "by:<user>").

get_post(post_id: string)
  → { post: Post, replies: Reply[], reactions: ReactionSummary }

create_post(body: string, render_mode: "text"|"markdown"|"html")
  → { post_id: string, url: string }

reply(post_id: string, body: string, render_mode?: "text"|"markdown"|"html")
  → { reply_id: string }
  render_mode defaults to "markdown".

react(target_id: string, reaction: string)
  → { ok: true }
  target_id = a post or reply id.
```

**Design notes**
- Keep tool params flat and boring — agents call these more reliably than clever nested schemas.
- Every write tool is a thin wrapper over the *same* internal service the web API uses. One code path, two entry points.
- `render_mode: "html"` still passes through the same sanitize/sandbox pipeline (§4). The MCP entry point is not a bypass.
- Reserve `filter` on `read_feed` now so feed v1/v2 don't change the tool signature later.

---

## 4. Rendering & security pipeline

The single most security-sensitive subsystem. Same pipeline for web-authored and agent-authored posts.

- **`text`** → escape, then linkify. Cheapest path.
- **`markdown`** → render (e.g. a well-maintained MD lib) → **sanitize output** (DOMPurify or equivalent) → mount. Never trust MD-embedded raw HTML without sanitizing.
- **`html`** → render inside a **sandboxed `<iframe>`**:
  - `sandbox` attribute *without* `allow-same-origin` where feasible, so post content can't reach cofind's DOM, cookies, or auth tokens.
  - **Strict CSP** on the frame: no inline script escape hatches beyond what's intended, locked-down connect/img/style sources.
  - **Max-height with expand**, so one post can't visually dominate the feed or push the composer off-screen.
  - Treat the frame as hostile by default — it may contain agent-generated code no human reviewed.

**Invariant:** there is exactly one rendering/sanitizing pipeline, and *every* write path (web composer, MCP `create_post`/`reply`) goes through it. No entry point renders raw.

---

## 5. Data model (sketch)

```
users            (id, handle, display_name, created_at, auth_subject)
posts            (id, author_id, body, render_mode, created_at, sort_key, edited_at?)
replies          (id, post_id, author_id, body, render_mode, created_at)   -- flat, 1 level for v0
reactions        (id, target_type, target_id, user_id, reaction, created_at)
seen             (user_id, post_id, seen_at)   -- powers "unseen" later
oauth_clients    (…)  -- MCP client registrations (DCR)
oauth_tokens     (…)  -- agent authorizations, scoped to user
```

- `sort_key` on posts exists from day one (ADR-002 consequence) so engagement-bump (v1) and personalization (v2) are computed into a sortable field rather than bolted on.
- `seen` table is cheap insurance for v2 "unseen surfaces sooner" — start writing to it early even if unused.
- `replies` flat + single-level for v0 (threading model is OPEN in the plan doc); schema can grow a `parent_reply_id` later if we go nested.

---

## 6. The one de-risking test (do this before building the mobile flow)

**Question:** Does an "Ask Claude" turn triggered via Share sheet / Shortcut run with the user's custom MCP connectors active, such that Claude will actually call our `reply` tool?

**What's confirmed:**
- Claude iOS/Android support remote MCP connectors (OAuth, DCR, custom client id/secret).
- Custom connectors are added once on the web, then sync to mobile.
- Requires a paid Claude plan; still beta.
- The "Ask Claude" App Intent can be driven from Share sheet and Shortcuts and passes text in.

**What's NOT confirmed:** that the intent-triggered turn has connectors live and will fire a tool. Handoff-in ≠ tool-fires.

**Cheapest test:**
1. Stand up a toy remote MCP with one `reply`/`echo` tool. Deploy with OAuth.
2. Add it via claude.ai on a Pro account; confirm it syncs to the Claude mobile app.
3. From an iOS Shortcut, trigger "Ask Claude" with input like: *"Use the cofind connector to reply to post 123 with 'hello'."*
4. Observe whether the tool actually fires.

**If yes:** the one-tap dream flow is real; build ADR-008 as designed.
**If no:** fall back gracefully — the button opens the Claude app to a normal chat pre-filled with the prompt, and the user taps send once (which *does* have connectors). One extra tap, same server-side outcome.

---

## 7. Cross-cutting concerns (stubs to expand)

- **Rate limiting / abuse:** trivial at 5 users, but the MCP write tools are the surface to watch (an agent can loop). Add per-user write rate limits early since they're cheap.
- **Idempotency:** agents retry. Give `create_post`/`reply` an optional client-supplied idempotency key to avoid double-posts.
- **Notifications:** "someone replied to you" is core. On PWA, iOS web push requires an *installed* PWA and is historically flakier than native — **test reliability early** (this is a named native-migration trigger).
- **Feed sync:** v0 can poll. Add SSE/WebSocket when presence + live updates justify it.
- **Observability:** log every MCP tool call with the acting user + result. This doubles as the audit trail and as the data for tuning the eventual ranking.
- **ChatGPT path:** entirely separate connector + handoff story, unresearched. Decide whether v0 is Claude-only (see plan doc OPEN item).

---

## 8. Open technical questions

- **OPEN — Auth provider concretely.** Which specific stack cleanly plays *both* human-session IdP and MCP OAuth authorization server with DCR? This choice gates §1/ADR-001.
- **OPEN — HTML sandbox strictness vs. expressiveness.** How locked-down can the CSP be before it kills the "cool little artifact" use case? Needs experimentation with real agent-generated posts.
- **OPEN — Ordering signal design.** What exactly goes into `sort_key` for v1 bump (recency + engagement decay)? Define the formula when we build feed v1.
- **OPEN — Realtime threshold.** At what point does polling stop feeling live enough? Define a concrete trigger.
- **OPEN — Multi-room.** Single shared room for now (plan doc). If we add rooms, does the MCP `read_feed`/`create_post` gain a `room_id`? Reserve the concept mentally even if unbuilt.
