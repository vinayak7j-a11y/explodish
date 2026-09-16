# Explodish (working title was "Layer") — Project Context & Handoff

> Read this first in any new chat. It has the original idea, every decision
> made since, the exact current state of the code, and everything still open —
> including a naming inconsistency that needs fixing. This is the complete
> version; if you've seen an earlier copy of this file, replace it with this
> one.

## 0. Naming — unresolved, fix this first

The GitHub repo is named **explodish**, but the code itself still says
**"Layer"** everywhere: the page `<title>` in `public/index.html`, the
on-screen masthead/logo text, and this doc's own earlier drafts. Nobody has
actually decided the final name or done the rename. Before or right after
picking up new feature work, either:
- pick "Explodish" (or something else) as final and rename it across
  `index.html` (title + masthead text) and this doc, or
- confirm "Layer" is staying and just rename the GitHub repo instead.

Don't let both names keep coexisting — pick one in the first session that
touches this project again.

## 1. The core idea

Restaurants still mostly use static digital menus (QR → PDF or a plain list) —
no transparency into what's in a dish, no real customization beyond talking to
a waiter. This product is a digital menu where every dish is clickable and
opens into one of two views:

- **Mode A — Exploded layers.** For naturally "stackable" dishes (burgers,
  wraps, sandwiches, bowls): shown opened up layer by layer. Customers add,
  remove, or increase quantity per layer, with the bill updating live and a
  per-action price delta shown (e.g. "+ ₹20 Extra cheese"), never just a
  silently-updated total.
- **Mode B — Ingredient view.** For dishes that aren't naturally layered
  (curries, soups, drinks): full transparency on what's inside via tags/icons,
  with limited swaps where the restaurant allows them (e.g. a mocktail's juice
  base). No fake layering forced onto dishes that don't have layers.

**Evolution of the idea, in order** (for context on why it looks like this):
1. Started as a full free-form 3D dish builder — dropped because rendering a
   3D visual for every possible ingredient combination doesn't scale
   (combinations multiply fast, technically expensive).
2. Narrowed to the "exploded-layer" view (Mode A) — keeps the tactile
   customization feel without procedural 3D rendering.
3. Added Mode B for dishes that aren't naturally layered, rather than forcing
   a fake layered look onto curries/soups/smoothies (would look artificial or
   misleading about how the dish is actually made).

The **restaurant-onboarding tool** is considered the more important half of
the product — the adoption bottleneck is how fast an owner can create these
menu items, not the customer-facing polish. Target: upload a photo, tag
ingredients, set pricing — about two minutes per dish, no design/technical
skill required.

**Why the idea is considered solid** (reasoning, not just the pitch):
- Technically buildable without exotic tech — no true 3D engine or
  photogrammetry, just well-designed layered/icon visuals and a price
  calculator.
- Solves a real, provable problem: ordering food without knowing what's in
  it, and today's customization being either absent or a clunky checklist.
- Believable ROI pitch to restaurants: turns upselling ("extra cheese") into
  a single tap instead of a verbal ask — a concrete average-order-value
  lever, not just a "looks cool" pitch.
- Differentiated from existing AR/3D menu tools (Kabaq, PizzAR, QReal) —
  those show a static/rotating 3D view of a pre-made dish; almost none let a
  customer break a dish apart and edit it live.

**Honest limitations:**
- This is realistically a **B2B SaaS/tool business**, not a guaranteed
  hypergrowth consumer platform — comparable AR/3D menu players have mostly
  stayed small, sold-as-add-on businesses. Expectation-setter, not a
  dealbreaker.
- The real bottleneck to watch is restaurant onboarding speed and adoption
  willingness — not the customer-facing tech.
- Needs real pilot evidence (1–2 real restaurants, actual before/after
  order-value data) before assuming it scales or is fundable.

## 2. Where this stands right now

A **working local full-stack prototype** exists — not a mockup. It has been
run end-to-end (fresh `npm install`, server started, every API route hit and
verified with curl, data persistence confirmed) multiple times during
development.

**Stack** (deliberately boring, no build step):
- Backend: Node.js + Express (`server.js`), one file, all routes in it.
- Storage: flat JSON files (`data/dishes.json`, `data/orders.json`) via plain
  `fs.readFileSync`/`writeFileSync`. First thing to swap for a real DB later —
  only `server.js` touches these files, so it's a contained change.
- Frontend: plain HTML/CSS/vanilla JS in `public/`, no framework, no bundler.
  Talks to the backend via `fetch()` to `/api/dishes` and `/api/orders`.

**Run it:**
```bash
cd menu-app
npm install
npm start
```
Open `http://localhost:3000`.

### File structure 

menu-app/
├── server.js # Express server + all API routes
├── package.json
├── PROJECT_CONTEXT.md # this file
├── README.md
├── data/
│ ├── dishes.json # seed data: burger (Mode A), paneer curry + mocktail (Mode B)
│ └── orders.json
└── public/
├── index.html
├── styles.css # design system — see section 4
└── app.js # all frontend logic: rendering, pricing engine, API calls
 

