# Layer — Project Context & Handoff

> Read this first in any new chat. It has the original idea, every decision made
> since, the exact current state of the code, and what's still open. Paste this
> file's contents (or a link to it once it's on GitHub) at the start of a new
> conversation to pick up exactly where this one left off.

## 1. The core idea

Restaurants still mostly use static digital menus (QR → PDF or a plain list) —
no transparency into what's in a dish, no real customization beyond talking to
a waiter. **Layer** is a digital menu where every dish is clickable and opens
into one of two views:

- **Mode A — Exploded layers.** For naturally "stackable" dishes (burgers,
  wraps, sandwiches, bowls): shown opened up layer by layer. Customers add,
  remove, or increase quantity per layer, with the bill updating live and a
  per-action price delta shown (e.g. "+ ₹20 Extra cheese"), never just a
  silently-updated total.
- **Mode B — Ingredient view.** For dishes that aren't naturally layered
  (curries, soups, drinks): full transparency on what's inside via tags/icons,
  with limited swaps where the restaurant allows them (e.g. a mocktail's juice
  base). No fake layering forced onto dishes that don't have layers.

The **restaurant-onboarding tool** is considered the more important half of
the product — the adoption bottleneck is how fast an owner can create these
menu items, not the customer-facing polish. Target: upload a photo, tag
ingredients, set pricing — about two minutes per dish, no design/technical
skill required.

This is a **B2B SaaS/tool business**, not a guaranteed hypergrowth consumer
platform. Comparable AR/3D menu players (Kabaq, PizzAR, QReal) have mostly
stayed small, sold-as-add-on businesses — that's an expectation-setter, not a
dealbreaker. Believable ROI pitch to restaurants: this turns upselling
("extra cheese") into a single tap instead of a verbal ask — a concrete
average-order-value lever.

## 2. Where this stands right now

A **working local full-stack prototype** exists — not a mockup. It has been
run end-to-end (fresh `npm install`, server started, every API route hit and
verified, data persistence confirmed) multiple times during development.

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
go below quantity 1.

### Features already built
- **Menu tab**: dish cards → detail overlay → Mode A/B customization → live
  running total + per-action delta feed → cart → place order.
- **Owner tools tab**: photo upload (stored as base64 data URL — fine for a
  prototype, not for production), name/category/base price, removal-price
  rule, Mode A/B choice, ingredient/layer builder (name, per-unit price, max
  qty, mandatory, allergens), publish/edit/delete, list of published dishes.
- **Kitchen & dashboard tab**: every placed order renders as a kitchen ticket
  (dish + modifications, not prose), plus stats: orders placed, total revenue,
  revenue specifically from add-ons, most-added-extras leaderboard.

## 3. Design direction and its history

First pass was a plain cream/paper "ticket" aesthetic — felt flat, no depth.
Second pass (current) moved to a warm dark charcoal counter background
(`--bg:#231B16`) with brass/rust/moss accents and a **layered shadow system**
(`--lift-1/2/3` — hard edge + soft throw + a hairline top sheen, reused
everywhere so depth reads as one consistent material — paper lifted off a
dark counter — rather than generic card shadows). Tabs became an icon'd
segmented control; the owner form got split into three numbered, visually
separated sections; the dashboard got SVG icons per stat and a ranked list.

**This is still not good enough.** The last screenshot review (dark theme,
only 3 seed dishes) showed the core unresolved problem: **too much dead
space** — the menu grid uses `auto-fill` so with only 3 cards there's a large
empty gutter to the right, and there's nothing below the fold, making it look
unfinished/sparse rather than like a real product. Diagnosed fixes that were
identified but **not yet shipped as of this handoff**:
1. Change `.menu-grid` from `grid-template-columns:repeat(auto-fill,...)` to
   `repeat(auto-fit,...)` so existing cards stretch to fill the row instead of
   leaving phantom empty tracks.
2. Add a category filter pill bar above the grid (dishes already have a
   `category` field — "Burgers", "Curries", "Mocktails" — just not surfaced
   as a filter yet).
3. Add a short "how it works" 3-step strip below the grid to use vertical
   space intentionally and read as a finished product, not a cut-off page.
4. Give the "No photo yet" placeholder an icon/pattern instead of bare text.
5. General pass on information density — dish cards, stat boxes, and the
   owner form all have room to feel more considered rather than sparse.

**Whoever picks this up next should treat "make it feel like a finished,
professional product — not just correctly-functioning" as the immediate next
task**, before adding new features.

## 4. Known gaps (by design, for a first pass)

- **No accounts / multi-restaurant support** — one shared menu right now.
  Needs a `restaurantId` on dishes/orders plus a login layer.
- **No real database** — JSON files are fine for a pilot, not concurrent
  writes at scale. Schema above maps ~1:1 to a Postgres/SQLite table.
- **No POS/KDS integration** — orders just sit in `orders.json`. Real
  deployment needs to push orders to the restaurant's existing kitchen
  display/POS (Petpooja, Posist are the big ones in India).
- **No AI-assisted ingredient tagging** — owner tool is fully manual. Highest-
  leverage next feature for onboarding speed: vision-model-suggested
  ingredient tags from the uploaded photo, owner just confirms/edits.
- **No payments.**
- **Ingredient dependency rules not modeled** — e.g. removing "cheese" should
  also remove "cheese sauce" if they're separate layers; nothing stops
  incoherent combinations yet beyond the `mandatory` flag.
- **No spice-level/doneness modifiers** — only ingredient add/remove/qty and
  swaps exist; non-ingredient modifiers (spice level, cooking preference)
  aren't modeled as their own type yet.
- **No kitchen-complexity throttle** — nothing lets a restaurant temporarily
  disable deep customization during a rush.
- **No GST/tax-on-delta handling, no combo/thali interaction logic.**
- **No veg/non-veg/Jain filter, no multi-language menu text** — flagged as
  important given an Indian-market pilot, not yet built.

## 5. Business/rollout context (from the original idea doc — still valid)

- Target for the first real pilot: **one independent local restaurant**,
  starting with **one layered category** (burger/sandwich is the natural
  starting example used throughout).
- Validate before expanding: do customers actually use the customization, and
  does it measurably lift order value? Get one real before/after AOV number
  before pitching anyone else — that number is the entire sales pitch.
- Distribution: founder-led pilot first, then go through **POS
  resellers/system integrators** (e.g. Petpooja/Posist ecosystem) rather than
  direct restaurant sales at scale, since restaurants already trust their POS
  vendor's add-on ecosystem.
- Pricing model direction: per-outlet SaaS + optional small revenue share on
  upsell, so incentives align with the restaurant's own AOV growth.

## 6. Suggested next steps, in order

1. Fix the "looks unfinished" problem (section 3's five numbered fixes).
2. Add ingredient dependency rules and non-ingredient modifiers (spice level
   etc.) to the data model and owner tool.
3. Add veg/non-veg/Jain + allergen filters to the customer menu view.
4. Swap JSON-file storage for a real database once ready to pilot with an
   actual restaurant (schema is already compatible).
5. Add restaurant accounts (`restaurantId` everywhere) once there's more than
   one restaurant using it.
6. Look at POS/KDS integration options for the target pilot restaurant's
   existing system.