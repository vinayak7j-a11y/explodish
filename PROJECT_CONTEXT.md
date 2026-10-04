# Explodish — Project Context & Handoff

> Read this first in any new chat. It has the original idea, every decision
> made since, the exact current state of the code, and everything still open.
> This is the complete version; if you've seen an earlier copy of this file,
> replace it with this one.

## 0. Naming — resolved: "Explodish"

**Explodish** is the final name. The GitHub repo was already named this;
the code still said **"Layer"** in the page `<title>`, the on-screen
masthead text, `README.md`'s heading, and the server startup log — all of
those have now been renamed to Explodish. "Layered" is kept as a plain
English adjective describing Mode A's visual style (e.g. the "Layered"
badge on a dish card) — that's a description, not the product name, so it
wasn't touched.

No other renames pending. If this ever needs to change again, the full list
of places the name shows up is: `public/index.html` (`<title>` + masthead
`<h1>`), `README.md`'s heading, and the `console.log` in `server.js`.

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
  "dietary": "non-veg",
  "jainFriendly": false,
  "ingredients": [
    { "id": "b1", "name": "Sesame bun", "included": true, "mandatory": true,
      "unitPrice": 0, "maxQty": 1, "allergens": ["Gluten"] }
  ],
  "modifiers": [
    { "id": "mod-spice", "name": "Spice level",
      "options": [{ "label": "Regular", "priceDelta": 0 }, { "label": "Spicy", "priceDelta": 0 }] }
  ]
}
```
Mode B ingredients skip `mandatory`/`maxQty`/`included` and instead use
`swappable` + `swapOptions: [{ label, price }]`. `dietary` is `"veg"` /
`"non-veg"` / `"egg"`. Any Mode-A ingredient can carry an optional
`requires: [ingredientId]` array for dependency cascades (see section 4).

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
- **Menu tab**: category filter pills, dietary/Jain/allergen filter row (see
  section 4), veg/non-veg/egg dot on every card → dish cards → detail overlay
  → Mode A/B customization → dependency cascades → modifiers → live running
  total + per-action delta feed → cart → place order. All of it now carries
  the motion pass described in section 3.
- **Owner tools tab**: photo upload (stored as base64 data URL — fine for a
  prototype, not for production), name/category/dietary type/Jain flag/base
  price, removal-price rule, Mode A/B choice, ingredient/layer builder (name,
  per-unit price, max qty, mandatory, allergens, dependency chips), modifier
  group builder, publish/edit/delete, list of published dishes. Form is split
  into four numbered sections (Photo & basics / Pricing & view /
  Layers-Ingredients / Modifiers) rather than one long form.
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
segmented control; the owner form got split into numbered, visually
separated sections; the dashboard got SVG icons per stat and a ranked list.

**Was not good enough — confirmed by an actual screenshot review, now fixed.**
With only the 3 seed dishes, the menu page read as sparse/unfinished: large
empty gutter to the right of the cards (grid used `auto-fill`, which leaves
phantom empty tracks when there are fewer items than would fill a row), and
nothing to fill the page below the fold. Diagnosed fixes, **all shipped**:
1. Changed `.menu-grid` from `grid-template-columns:repeat(auto-fill,...)` to
   `repeat(auto-fit,...)` so existing cards stretch to fill the row instead of
   leaving empty tracks.
2. Added a category filter pill bar above the grid, built from each dish's
   existing `category` field ("Burgers", "Curries", "Mocktails" today, plus
   "All"). Filtering happens client-side in `customerView()` against an
   `activeCategory` state variable — no new API needed.
3. Added a short "how it works" 3-step strip below the grid (`howItWorksStrip()`
   in `app.js`, `.how-strip` styles in `styles.css`) to use vertical space
   intentionally and read as a finished product, not a cut-off page.
4. Gave the "No photo yet" placeholder a line-icon (matches the existing
   icon language used elsewhere) instead of bare text.
5. Light density pass: dish cards now show their category as a small label
   above the name; stat boxes get a hover lift consistent with dish cards.
   The owner form's numbered sections already had per-section descriptions
   and were judged dense enough as-is — left untouched.

The "make it feel like a finished, professional product" pass is done —
see section 4 for what's shipped since.

**Motion & interaction pass (shipped).** The static version worked but felt
inert — nothing acknowledged a tap, price changes just appeared. Rather than
scatter fade-and-slide-up entrances on every element (the generic default
that reads as templated), motion was deliberately concentrated in one place
and otherwise kept to responses that answer an actual action:
- **The one signature moment**: opening a Mode A dish's detail view triggers
  the layers cascading into place with a slight offset — literally an
  "exploded" reveal, tied to what the product is named after. Mode B
  ("ingredient view") gets a plain fade instead, since it isn't exploded and
  shouldn't pretend to be. This only plays on the *first* open of a dish;
  every subsequent re-render while customizing (stepper clicks, swaps,
  modifier changes) reuses the same overlay state instantly, so adjusting an
  ingredient never re-triggers the whole sheet sliding up again.
- **Price feedback, since that's the actual point of the app**: the running
  total does a quick scale-pulse whenever a change actually moves the price
  (not on every render — compared against the previous total each time), the
  specific ingredient's quantity number gets a small pop, and the newest
  delta-feed row slides in from the right while older rows stay static. All
  three only fire in response to the customer's own tap.
- **Small tactile confirmations**: stepper/modifier buttons compress
  slightly on press, the cart FAB does a one-time bounce when something is
  added, and the cart panel's line items stagger in when it's opened.
- **Everything else stayed quiet**: no scroll-triggered reveals, no
  decorative motion on load. The tab switcher is sticky (with a
  backdrop-blur state once actually scrolled) so it stays reachable on a
  long page — a usability decision, not a flourish.
- **Baseline hygiene alongside the above**: `prefers-reduced-motion` is
  respected globally (durations collapse to near-zero), focus-visible
  states are defined for keyboard navigation, dish/detail images lazy-load
  and fade in once actually loaded instead of popping in, and Escape closes
  the open detail overlay. Toasts now stack in a dedicated container instead
  of overlapping if more than one fires in quick succession.

Verified with a headless DOM simulation (jsdom) driving real clicks through
the actual `app.js` — confirmed the cascade plays once and only once per
dish, the pulse only fires on an actual price change, the qty-bump targets
only the ingredient that changed (not the whole list), and no runtime
errors surface across the open → adjust → add-to-cart → open-cart flow.

**Auto-rendered ingredient visuals (shipped) — replaces the flat "No photo
yet" placeholder.** The placeholder from the fix above worked, but every
dish without a photo still looked identical and static. What's there now
instead, for any Mode A dish without an uploaded photo:
- A small hand-built library of glossy CSS-rendered ingredient "discs"
  (`INGREDIENT_VISUALS` in `app.js`) — bun, patty, cheese, leafy greens,
  tomato, onion, pickle, sauce, paneer, cream, and a generic fallback.
  `matchIngredientVisual()` keyword-matches whatever the owner actually
  typed (`"Cheddar cheese"` → cheese, `"Jalapeño"` → falls through to
  generic) — nothing new for the owner to fill in.
- `renderExplodedStack()` turns a dish's *current* ingredient state into a
  literal stack of these discs — a matched bun renders as both the bottom
  and top cap, everything else stacks between in array order, and anything
  at qty>1 gets a small count badge instead of duplicate discs. It's fully
  derived from live state, so it's used in three places with zero
  synchronization code: the menu card (compact, default quantities), the
  detail overlay's hero area (full-size, live), and it just re-renders
  correctly every time `renderDetailOverlay()` re-runs after a stepper
  click, a cascade removal, or a swap.
- Mode B dishes aren't "layered" by definition, so `renderModeBIcon()` gives
  them a simple bowl or glass icon instead (matched from dish category/name
  — "mocktail"/"cooler"/etc. → glass, everything else → bowl) rather than
  forcing the stack metaphor onto something that isn't stacked.
- A dish's own uploaded photo (if the owner adds one) always wins over the
  auto-render, on both the card and in the detail view — this system only
  fills the gap when there's nothing else to show.
- **Deliberately not photography.** This is original CSS/SVG artwork, not
  real food images — the honest reasoning: real photos pulled from a web
  search aren't licensed for use in a real product, and true photorealism
  (real licensed photos via an API like Unsplash/Pexels, or AI-generated
  images) is a genuinely bigger decision — an external dependency, a cost
  model, and in the AI case an ongoing per-image charge — that hasn't been
  made yet. The code is structured so `matchIngredientVisual()` is the one
  seam that would need to change to swap in real photos per ingredient
  later (fetched once per unique name, cached, reused everywhere) without
  touching the stacking/layout logic at all.
- Verified with the same jsdom approach: disc counts match expected
  ingredient state exactly (including the bun double-render and the
  dependency-cascade case), the quantity badge appears only on the changed
  ingredient, and both Mode B icon variants render correctly — all with
  zero runtime errors across open → adjust → remove.

## 4. Known gaps and edge cases (not yet handled)

**Structural/pricing:**
- No accounts / multi-restaurant support — one shared menu right now. Needs a
  `restaurantId` on dishes/orders plus a login layer.
- No real database — JSON files are fine for a pilot, not concurrent writes
  at scale. Schema maps ~1:1 to a Postgres/SQLite table.
- Ingredient dependency rules **shipped**: layers get an optional `requires`
  array of other ingredient ids; removing a layer auto-removes anything that
  `requires` it (cascades through chains), logs a delta line explaining why,
  and leaves `mandatory` layers alone since those can't be removed by any
  path. Owner tool exposes this as toggleable chips per layer ("Auto-remove
  this layer if the customer removes: ..."). Seed data has a live example —
  the burger's "Cheese sauce drizzle" `requires` "Cheddar cheese".
- Non-ingredient modifiers **shipped**: dishes can carry a `modifiers` array
  (`{ id, name, options: [{label, priceDelta}] }`), independent of Mode A/B,
  shown in the detail overlay as a "Make it yours" button group, first
  option is the default a customer starts with. Owner tool has a 4th form
  section to add/edit modifier groups and their options. Seed data has two
  examples: "Spice level" on the burger, "Portion size" on the curry. Still
  open: no per-modifier availability rules (e.g. "Large" only for certain
  dishes) beyond just not adding the option — not needed yet.
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
- Veg/non-veg/Jain + allergen filters **shipped**. Dishes carry a `dietary`
  field (`"veg"` / `"non-veg"` / `"egg"`) and a `jainFriendly` boolean, both
  set in the owner form's 1st section. The customer menu view shows a
  filter row (All/Veg/Non-veg pills, a Jain-only toggle, and clickable
  "No <allergen>" chips built from whatever allergens actually exist in the
  menu) plus a small FSSAI-style green/brown/amber square dot on every dish
  card and in the detail overlay. Allergen filtering needed no new tagging —
  it's computed from each dish's existing per-ingredient `allergens` field,
  exactly as flagged below as "close to free." One deliberate simplification:
  for Mode A dishes, only ingredients *included by default* count toward a
  dish's allergens for filtering purposes — an optional extra a customer
  actively chooses to add doesn't disqualify the base dish, since adding it
  is an aware, opt-in choice (its own allergens are still shown at the
  ingredient level when customizing). Still open: no multi-language menu
  text — separate piece of work, not attempted here.
- No AI-assisted ingredient tagging — owner tool is fully manual right now.
  Highest-leverage next feature for onboarding speed: a vision-model
  suggests ingredient tags from the uploaded photo, owner just confirms/edits.
- Real per-ingredient photography (instead of the auto-rendered CSS discs —
  see section 3) is a real, available upgrade, not a rejected idea: swap in
  Unsplash/Pexels API results per ingredient name, cached once per unique
  name and reused everywhere. Needs an API key and a decision on whether the
  small per-request cost/rate-limit is worth it before building it — holding
  off until there's a reason to believe photorealism actually matters more
  than the current polish to real customers.
- No payments.

## 5. Feature ideas considered but not built (backlog, roughly prioritized)

- **AI-assisted onboarding** (see above) — biggest lever on the 2-minute
  onboarding target.
- **Reusable ingredient library per restaurant** — tag "cheddar cheese" once
  with price/allergens/icon, reuse across dishes.
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

All four originally-listed next steps are shipped:
1. ~~Resolve the naming question (section 0).~~ Done — Explodish is final.
2. ~~Fix the "looks unfinished" problem (section 3's five numbered fixes).~~
   Done — auto-fit grid, category filter pills, "how it works" strip, photo
   placeholder icon, and a light density pass on dish cards/stat boxes are
   all shipped.
3. ~~Add ingredient dependency rules and non-ingredient modifiers (spice
   level etc.) to the data model and owner tool.~~ Done — see section 4.
4. ~~Add veg/non-veg/Jain + allergen filters to the customer menu view.~~
   Done — see section 4.

Also since shipped, though not originally on this list: a full motion and
interaction pass (see section 3) — the app no longer feels static; an
auto-rendered ingredient visual system replacing flat photo placeholders;
a table QR entry point (the actual real-world "scan to order" flow); and
drag-and-drop as a second way to adjust ingredients, alongside tap.

**One thing flagged, not fixed:** adding the `qrcode` package surfaced 2
pre-existing moderate-severity `npm audit` findings in `qs` (a dependency
of Express itself, unrelated to anything built this round) — a
parsing/DoS issue, not something this app's own code triggers, but worth
an `npm audit fix` pass before a real pilot goes live.

What's left is the bigger, longer-horizon work from sections 4–6:
5. Swap JSON-file storage for a real database once ready to pilot with an
   actual restaurant (schema is already compatible).
6. Add restaurant accounts (`restaurantId` everywhere) once there's more than
   one restaurant using it.
7. Look at POS/KDS integration options for the target pilot restaurant's
   existing system.
8. Consider AI-assisted ingredient tagging (section 5) to hit the ~2-minute
   onboarding target — likely the single highest-leverage feature left.
9. Get this in front of one real restaurant. Everything else in this doc is
   a guess until there's one real before/after order-value number.