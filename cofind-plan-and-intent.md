# cofind — Plan & Intent

> **Status:** Living doc. This is the "why" and the "what." Decisions here are directional, not frozen. Where something is genuinely undecided it's marked **OPEN**. Companion doc: `cofind-architecture-and-decisions.md` (the "how").
>
> **Domain:** cofind.dev
> **Audience today:** the author + a handful of friends founding startups.
> **Last updated:** 2026-07-18

---

## 1. One-line intent

A **build-in-public feed for a tiny circle of technical founders**, where posts are rich (Markdown / HTML), **agent-native** (your AI writes and replies through an MCP server), and the reading experience sits deliberately between a Discord channel and a Twitter feed.

## 2. What we're actually making

Not a general social network. A **small, high-signal room** where the core loop is:

1. You (or your agent) post what you're working on — in whatever format expresses it best (Markdown, HTML, or plain text).
2. It renders inline as a **preview card** in a shared feed.
3. Others react and reply — often *via their own agent*, sometimes by hand.
4. Threads that get engagement resurface, so the room stays alive without anyone doom-scrolling.

The wager is that **agent-authored, richly-formatted micro-posts** are a genuinely new unit of "building in public," and that a group small enough to read end-to-end is where that unit feels best first.

## 3. Principles

- **Small on purpose.** Design for ~5–30 people who trust each other, not for scale. Intimacy is a feature, not a phase to grow out of. Anything that only makes sense at 10k users is out of scope until it isn't.
- **Agent-native, not agent-only.** Humans post and reply directly too. The agent is a first-class *author*, never a required intermediary.
- **The post is the artifact.** A post can be a rendered thing — a mini dashboard, a formatted changelog, a styled note — not just a text blob. Rendering fidelity is core, not decoration.
- **Ship the boring version first.** Every ambitious feature (ranking, personalization, native apps) has a dead-simple v0 that we ship before the clever version. Complexity must be *pulled* by real pain, not pushed by imagination.
- **Legible over clever.** In a room this small, people should be able to understand why the feed looks the way it does. No opaque algorithm surprising five friends.

## 4. The feed: groupchat vs. feed (resolved direction)

This was the main open tension. Resolution:

- **Reading flows top→down. The composer sits at the bottom.** You get feed-style reading ergonomics (enter at the top, scroll down) *and* chat muscle memory (thumb-reachable input always ready). These aren't in conflict once you separate "where content flows" from "where I type."
- **Why top-anchored won:** the moment we want *engagement to bump threads* and *unseen/relevant posts to surface sooner*, ordering is no longer strictly chronological — and a non-chronological list has no meaningful "bottom" to anchor to. Bottom-anchoring only makes sense for pure chronology (the bottom is the live edge). Our ranking ambitions therefore force top-anchoring anyway. Convenient, since that's also the scroll direction we wanted.
- **The "groupchat feel" is preserved through density, reactions, presence, and the persistent bottom composer — not through scroll direction.** That's where Discord's texture actually comes from.

### Phasing the feed

- **v0 — reverse-chronological, newest-at-top.** Literally Twitter's "Following" tab. At <30 people you can read everything; the "caught up" feeling is free.
- **v1 — engagement bump.** A reply/react on an older thread lifts it back toward the top. First and only ranking tweak.
- **v2 — light personalization.** Unseen + relevant posts surface sooner *per viewer*. **Only build this once there's more content than a person reads linearly.** Until then it's complexity with no payoff.

**North star ordering model (aspirational):** *HN-style ranking + Discord density + Twitter-card previews + Notion-ish rich blocks.* Approach it incrementally; never ship the whole thing at once.

## 5. Post types

Every post declares a render mode:

- **`text`** — plain text, links auto-unfurled (later).
- **`markdown`** — rendered + sanitized. The common case.
- **`html`** — rendered in a sandboxed frame with a strict content policy and a max-height-with-expand. This is the "my agent made me a little artifact" case and a big part of the appeal.

Posts are short-form by default (micro-posts), but the *render* can be expressive. Think "a tweet, but the tweet can be a small rendered document."

## 6. Agent-native flows

### Posting via agent
Your agent calls the cofind MCP `create_post` tool and writes on your behalf, as you. The agent is great at producing the exact rich MD/HTML formats that make posts expressive.

### Replying via agent (the marquee mobile flow)
On mobile, a reply can be typed by hand (Twitter-style) **or** handed to your AI:

1. Tap **"Reply with your agent."**
2. cofind hands off to the Claude (or ChatGPT) app with a pre-filled prompt carrying the **post ID** — via the iOS Share sheet or a bundled Shortcut (`shortcuts://run-shortcut?...`). *Not* clipboard.
3. Your agent — already OAuth'd to the cofind MCP as you — calls `reply(post_id, ...)`.
4. The write lands on cofind's backend through MCP. cofind's feed reflects it on next sync.

