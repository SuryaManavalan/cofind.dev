# The Line — game design audit (pre-ship balance pass)

*2026-07-19 · conducted before merging ADR-023 to production. Method: economy
flow accounting (faucets/sinks), adversarial play (every actor assumed
profit-maximizing and shameless), and a fun-over-time review. Exploits below
were confirmed against the actual engine code, then fixed and re-verified with
attack scripts against a live server.*

---

## 1. The economy on one page

**Faucets** (conviction minted):
| Source | Amount | Bound before this audit |
|---|---|---|
| Join | +100 | once |
| Show up | +10/day | daily |
| Track stop | +5 | **unbounded** ⚠️ |
| Plain post | +2 | **unbounded** ⚠️ |
| Reaction received | +3 | **unbounded, per emoji, re-triggerable** ⚠️ |
| Ship | +50/contributor | **per ship call, not per track** ⚠️ |
| Settlement | 10/winning share | AMM-subsidized, ≤ ~208/market |

**Sinks:** none, by design — conviction only moves (stakes) or sits. The only
deflation is losing a bet to another player. The AMM subsidy
(max `b·ln2·payout` ≈ 208/market) is a deliberate faucet: it's the pot that
makes *skilled prediction* positive-sum. That's fine **only if** every
guaranteed-win strategy is closed. It wasn't.

**Scale check (healthy):** an active builder earns ~15–40/day; position cap
500 ≈ two weeks of building; min stake 5 ≈ half a daily stipend. Stakes are
meaningful, ruin is capped, and a busted player always has an earning floor
(stipend + building) — no bankruptcy lockout. These numbers survive the audit
unchanged.

## 2. Exploits found (all confirmed in code, all now fixed)

**E1 — The dealer bets (critical).** No rule stopped a track owner trading
their own line. Two risk-free strategies: (a) max YES, ship immediately —
~+30–40% guaranteed; (b) worse, max NO and simply *never ship* — ~+90% for
doing nothing, since the owner controls the outcome. This single hole turns
the entire game into a private printer for whoever opens lines.
**Fix — the insider rule: you cannot trade a line you can settle.** Owner on
personal tracks, any contributor on communal tracks. The builder's position
*is* their deadline; the market is the audience's game. (This also sharpens
the skill: outsiders win by actually reading the track.)

**E2 — Reopen-ship pump (critical).** `ship_track` awarded +50/contributor on
every ship call, and reopening is one click. Ship→reopen→ship = +50/cycle.
**Fix:** the ship award is once per (user, track), ever — enforced against the
ledger, survives reopens.

**E3 — Reaction toggle farm (high).** +3 to the author fired on every
reaction *add*: 8 emoji per post per friend, and toggling off/on re-awarded
indefinitely. Two accounts ping-ponging one reaction = infinite printer.
**Fix:** +3 fires once per (post, reactor) pair, ever — first emoji only,
re-adds award nothing (ledger-keyed on `target:reactor`).

**E4 — Post-spam printing (medium).** Stops/posts awarded unbounded; an agent
loop prints hundreds/day. **Fix:** earning from posting caps daily — first 4
stops (+20) and first 5 plain posts (+10) per UTC day pay; further posting is
welcome but unpaid. Caps chosen ≈ the stipend's order of magnitude so building
stays the best-paying activity without becoming a spam target.

**E5 — Trivial-line milking (medium, collusion).** With a 1-hour minimum
target, open a line on an obviously-dead track; a colluder buys NO at 50% for
a near-certain ~2x funded by the AMM subsidy (~200/market leak).
**Fix:** target must be ≥24h and ≤90d out. Residual collusion (junk track +
junk line + colluding bettor) remains *possible* but requires fabricating a
visible building history in a five-person room where every line and every
position is public — social cost exceeds the take. Accepted at this scale;
revisit if the room grows.

**E6 — Join-then-settle (medium).** Buy YES on a communal line as an
outsider, post one stop (instant contributor = ship rights), ship it yourself
→ forced YES while holding YES. **Fix — the shipper's hands are clean rule:**
when a ship settles a line, the shipper's own position is voided and their
cost basis refunded (`void` ledger entry). You can never collect on a
settlement you personally triggered. (An early YES bettor who later genuinely
contributes and lets *someone else* ship keeps their payout — they did the
work and took the risk; that's the game working.)

**E7 — Rounding dust (low).** Sell refunds used `Math.round` (can round up);
buys floor. A buy/sell cycle was at worst break-even, never profitable, but
the correct direction is: house never loses to dust. **Fix:** sell refunds
floor.

## 3. Is it a good game? (the fun review)

**Core loop** — build → your line prices your momentum → friends stake on you
→ deadline tension → ship → fireworks and settlement. This is a strong loop
because the *stakes generate the content*: every stop posted is market news,
every price move is social information ("the room got less sure about me").

**Two distinct player experiences, both fun:**
- *The builder (insider):* can't trade, but owns the most dramatic number in
  the room — their own probability. Their moves are stops and the ship itself.
  The line widget tells them this explicitly. Motivation: proving the room
  right (or wrong), plus the ship award.
- *The audience (outsiders):* an information game. The edge comes from
  actually reading tracks (`get_track` before `trade` — the agent guidance is
  literally the optimal strategy). Betting NO on a friend is a spicy, *public*
  callout that pays the target attention either way.

**Return cadence:** daily stipend gives a claim-shaped visit; prices move on
stops and trades; the rail ticker surfaces overnight swings; settlements
cluster around targets. Quiet-room risk (nobody trades → static prices) is
real at 5 people — mitigated because agents also trade, and every stop is a
price catalyst. Watch after launch.

**Loss feeling:** losing conviction stings correctly (weeks of building) but
never locks anyone out — the earning floor guarantees re-entry. No pity
mechanics needed; no streak pressure anywhere (anti-thesis).

**Skill expression:** entry timing, side, sizing, and sell-backs against an
LMSR that always quotes. Information advantage goes to whoever pays the most
attention to friends' actual work — which is exactly the behavior the app
exists to reward. The incentive alignment is the best part of the design.

**Perverse incentives audited:** NO-holders want you to fail — but positions
are public, NO-holders can't be contributors (insider rule), and a public NO
is functionally a challenge, which is banter, which is engagement. Deadline
pressure is opt-in (only the builder opens their line). A rushed fake "ship"
to win is visible to the whole room and voids the shipper's own position
anyway.

**Future levers (not now):** seasons with soft resets, a conviction
leaderboard framed as "most built", parlay lines across tracks, opening-day
price alerts. None gate launch.

## 4. Verdict

With the six fixes: **the economy has no known guaranteed-profit strategy**,
every faucet is bounded per day or per event, the AMM subsidy flows only to
genuinely-at-risk predictors, and both player roles have a real game.
Balanced enough to ship to a trusted room; the named residual risk
(collusion at E5) is documented in ADR-023 with its revisit trigger.
