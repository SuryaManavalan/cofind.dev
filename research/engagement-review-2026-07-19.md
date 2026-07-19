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


---

# Part 3 — The Line: a prediction market on tracks (2026-07-19, third pass)

> Centerpiece revision: the Arcade economy reorganizes around an abstracted
> prediction market where **tracks are the events**. Why it fits better here
> than anywhere: prediction markets die on the oracle problem (who says the
> event happened?) — but on Cofind, **shipping is an on-platform, objective,
> timestamped event**. The market's resolution primitive already exists and
> already has fireworks.

## The market, in one loop
Build → earn **conviction** (the room's currency, minted only by real
signals: stops, peaks, assists, ships) → **stake it on the line** — markets
like "#maya/ml-pipeline ships by Sept 1" — → prices move as stops land →
founders see their own price and post progress to move it → ship resolves
the market → payout fireworks → calibration ranked → restake.

Every existing mechanic feeds it: posts are market-moving information,
reactions are sentiment, the ship ritual is settlement, the ticker is the
slot machine — except every flashing number is *information*, not noise.

## Mechanics (abstracted for a small trusted room)
- **Markets**: binary YES/NO contracts. Two kinds:
  - **Ship lines** (auto): a track owner *opens their own line* by declaring
    a ship target date — consent by construction; no one gets a public
    probability on their work unless they invited it. Communal tracks: any
    contributor may open the line.
  - **Wager markets** (custom): any member posts a question + resolve-by
    date ("100 users by Sept?").
- **Pricing**: LMSR automated market maker (the standard for small markets) —
  no order book, no counterparty matching; buy/sell YES or NO at the current
  price *any time* ("invest and pull out whenever"); every trade moves the
  price, price = the room's live probability.
- **Resolution**:
  - Ship lines resolve **objectively**: `ship_track` before target → YES;
    target passes unshipped → NO. Zero authority needed.
  - Wager markets choose at creation: *creator-resolves* or **consensus
    settle** — the market simply settles at its time-weighted closing price,
    exactly the "the market validates itself" property: as the outcome
    becomes evident, trading converges the price, and that convergence IS
    the resolution.
- **Currency ("conviction")**: earned by building only — stop +5, peak +15,
  assist +10, ship +50, small daily stipend so nobody is priced out. Never
  purchasable, never cashable. Spending it on a friend's line is literally
  "putting your conviction behind them."
- **Public positions** (legible over clever): in a 10-person room, "Maya has
  200 on you shipping" is support and accountability, not surveillance.
- **Calibration ("oracle rating")**: Brier-style score per member — the
  prestige stat. Best predictor in the room wears the aura. Cosmetic only.

## Surfaces
- **Track page**: the line widget under the description — price, sparkline,
  YES/NO buy with price-impact preview, target date countdown.
- **The Floor** (new view): open markets ranked by movement; ticker of
  biggest movers in the rail ("#ml-pipeline ▲ 62→71%").
- **Inbox/push**: "your position resolved +140" · "the line on your track
  slid to 45%" — the notification most likely to make a founder open the
  app *and post a progress update to move their own market*. That is the
  addicting loop, and it is pro-social: the way to pump your price is to
  ship visibly.
- **Constellation**: node halo intensity = market heat.
- **Ship fireworks**: settlement piggybacks the jackpot — winners' payouts
  rain in the same celebration.
- **Agents**: `get_markets` + `trade` tools; your agent can analyze a track
  history (get_track) and manage positions — "my agent hedged me" becomes a
  sentence humans say. Weekly agent challenge: best-calibrated agent.

## Guardrails
No real money, ever; conviction has no cash value and no purchase path.
Faucet generous, stakes capped per-market (no ruin). Personal-track lines
exist only when the owner sets a target. Everything public and inspectable —
a room of five friends should be able to read the whole market state.

## Schema sketch
```
markets   (id, kind: ship|wager, track_id?, question, target_at,
           resolve_mode: objective|creator|consensus, b, q_yes, q_no,
           created_by, created_at, resolved_at?, outcome?)
positions (market_id, user_id, yes_shares, no_shares, cost_basis)
ledger    (id, user_id, delta, reason, ref_id, created_at)   -- conviction
```
LMSR: price_yes = e^(q_yes/b) / (e^(q_yes/b) + e^(q_no/b)); trades priced by
cost-function difference; integer math server-side.

## Revised arcade build order (market-centered)
1. **Conviction ledger + earning events** (stops/peaks/assists/ships mint)
2. **Ship lines + LMSR trading + track-page widget** (the core market)
3. **Resolution + payout riding the ship fireworks** (juice engine lands here)
4. **The Floor view + rail ticker**
5. **Wager markets + consensus settle**
6. **Oracle ratings + agent trading tools + golden-reaction tie-in**
