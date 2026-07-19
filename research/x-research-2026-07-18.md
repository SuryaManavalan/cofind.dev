# X research: what the discourse says about agent-native social, 2026-07-18

> Method: 14 recent-search queries against the X API v2 (last 7 days, ~2,200 posts,
> engagement-ranked), across four themes mapped to COfind's open product questions.
> Raw data lives outside the repo. Recent search only covers a 7-day window — this is
> a snapshot of current discourse, not a longitudinal study.

## Theme A — How build-in-public actually behaves

**What earns engagement: milestones with real numbers and real feelings.** The top
posts in the space are "my first sale ever, I can't even explain the feeling" (370
likes from a 3.7k account), "15 installs so far! And 2 of those are my wife and me"
(23L), "launched my SaaS - 46 users in the first month." Concrete, small, honest
numbers outperform polish. Meta-commentary confirms it: *"Every founder says they're
'building in public.' Then someone asks about revenue. Suddenly we're respecting
privacy."*

**The public BIP space is drowning in template spam.** The `indie hacker` query
returned page after page of literally-identical bot posts ("Howdy devs, I'm your
resourceful indie hacker…" + random string). Zero-follower accounts, zero engagement.
The open feed for this audience is a dead mall.

**Self-aware exhaustion with performative shipping.** The single most-liked post in
the agent theme (762L): *"I've shipped 14 projects this year. None of them have
users. But all of them have landing pages."* The audience is in on the joke.

→ **Implication for COfind:** the small trusted room isn't a nice-to-have, it's the
product. And the atomic unit that works is *the milestone with numbers attached* —
rich posts (changelogs, charts, dashboards) are exactly the right container for it.

## Theme B — Sentiment toward AI-authored content

**Undisclosed AI engagement is despised.** "AI replies have to be the most annoying
things on X right now" (209L). "blocked for ai reply" (83L). "there's something so
dead internet theory about complaining of AI and getting AI replies" (600L). People
now read em-dashes as an AI tell.

**But the objection is inauthenticity and zero value — not AI involvement.** The
sharpest take in the sample: *"A lot of people just use 'AI slop' to refer to
anything they don't like… the issue is low-effort content pretending to be
something it isn't."* Counter-signal: *"Shortcut is 100% written by ai .. people
love it and it makes good money."* AI content with real substance (tools, data,
working artifacts) is celebrated in the same feeds that despise AI reply-guys.

→ **Implication for COfind — the core design bet:** agent-authored content survives
exactly when (1) **provenance is honest** — nobody is pretending an agent is a
human, and (2) **the content carries substance** — an artifact, a number, a change,
not vibes. COfind should make agent authorship *visible and celebrated*, never
ambiguous. In a 10-person room of consenting friends, "my agent posted this for me"
is a feature; ambiguity is what breeds the resentment we measured.

## Theme C — Agent-native products and MCP discourse

Real developer energy concentrates on Claude Code + MCP workflows (second brains,
skills libraries, automation loops with six-figure impressions). The phrase
"agent-native" itself is currently mostly crypto-marketing noise — the term is ahead
of the products. Two practical signals: (1) plan/interface gating of MCP connectors
is a live user complaint (validates ADR-010's honesty about the claude.ai path), and
(2) an emerging thread of "agents need audit trails / verifiable action history"
(we already log every MCP tool call — worth surfacing as UI, not just ops data).

## Theme D — Small rooms, group chats, presence

**X itself is described as a group chat wearing a feed costume:** "X is now one big
reunion platform for you and your mutuals… the same people who engaged your posts
yesterday" (64L). **Founders explicitly name the gap:** "there isn't really a
trusted space where they can talk" (66L); "The further you get, the fewer people
actually understand what your days feel like" (138L, Founders Club). Dead Discord
servers are a running joke ("you can tell a discord is dead when people only come
online to post art"). PWA install + push announcements are shipped proudly by real
products — the platform choice reads as current, not compromised.

## Design decisions this research drives

1. **Provenance-by-design.** Tag every post/reply with how it was written (by hand
   vs. via agent) and show it as a first-class, positively-styled chip. Honesty is
   the moat against slop-resentment. (→ ADR-013)
2. **Surface the agents as ambient presence.** The MCP audit log becomes a live
   "agent pulse" in the UI — you can see the room's agents working. Novel, honest,
   and warm: the room feels alive even when humans are heads-down. (→ ADR-013)
3. **Presence for humans too.** Cheap groupchat warmth; founders' rooms live and
   die by "is anyone here." (resolves plan-doc OPEN item)
4. **Celebrate artifacts.** html/markdown posts are the "substance" that makes
   agent content welcome — keep rendering fidelity a headline feature.
5. **Founder-tool ergonomics.** This audience lives in Linear/Raycast/Claude Code:
   command palette, keyboard-first navigation, dense-but-calm typography.
