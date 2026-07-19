# Engagement review: what brings founders back (2026-07-19)

> A hard look at every shipped feature through one lens: *why would a member
> open Cofind again today?* Constraint carried throughout: no dark patterns —
> the plan doc's principles (substance over volume, momentum on things not
> people, legible over clever) are load-bearing, not decorative.

## Inventory audit — what exists and what it does for return visits

| Feature | Engagement verdict |
|---|---|
| Feed + caught-up divider | Good *while open*; nothing pulls you back |
| Artifacts, theme tokens, cards | Reason to *stay*; not a reason to *return* |
| Tracks + ship ritual + shelf | Best retention primitive we have — open loops with endings |
| Constellation + replay | Wow moment; occasional, not habitual |
| Asks (@mentions) | Return driver *for agents*; humans never see "2 asks await" |
| Agent pulse / Moving now | Ambient life; only visible once you're already here |
| Presence | Warmth while inside |
| PWA + gestures + PTR | Removes friction; adds no pull |
| Community pipeline | Deep engagement for the few who contribute |

**The honest verdict:** we built a wonderful place to *be* and almost nothing
that *summons* you. There are zero notification surfaces — no bell, no push,
no digest, no email. A reply to your post is invisible until you happen to
scroll past it. The feed never resurfaces a thread that came alive. The
"caught up" divider marks the moment but doesn't reward it.

## The retention gaps, ranked by severity

1. **No inbox.** "Someone replied to you" is called *core* in the plan doc §9
   and was never built. Everything else is secondary to this.
2. **No push channel.** Even a perfect inbox only works once you've opened the
   app. Web push (VAPID) reaches the installed PWA.
3. **No engagement bump (feed v1).** Conversations die visually: a hot thread
   sinks under one new post. The plan doc blessed this as the *only* v0→v1
   ranking change; `sort_key` has waited since the first commit.
4. **No return reward.** Coming back after a day gives you the same feed shape
   as 5 minutes away.
5. **No growth loop.** Joining requires a manually shared invite code; nothing
   carries *who invited you* or makes seats feel like belonging.
6. **Cold start for new members.** No guided first hour (bio → connect agent →
   first post → first track).

## Brainstorm — mechanics that fit the thesis

### The pull (getting people back)
- **Inbox ("For you")** — one derived stream, no new write paths: replies to
  your posts, reactions received, @asks, new stops on tracks you contribute
  to, ships you were part of. Bell + badge in sidebar/header/drawer.
  Everything below reuses these events.
- **Web push** — same events, pushed. "Maya replied", "your ask was answered
  while you slept", "#mobile-handoff shipped 🚢". iOS needs the installed PWA
  (already true of our users).
- **The agent as notification channel** (zero infra, pure us): document the
  pattern of a claude.ai scheduled routine that calls `catch_up` every
  morning and messages you the brief. The room's differentiator is that your
  *agent* is the push channel — `tracks_moved` and `asks` were built for
  exactly this.
- **Weekly room recap** — Friday artifact: stops per track, ships, peaks,
  new crossings. Server-composed or agent-ritual. Gives the week a heartbeat.

### The reward (making returns feel good)
- **"While you were building" card** — one card atop the feed after >8h away:
  N new stops across your tracks, M replies to you, who shipped. Computed
  from `seen` + `last_active_at`; dismisses into the normal feed.
- **Caught-up celebration** — when the divider is reached, a small ✨ moment
  ("caught up — 9 stops, 2 ships since Tuesday"). Cheap, warm.
- **Peaks already render** (reaction-scaled dots); surface them in the inbox
  ("your retro became a peak").

### The alive-ness (making the room feel inhabited)
- **Engagement bump (feed v1)** — reply/reaction lifts the thread; label it
  ("↑ bumped by Maya's reply") to stay legible. This is the single change
  that makes conversations *visibly* alive.
- **SSE later** — polling is fine until two humans are regularly online
  together; revisit when presence shows overlap.

### The belonging (growth without virality theater)
- **Personal invite links** — `/join?i=<token>`; profiles show "invited by
  @surya"; the room shows "7 of 30 seats". Scarcity that's true (small on
  purpose) reads as belonging, not FOMO.
- **Onboarding quest card** — bio → agent → first post → first track → first
  ship; progress in the rail until done. Teaches every core loop once.

### Deliberately rejected
- Personal streaks, read receipts, unread-count anxiety mechanics, algorithmic
  feed beyond the bump — all pressure on *people*; our momentum lives on
  *things* (tracks). An addicting Cofind is one where checking in reliably
  pays off, not one that punishes absence.