### API
| Method | Route            | Body                         | Notes                              |
|--------|------------------|-------------------------------|--------------------------------------|
| GET    | `/api/dishes`     | —                              | all dishes                          |
| POST   | `/api/dishes`     | dish object (no `id`)          | server assigns `id`                 |
| PUT    | `/api/dishes/:id` | full dish object               | replaces a dish                     |
| DELETE | `/api/dishes/:id` | —                              | removes a dish                      |
| GET    | `/api/orders`     | —                              | all orders                          |
| POST   | `/api/orders`     | order object (no `id`/`time`)  | server assigns both                 |

### Data model
```json
{
  "id": "seed-burger",
  "name": "The Original Smash Burger",
  "mode": "A",
  "basePrice": 189,
  "category": "Burgers",
  "image": null,
  "removalRefund": false,
  "ingredients": [
    { "id": "b1", "name": "Sesame bun", "included": true, "mandatory": true,
      "unitPrice": 0, "maxQty": 1, "allergens": ["Gluten"] }
  ]
}
```
Mode B ingredients skip `mandatory`/`maxQty`/`included` and instead use
`swappable` + `swapOptions: [{ label, price }]`.

**Pricing engine logic** (the part worth re-reading before touching it):
For an included ingredient, going above its default quantity charges
`unitPrice` per extra unit, and reducing back down refunds that same amount —
symmetric. But dropping *below* the included baseline (i.e. removing the
ingredient entirely) only changes the price if the dish's `removalRefund` flag
is true; otherwise it's logged as a "no price change" delta so the customer
sees the rule was applied on purpose, not a bug. Mandatory ingredients can't
go below quantity 1. Open product decision, restated from the original idea:
many restaurants won't want to discount for removed items since it doesn't
reduce their cost — but the rule needs to be visible to the customer to avoid
disputes, which is why every price-affecting action logs a delta line rather
than silently updating just the total.

### Features already built
- **Menu tab**: dish cards → detail overlay → Mode A/B customization → live
  running total + per-action delta feed → cart → place order.
- **Owner tools tab**: photo upload (stored as base64 data URL — fine for a
  prototype, not for production), name/category/base price, removal-price
  rule, Mode A/B choice, ingredient/layer builder (name, per-unit price, max
  qty, mandatory, allergens), publish/edit/delete, list of published dishes.
  Form is split into three numbered sections (Photo & basics / Pricing &
  view / Layers-Ingredients) rather than one long form.
- **Kitchen & dashboard tab**: every placed order renders as a kitchen ticket
  (dish + modifications, not prose), plus stats: orders placed, total revenue,
  revenue specifically from add-ons, most-added-extras leaderboard (ranked
  list).

## 3. Design direction and its history

First pass was a plain cream/paper "ticket" aesthetic — felt flat, no depth.
Second pass (current) moved to a warm dark charcoal counter background
(`--bg:#231B16`) with brass/rust/moss accents and a **layered shadow system**
(`--lift-1/2/3` — hard edge + soft throw + a hairline top sheen, reused
everywhere so depth reads as one consistent material — paper lifted off a
dark counter — rather than generic card shadows). Tabs became an icon'd
segmented control; the owner form got split into three numbered, visually
separated sections; the dashboard got SVG icons per stat and a ranked list.

**This is still not good enough — confirmed by an actual screenshot review.**
With only the 3 seed dishes, the menu page reads as sparse/unfinished:
large empty gutter to the right of the cards (grid uses `auto-fill`, which
leaves phantom empty tracks when there are fewer items than would fill a
row), and nothing to fill the page below the fold. Diagnosed fixes,
**not yet shipped as of this handoff**:
1. Change `.menu-grid` from `grid-template-columns:repeat(auto-fill,...)` to
   `repeat(auto-fit,...)` so existing cards stretch to fill the row instead of
   leaving empty tracks.
2. Add a category filter pill bar above the grid (dishes already have a
   `category` field — "Burgers", "Curries", "Mocktails" — just not surfaced
   as a filter yet).
3. Add a short "how it works" 3-step strip below the grid to use vertical
   space intentionally and read as a finished product, not a cut-off page.
4. Give the "No photo yet" placeholder an icon/pattern instead of bare text.
5. General pass on information density — dish cards, stat boxes, and the
   owner form all have room to feel more considered rather than sparse.

**Treat "make it feel like a finished, professional product" as the
immediate next task**, before adding new features.

## 4. Known gaps and edge cases (not yet handled)

**Structural/pricing:**
- No accounts / multi-restaurant support — one shared menu right now. Needs a
  `restaurantId` on dishes/orders plus a login layer.
- No real database — JSON files are fine for a pilot, not concurrent writes
  at scale. Schema maps ~1:1 to a Postgres/SQLite table.
