# The Bazaar — conviction marketplace roadmap

*2026-07-21 — captured from a founding conversation. The Bazaar shipped with
pixels as its first item kind; this doc holds the "where it goes next" so the
architecture stays honest.*

## What exists today (v0)

- **Item-kind-agnostic core**: `inventory (user_id, kind, spec, qty)` and a
  catalog of `{id, kind, name, price, spec}` items. The buy flow burns
  conviction (`purchase` in the ledger — a pure sink) and increments inventory.
  Nothing pixel-specific below the catalog layer.
- **Pixels** (`kind: 'pixel'`): 16 basic colors at 50 conviction each. Placed
  in the avatar studio (4×4 / 8×8 / 16×16 grids); placement doesn't consume —
  buy once, rearrange forever. Server validates placed-per-color ≤ owned.

## Where it goes (brainstorm, not commitments)

### More cosmetic sinks (near-term, cheap to build)
- **Premium pixel palettes**: metallic/gradient/animated pixels at higher
  prices; seasonal colors that stop being sold (scarcity without secondary
  markets).
- **Post flair**: borders, glows, custom vibe badges. Same inventory table.
- **Track banners / room decorations**: cosmetics that everyone sees.

### Member-to-member trading (the real marketplace)
- **Listings**: users list inventory items (or novel offers) for conviction;
  a `listings` table (seller, kind, spec, qty, price, expires). Buying moves
  the item *and transfers conviction seller←buyer* — the first time conviction
  moves peer-to-peer instead of mint/burn. Decide: take a burn fee (e.g. 10%)
  so trading still sinks currency and the economy doesn't go inflation-loose.
- **Escrow for non-instant goods**: hold buyer's conviction until the seller
  delivers (or auto-refund at timeout). Needed for everything below.

### The cutting-edge stuff (agent-era goods)
- **AI inference tokens**: members sell access to their model quota — "10k
  tokens of my Claude Max plan for 200 conviction." Delivery = a scoped API
  relay through the seller's account (rate-limited, revocable). Hard parts:
  metering, abuse, ToS of upstream providers.
- **Agent hours**: rent another member's agent — "my research agent, 1 hour,
  500 conviction." Delivery = a scoped MCP token to the seller's agent with
  a time/tool budget. The `access_tokens` + MCP plumbing already points here.
- **Agent services as listings**: standing offers ("my agent reviews your PR
  for 50"), fulfilled asynchronously; ties into briefings (ADR-024) as the
  delivery channel.
- **Compute / storage / domains**: anything meterable a founder has spare.

### Mechanics to revisit when p2p lands
- Conviction stays **non-transferable except through the Bazaar** — the
  marketplace is the only valve, so every transfer is visible and feeable.
- **MCP tools** for the Bazaar (browse/buy/list) so agents can shop for their
  humans — deliberately skipped in v0, add with p2p.
- Price discovery: fixed prices first; auctions/AMM only if listings get deep.
- A `bazaar_log` / tape like The Floor's, so purchases are ambient room life.

## Design invariants (keep these true)

1. The catalog/inventory/buy core never learns what an item *is* — kinds are
   plugins (pixels prove the pattern).
2. House sales **burn**; p2p sales **transfer minus a burn fee**. The Bazaar
   should always be net-deflationary.
3. Cosmetics are visible in the room (avatars in every post) — the sink works
   because spending is *seen*.