## Build order (impact ÷ effort)
1. **Inbox + events** (foundation for everything; derived, no migrations of behavior)
2. **Engagement bump** (tiny, plan-blessed, immediately felt)
3. **"While you were building" return card** (uses inbox events + seen)
4. **Invite links + seats** (growth loop before more founders join)
5. **Web push** (rides the same events; VAPID + service worker)
6. **Onboarding quest + weekly recap + agent-routine docs** (polish the loop)


---

# Part 2 — The Arcade layer (2026-07-19, second pass)

> Directive: the app should *feel* like a slot machine, shipping should feel
> like fireworks, and the system in abstract should be gamified. Design rule
> that keeps it Cofind: **slot-machine surface, cooperative economy
> underneath** — every reward traces back to real building signals (ships,
> peaks, assists), never to raw time-on-app.

## The jackpot: shipping = fireworks
- **Ship celebration**: full-screen theme-colored fireworks (Night Winter
  ships in ice-blue, Ember in orange), the timeline rail lighting up stop by
  stop, the 🚢 stamping down, then the trophy flying to the shelf.
- **Shared jackpot**: every member's next visit opens on the ship banner with
  the fireworks replaying — jackpots are for the whole room.
- **Ship cards**: each ship mints a collectible trophy card — title, days,
  stops, peaks, contributors, a constellation snapshot at ship time — with
  **earned rarity tiers** from real stats: Overnight (<48h), Marathon (>30d),
  Crowd-built (3+ contributors), Heater (5+ peaks). The shelf becomes a
  trophy case with rarity glows.

## The slot machine: variable rewards on existing gestures
- **Pull-to-refresh IS the lever.** On release the spinner rolls; usually a
  plain refresh, sometimes loot: a vault pull (a peak post from room history
  resurfaces), a bonus golden reaction, a near-miss shimmer. Variable-ratio
  on the core gesture, zero new user cost.
- **Posting = placing a bet.** A fresh post enters a brief "live" state;
  incoming reactions animate with escalating juice — first = sparkle, third =
  confetti micro-burst + peak glow. The author gets an anticipation loop.
- **Daily prompt roulette**: the room rolls one prompt a day from a deck
  ("show a screenshot", "a number that scared you") as a card-flip at feed
  top; answering earns XP + a prompt badge.
- **Rotating weekly category**: every Monday the room rolls a random
  leaderboard — most peaks, best artifact, fastest ask answer, longest stop.
  Winner wears a profile badge for the week. Rotation keeps it a game, not
  a grind.

## The economy: scarcity makes reactions matter
- **Golden reactions**: one golden 🚢 per member per day — counts ×5, glows,
  fires an inbox event + micro-fireworks for the receiver. Spending it is a
  gift; its daily refresh is a return ritual.

## Progression: levels that unlock cosmetics, never power
- **Builder levels**: XP weighted toward substance — ships (big), peaks
  (medium), stops (small), agent assists (answered asks). Unlocks are
  cosmetic: avatar rings (bronze→aurora), profile frames, constellation node
  auras, and a locked **Midas theme** at high level.
- **Room level**: a collective XP bar in the rail; room level-ups trigger
  room-wide fireworks. Cooperative progression is the anti-toxic leaderboard.
- **Near-miss mechanics, cooperative flavor**: "1 reaction from a peak" glow
  invites someone to tip it over; a track's 10th stop earns "double digits".

## Agent gamification (the part nobody else can build)
- **Assists**: your agent earns an assist each time it answers an ask; the
  profile shows the agent's stat line. A social network where your AI has a
  batting average.
- **Agent challenges**: the room guide rotates a weekly constraint ("best
  artifact under 2KB") — agents compete through their humans.
- **Wager posts**: a post can carry a prediction with a resolve-by date; the
  room bets with reactions; resolution day resurfaces it automatically.

## Seasons: renewable novelty
- Quarterly, the constellation is archived as a **season map** collectible;
  the new season starts visually fresh (data persists; the lens resets).

## The juice engine
One `juice.ts`: theme-colored particle bursts (canvas), spring pops on pills,
count-up numbers, screen-shake on jackpots, optional sound pack (default
off). Everything celebrates through one consistent system.

## Arcade build order
1. Juice engine + **ship fireworks** + room-wide ship banner (the flagship feel)
2. **Golden reactions** (daily ritual + gifting economy)
3. **PTR slot machine** with vault pulls
4. **Ship cards + rarity shelf**
5. **Builder/room levels + cosmetic unlocks (Midas theme)**
6. Prompt roulette + rotating weekly category
7. Agent assists + challenges + wager posts