- Ingredient dependency rules not modeled — e.g. removing "cheese" should
  also remove "cheese sauce" if they're separate layers; nothing stops
  incoherent combinations beyond the `mandatory` flag.
- No non-ingredient modifiers (spice level, doneness/cooking preference,
  portion size) — only ingredient add/remove/qty and Mode B swaps exist as
  data types right now.
- No GST/tax-on-delta handling, no combo/thali pricing interaction logic
  (what happens when a customer customizes an item that's part of a
  fixed-price combo?).
- No handling for fraud/misuse of the no-refund-on-removal rule (e.g.
  removing many ingredients hoping for an unintended discount).
- No order cancellation/edit flow after submission.

**Kitchen/operations:**
- No POS/KDS integration — orders just sit in `orders.json`. Real deployment
  needs to push orders to the restaurant's existing kitchen display/POS
  (Petpooja, Posist are the big ones in India).
- No ingredient stockout / "86 this ingredient" toggle — if the kitchen runs
  out mid-service, there's no way to pull that layer from the live menu.
  instantly.
- No kitchen-complexity throttle — nothing lets a restaurant temporarily
  disable deep customization during a rush (200-cover Saturday night
  scenario).
- No multi-outlet/chain support — templated dishes across branches with
  local pricing overrides aren't modeled.
- No offline/poor-connectivity handling — no PWA caching strategy for
  restaurant wifi that drops.

**Menu/market fit:**
- No veg/non-veg/Jain filter, no multi-language menu text — flagged as
  important given an Indian-market pilot, not yet built.
- No allergen-driven menu filtering (should be close to free once ingredients
  are tagged — the data already carries `allergens` per ingredient).
- No AI-assisted ingredient tagging — owner tool is fully manual right now.
  Highest-leverage next feature for onboarding speed: a vision-model
  suggests ingredient tags from the uploaded photo, owner just confirms/edits.
- No payments.

## 5. Feature ideas considered but not built (backlog, roughly prioritized)

- **AI-assisted onboarding** (see above) — biggest lever on the 2-minute
  onboarding target.
- **Reusable ingredient library per restaurant** — tag "cheddar cheese" once
  with price/allergens/icon, reuse across dishes; also unlocks free
  allergen/veg filtering menu-wide.
- **Prep-time estimate shown to customer** ("extra patty adds ~3 min") —
  another honest-pricing/expectation-setting signal.
- **Owner analytics that sell the subscription on their own** — e.g. "42% of
  burger orders add extra cheese — consider bundling it." Some of this
  already exists (most-added-extras leaderboard); could go further with
  trend-over-time views.
- **POS/KDS integration** — likely more important than any customer-facing
  feature for actually getting trusted/adopted by a restaurant.
- **Social/viral loop** — let customers save/share a custom build (useful
  for group ordering at a table; also word-of-mouth, Subway-style).
- Lower priority / later-stage ideas from the original brainstorm: loyalty
  and gamification, a "surprise me" AI recommender based on customization
  history, white-labeling for hotel room service or QSR chains, a table-side
  tablet/kiosk mode in addition to QR, sustainability/ingredient-sourcing
  badges as a differentiator, a "chef's rules" constraint engine (e.g. max 3
  add-ons per dish, can't remove the base sauce).

## 6. Business/rollout context (still valid)

- Target for the first real pilot: **one independent local restaurant**,
  starting with **one layered category** (burger/sandwich is the natural
  starting example used throughout).
- Validate before expanding: do customers actually use the customization, and
  does it measurably lift order value? Get one real before/after AOV number
  before pitching anyone else — that number is the entire sales pitch.
- Recommended rollout order: (1) one layered category at a small number of
  real restaurants, (2) validate usage + order-value lift, (3) expand to
  Mode B and additional categories (bowls, wraps, mocktails) once the core
  loop is proven.
- Distribution: founder-led pilot first, then go through **POS
  resellers/system integrators** (e.g. Petpooja/Posist ecosystem) rather than
  direct restaurant sales at scale, since restaurants already trust their POS
  vendor's add-on ecosystem.
- Pricing model direction: per-outlet SaaS + optional small revenue share on
  upsell, so incentives align with the restaurant's own AOV growth.

## 7. Suggested next steps, in order

1. Resolve the naming question (section 0).
2. Fix the "looks unfinished" problem (section 3's five numbered fixes).
3. Add ingredient dependency rules and non-ingredient modifiers (spice level
   etc.) to the data model and owner tool.
4. Add veg/non-veg/Jain + allergen filters to the customer menu view.
5. Swap JSON-file storage for a real database once ready to pilot with an
   actual restaurant (schema is already compatible).
6. Add restaurant accounts (`restaurantId` everywhere) once there's more than
   one restaurant using it.
7. Look at POS/KDS integration options for the target pilot restaurant's
   existing system. 