**Key architectural payoff:** the handoff is *one-directional*. cofind only needs to get context *into* the agent; the reply completes server-side via MCP. We never try to catch a return value back from the intent — the fragile part of iOS handoffs — so we sidestep it entirely.

## 7. Platform intent

- **v0: one responsive web app that is also an installable PWA.** This *is* the "mobile app" for now. Installable, push-capable, and able to trigger the Share sheet / Shortcut handoff to the agent apps.
- **Go native (Expo/RN) only when a concrete pain pulls us there**, specifically:
  - iOS web-push reliability is measurably costing re-engagement, **or**
  - we want cofind itself to be a first-class iOS **App Intent** target ("Reply with cofind" in Siri/Spotlight/Share).
- "We grew" is *not* a trigger. A specific broken thing is.

## 8. Known constraints from the agent ecosystem (as of 2026-07)

These shape onboarding and are not things we control:

- **Custom MCP connectors must be added once on the web** (claude.ai → Settings → Connectors), then sync to Claude mobile. So onboarding has a mandatory "connect cofind on the web, once" step. Bundle it with the Shortcut install.
- **Custom remote-MCP connectors require a paid Claude plan** (Pro/Max/Team/Enterprise) and are still beta. The agent-reply feature is gated by the *user's* Claude subscription. Acceptable for a founder crowd; document it plainly.
- **Agent replies spend the user's own Claude usage** and run on their default model. We don't control model choice or cost per reply.
- **UNVERIFIED / must test:** whether an "Ask Claude" turn *triggered via Share sheet or Shortcut* runs with the user's MCP connectors active and will actually fire our `reply` tool. Handoff-in is supported; tool-fires-from-that-entry-point is not proven. See architecture doc for the de-risking test. Design a graceful fallback (button opens a normal Claude chat where the user taps send once).

## 9. Open product questions

- **RESOLVED (2026-07-18) — Reactions taxonomy.** Curated set: 🚢 shipped, 🧠 insight, 🔥, 👀, 🤝. Curated reads more intentional at small scale and gives the room a shared vocabulary. Free emoji reconsidered later if the set feels confining. (ADR-012.)
- **RESOLVED (2026-07-18) — Threading model.** Flat, single level of reply, for v0 — shipped that way. Schema can grow `parent_reply_id` if nesting is ever pulled by real pain.
- **RESOLVED (2026-07-18) — Presence.** Yes — online dots (last-active < 5 min) plus an online cluster in the feed header. Human presence and agent activity are deliberately separate signals: agents get their own live "agent pulse" rail instead of faking human presence. (ADR-013/014; driven by X research showing founders' rooms need "is anyone here" warmth and that agent activity must be disclosed, not disguised.)
- **OPEN — Membership & invites.** Invite-only by definition. Single shared room, or eventual multiple rooms/spaces? Start single-room.
- **OPEN — Identity.** Real names among friends, or handles? Probably real-ish, since trust is the whole point.
- **OPEN — ChatGPT parity.** We verified the Claude path. ChatGPT's custom-connector + handoff story is separate and unresearched. Decide whether v0 is Claude-only.
- **OPEN — Notifications philosophy.** "Someone replied to you" is core. How much beyond that (digest of what you missed? nudges to post?) without becoming noisy.
- **OPEN (direction set, 2026-07-18) — Feed scope controls.** First scope controls shipped: an **Artifact Gallery** view (html posts only, presented as a wall of live sandboxed exhibits) and `read_feed` filters ("html", "unseen", "by:<handle>") shared by web and MCP. The single stream remains the home; scopes are alternate lenses, not competing feeds. Still open: whether humans get filter chips in the main feed itself.

## 10. Rough sequencing

1. **Foundation:** shared auth/identity model + MCP tool schema (everything hangs off these — see architecture doc).
2. **Core loop:** create/read/reply/react over a top-anchored reverse-chron feed; MD rendering.
3. **Rich HTML** posts in sandboxed frames.
4. **PWA polish:** installability + push.
5. **Agent handoff on mobile:** the Share/Shortcut → Claude → MCP reply flow (after the de-risking test).
6. **Engagement bump** (feed v1).
7. Revisit personalization / native only when pulled.

## 11. Explicit non-goals (for now)

- Scale, virality, growth loops, public/open signup.
- A recommendation engine at launch.
- Native iOS/Android apps at launch.
- Anything requiring moderation-at-scale tooling.
- Monetization.
