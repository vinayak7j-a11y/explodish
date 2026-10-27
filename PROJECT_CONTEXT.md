# Explodish: Project Context & Handoff (v3, late Oct 2026)

> **Read this first in any new chat.** It replaces every older copy of this file.
> It has the vision, the exact current state, how the code is organised, how
> changes have been delivered, what is verified and what is NOT, and the
> prioritised next steps. Where something is marked **UNVERIFIED**, it was built
> and tested on stand-in files in a sandbox, but the owner has not confirmed it
> on their real screen yet. Say so honestly; do not claim otherwise.

---

## 0. How to work with this person (important)

- The owner is on a **Mac**, **not experienced with the terminal**, and builds this
  locally in `~/Downloads/menu-app`. Give **one command at a time, with the folder
  stated**, and explain what each output means.
- Preferred delivery: **copy-paste terminal blocks using `cat > file << 'EOF'`**,
  and **content-matching Python patch scripts** that print `[OK]` / `[SKIP]` per
  change (details in section 7). Never send a unified diff or line-number edits.
- They get impatient when answers are long, when they are asked for the same thing
  twice, or when a request is met with a plan instead of work. **Do the work, show
  results, keep replies tight.** They said: "I already told you what to do."
- They want **big, visible progress** ("crazy" design, advanced animation, real
  food-like visuals) *and* a product that actually works for a restaurant.
- **Attachments of code files from their Desktop failed once** (only screenshots
  arrived). Screenshots work fine. For code, ask for `sed -n`/`grep`/`cat`
  output pasted in chat, in chunks of ~100 lines, or ask them to retry attaching.
- Your tool **cannot read their GitHub repo** (the repo page looks empty to the
  fetch tool, and raw file URLs are refused unless the user pastes them).
- **Sandbox resets happen.** Rebuild test rigs from section 8 instead of assuming
  old `/tmp` folders exist.
- Be straight about limits. Several times the "it's tested" claim only meant "tested
  against stand-ins built from the exact code the user pasted".

---

## 1. North star

**Explodish is a digital restaurant menu where every dish is clickable and opens up.**

- **Mode A, Exploded layers:** burgers, wraps, sandwiches, bowls. The dish is shown
  layer by layer. Customers add/remove/increase quantity per layer; the bill updates
  live; every price change is shown as a delta line ("+ ₹20 Extra cheese"), never
  a silent total.
- **Mode B, Ingredient view:** curries, soups, drinks. Full transparency about what
  is inside (names, allergens). No fake layering.
- **Owner onboarding speed is the real product:** target about 2 minutes per dish,
  no design or technical skill. (Templates, allergen suggestions, live preview,
  drag-to-reorder exist for this.)
- **Vegetarian-only product** (decision made this chat): no non-veg, no egg.
- **Look and feel goal:** the most delightful QR menu anyone has seen. Realistic,
  appetising exploded food; spring animation; game-style feedback (build level,
  Mega Stack, confetti); a bold, polished UI. Photoreal layer images are planned
  (see 9.3); until then layers are drawn by code.
- **Business reality:** a B2B SaaS tool, not a guaranteed consumer hit. The most
  valuable next step is **one real restaurant using it for a day or a week** and
  recording order value with vs without add-ons. Every further feature is a guess
  until then. Remind the owner of this when they drift.
- Differentiator vs Kabaq/PizzAR/QReal: customers break the dish apart and edit it
  live, with transparent pricing.

---

## 2. Current state (what exists and works, by tests in a sandbox)

### Platform / security
- Multi-tenant: every restaurant has an isolated menu, orders, QR codes. `/admin`
  login/register, `/r/:slug` public customer menu, `/` landing stub.
- Auth: bcryptjs + JWT in an httpOnly cookie (30 days). `requireAuth` also checks the
  restaurant exists and `active`.
- **Storage moved from JSON files to SQLite** (`better-sqlite3`, `data/explodish.db`,
  WAL). One-time automatic import of the old `data/*.json` when the DB is empty.
- **JWT secret** must come from env. Dev default only works when `NODE_ENV` is not
  `production`; production without a secret exits with FATAL. The real secret lives in
  `.env` (git-ignored). Run with `node --env-file=.env server.js`.
- Input hardening: body limit 100 kb (12 MB for `/api/dishes` after auth), dish and
  order sanitisers (whitelists, depth/size caps, image data-URL regex), in-memory rate
  limits, security headers, JSON-only error handler, CSV formula-injection guard.
- **Server-side price verification:** every order item is re-priced from the saved
  menu (see 4); a changed phone request cannot lower a price.
- Public restaurant endpoint no longer leaks the owner's email.

### Owner side (`/admin` → Owner tools)
- Dish form: photo (under 3 MB, JPG/PNG/GIF/WebP), name, category, Jain-friendly,
  base price, removal rule (price stays / lowers), mode A/B, layers/ingredients,
  modifier groups ("Make it yours"), publish/save/clear.
- **Templates dropdown** (veg burger, paneer wrap, sandwich, rice bowl, paneer curry,
  dal, soup, cold drink, veg biryani). **Keyword allergen suggestions** as you type a
  layer name (Dairy, Gluten, Nuts, Peanuts, Soy, Sesame, Mustard; egg/fish/shellfish
  removed). Owner edits always win.
- Layer rules: price per extra unit, max qty, included by default, can't be removed,
  "auto-remove if the customer removes X" dependency chips.
- Dish list: Edit, Delete (asks first), **Mark sold out / Mark available**.
- Table QR codes (`/api/qr`, printable grid, `?table=N`).
- **Vegetarian only enforced:** the dietary dropdown is hidden; server rejects dishes
  whose name/category/ingredient names contain meat/fish/egg words; old non-veg dishes
  are hidden from customers; a cleanup script existed and was run.
- **Pro layer (UNVERIFIED v2):** live preview of the exploded dish beside the form
  (wide screens), drag-to-reorder layers (SortableJS), numbered step badges, sticky
  Publish bar, frosted sticky tab bar.

### Customer side (`/r/:slug`)
- Menu grid, category pills, Jain filter, "No <allergen>" chips (veg/non-veg pills
  removed), dish cards with drawn exploded stack, table chip.
- Open dish: layer steppers (+/−), **drag a stack layer down to remove / drag a row
  up to add** (Pointer Events), modifiers, price-change feed, running total that
  rolls up/down, **build-level meter** (Classic → Tasty → Loaded → Mega Stack, badge,
  vibration tick), sold-out dishes show a disabled button.
- Cart: **saved across refresh** (localStorage, 12 h), double-tap guard on Place
  order, friendly errors ("just sold out", "menu changed").
- After ordering: **live status banner** (Order received → Being prepared → Ready →
  Served) polled every 8 s, with **Cancel order** while status is `new`.
- Menu **refreshes itself** every 45 s and on tab focus (sold-out changes appear).

### Kitchen (`/admin` → Kitchen & dashboard)
- Stats for **today only** (cancelled excluded): orders, revenue, add-on revenue,
  dishes. Most-added extras. Tickets with status buttons (Start preparing → Mark
  ready → Mark served), Cancel (confirm), 10 s auto-refresh.
- **Order history** card: Today / 7 days / 30 days / All time, average order,
  add-on revenue, share of orders with ≥1 add-on, cancelled count, **Download CSV**
  (`REPORT_TZ`, default Asia/Kolkata).
- Pro layer: ticket board with status-coloured edges, bigger buttons, new-order
  flash + two-note chime, floating mute switch.

### Visual layer
- **Game-style drawn layers** (SVG, by code) for buns (with sesame), patty, cheese,
  lettuce, tomato, onion, pickle, sauce, paneer, cream; unknown ingredients get a
  warm colour picked from the name. Same boxes as the old discs, so drag/tap/badge
  still work.
- **Real image override** (later): files in `public/ingredients/` named by ingredient
  (`cheese-slice.webp`) or by kind (`bun-top.webp`, `bun-bottom.webp`, `patty.webp`,
  `cheese.webp`, `leafy.webp`, `tomato.webp`, `onion.webp`, `pickle.webp`,
  `sauce.webp`, `paneer.webp`, `cream.webp`). **Off by default:** set
  `var LAYER_IMAGES_ON = true;` (near the end of `app.js`) once files exist.
- **Pro design v2 (UNVERIFIED on the real app):** new palette via the app's own CSS
  variables (espresso, ember, saffron, leaf), Fraunces + Inter fonts (self-hosted),
  aurora background and grain, glass cards, gold-sheen heading, an animated exploded
  burger in the header (desktop), Motion-powered card reveal and number count-up,
  ripple on buttons, scroll-progress bar, card tilt on hover, confetti at Mega Stack.
  Everything is scoped under `html.pro`; add **`?classic`** to any URL to see the old
  design. Remove the three/four lines marked `explodish pro layer` in
  `public/index.html` to switch it off permanently.

---

## 3. Stack and files

Deliberately boring, **no build step**.

```
menu-app/
  server.js          Express: all routes, auth, sanitisers, rate limits, price check
  db.js              SQLite storage layer + one-time legacy JSON import
  package.json       deps: express, qrcode, bcryptjs, jsonwebtoken, cookie-parser,
                     better-sqlite3, sortablejs, canvas-confetti, motion,
                     @fontsource-variable/fraunces, @fontsource-variable/inter
  .env               JWT_SECRET=...   (git-ignored; never paste in chat)
  data/              explodish.db (+ legacy *.json, backups)  (git-ignored)
  public/
    index.html       shell (not fully seen by Claude; pro tags inserted before </head> / </body>)
    app.js           ~2,500+ lines, ONE file, all three experiences
    styles.css       base design system (dark counter, brass, paper tickets)
    pro.css          pro design v2 layer
    pro.js           pro behaviour v2 layer (observer-based, scoped to html.pro)
    vendor/          Sortable.min.js, confetti.browser.js, motion.js
    fonts/           fraunces-latin-wght-normal.woff2, inter-latin-wght-normal.woff2
    ingredients/     (empty until real layer images exist)
```

- Run: `cd ~/Downloads/menu-app && node --env-file=.env server.js` → http://localhost:3000
- URLs: `/admin` (owner), `/r/<slug>` (customer), `/r/<slug>?table=7`.
- Dev demo account (only created when the DB is empty and not production):
  `owner@demo.test` / `demo12345`, slug `demo-kitchen`. A real test account exists:
  "Thakur ji ki rasoi" (slug shown in Owner tools → Table QR codes).
- Repo: https://github.com/vinayak7j-a11y/explodish (public). Recent commits:
  `843bd02` game-style layers + build level; `98f8f3b` veg wording cleanup;
  `671fa9c` pro layer v1. **Pro design v2 (batch 6) was delivered but NOT yet
  confirmed applied or committed.**
- `.gitignore` includes: `node_modules/ .env data/ data-backup/ .DS_Store add_*.py
  fix_owner_ui.py apply_explodish_updates.sh *.patch *.bak batch*.py make_*.py
  remove_*.js`. One-off patch scripts are therefore never committed.

---

## 4. Data model, pricing, API

### Tables (SQLite)
- `restaurants(id, slug UNIQUE, name, email UNIQUE, password_hash, active, created_at)`
- `dishes(id, restaurant_id, data JSON)`; `orders(id, restaurant_id, time, data JSON)`
  (documents with an indexed restaurant_id; shapes below).

### Dish document
```json
{ "id":"…", "restaurantId":"…", "name":"…", "mode":"A|B", "basePrice":189,
  "category":"Burgers", "image":null | "data:image/…;base64,…",
  "removalRefund":false, "dietary":"veg", "jainFriendly":false,
  "soldOut":false,
  "ingredients":[ {"id":"b1","name":"Sesame bun","included":true,"mandatory":true,
                   "unitPrice":0,"maxQty":1,"allergens":["Gluten"],"requires":["id…"]} ],
  "modifiers":[ {"id":"mod-spice","name":"Spice level",
                 "options":[{"label":"Regular","priceDelta":0}]} ] }
```
Mode B ingredients: `{name, allergens, swappable, swapOptions:[{label,price}]}`
(the owner form for B only edits name + allergens; swaps exist in the customer code
and server price check but have no owner UI).
`soldOut` is changed ONLY via `PATCH /api/dishes/:id/soldout`; normal edits keep it.

### Order document
```json
{ "id":"…", "restaurantId":"…", "time":"ISO", "status":"new|preparing|ready|done|cancelled",
  "table":"7"|null, "total":199, "upsell":20,
  "items":[ { "dishName":"…", "price":199, "mods":["+1 Cheese slice"],
              "deltas":[{"label":"+ Cheese","amount":20,"noChange":false}],
              "dishId":"…", "config":[{"id":"b1","qty":1}] , "modifierChoices":{"mod-spice":0} } ] }
```
The server recomputes `total` (sum of item prices), `upsell` (sum of positive deltas),
sets `status:'new'`, replaces `dishName` with the saved dish name.

### Pricing rules (client `computeTotal` / `ingredientContribution`, mirrored by server `priceItem`)
- `total = basePrice`
- Mode A, each ingredient: `baseline = included ? 1 : 0; diff = qty − baseline`;
  `diff ≥ 0` → `diff × unitPrice`; `diff < 0` → `removalRefund ? diff × unitPrice : 0`.
- Mode B: `swappable` ingredients add `swapOptions[swapChoice].price`.
- Modifiers: `options[modifierChoices[mod.id]].priceDelta` (index must be valid).
- Server rejects (409 `menu_changed`) when the dish is missing/changed, qty is not an
  integer, exceeds `maxQty`, removes a `mandatory` layer, or the price differs by >₹0.01.
- Sold-out dishes: 409 `{error, soldOut:[names]}`.

### API
Public: `GET /api/r/:slug` · `GET /api/r/:slug/dishes` (veg only) ·
`POST /api/r/:slug/orders` (rate-limited 60/10 min) ·
`GET /api/r/:slug/orders/:id/status` · `POST /api/r/:slug/orders/:id/cancel` (only while `new`) ·
`GET /api/qr?text=&size=`
Auth: `POST /api/auth/register|login|logout`, `GET /api/auth/me`
(login 10/15 min, register 10/h, per IP).
Admin (cookie, always scoped to the logged-in restaurant):
`GET|POST /api/dishes` · `PUT|DELETE /api/dishes/:id` ·
`PATCH /api/dishes/:id/soldout` · `GET /api/orders` ·
`PATCH /api/orders/:id/status` · `GET /api/orders.csv?from=&to=`

Env: `JWT_SECRET` (required in production), `PORT`, `NODE_ENV`, `TRUST_PROXY`
(set to 1 behind a proxy so rate limits are per customer), `REPORT_TZ`, `DB_FILE`.

---

## 5. Frontend map (`public/app.js`): names, not line numbers (lines have shifted)

Globals: `DISHES, ORDERS, CART, ownerDraft, currentDetail, activeTab, activeCategory,
activeDietary (dead), CURRENT_TABLE, PUBLIC_SLUG, LAYER_IMAGES_ON, MISSING_IMG`.

- Rendering: `renderAdmin()` redraws the **whole admin shell** (masthead + tabs +
  panel) on every structural change, so anything injected into it must be re-added
  by an observer (pro.js does this). `renderCustomerPage()`, `ownerView()`,
  `kitchenView()` → `kitchenViewBase()` + `historyCard()`.
- Stack drawing: `INGREDIENT_VISUALS` (keywords → colours; note "mint chutney"
  matches `leafy` because `leafy` comes before `sauce`), `matchIngredientVisual`,
  `renderExplodedStack(dish, config, opts)` → `.stack-wrap` of `.stack-disc` boxes
  (`--si` index, `data-ing`, `.draggable-disc`), each containing `layerArt()` →
  `layerShape()` SVG; `layerImgHtml/layerImgOk/layerImgFail` handle real images.
- Open dish: `openDetail`, `renderDetailOverlay` (rebuilds the overlay every change),
  `adjustQty`, `logQtyChange`, `logDelta`, `renderDeltaFeed`, `attachDragHandlers`,
  `cascadeDependents`, `addCurrentToCart`, `buildLevelHtml/updateBuildLevel/
  animateTotal/hapticTick`.
- Customer extras (end of file): `cartSlug, loadCart, saveCart, myOrders, trackMyOrder,
  showOrderBanner, pollMyOrders, cancelMyOrder, refreshMenu, startCustomerBackground`.
- Owner: `blankDraft`, `EXPLODISH_TEMPLATES`, `ALLERGEN_RULES/guessAllergens`,
  `attachOwnerHandlers`, `saveDraft`, `renderIngredientRowsA/B`, `renderModifierGroups`.
- Kitchen: `statusControls`, `ORDER_FLOW`, `startKitchenPoll`, `attachKitchenHandlers`,
  `wireCancelButtons`, `wireHistory`, `historyRange`, `apiSetOrderStatus`.
- API helpers: `apiGetPublicDishes, apiCreatePublicOrder, apiMe, apiLogin, apiDeleteDish,
  apiSetSoldOut, apiSetOrderStatus` …

Known CSS classes/ids (from code Claude has seen): `.shell .masthead .mark .tag
.table-chip .tab .tab.active .section-card .sc-desc .field .btn (.secondary .small
.btn-add .file-btn) .mode-btn .ingredient-row .ing-name .stepper .layer-item
.menu-grid .dish-card .dc-media .dc-render .dc-pill .dc-body .dc-name .dc-cat .dc-cta
.cat-pill .how-strip .ticket .ticket-card .ticket-head .stat-grid .stat-box .sv .sl
.top-ing-row .overlay .detail .detail-body .detail-footer .detail-stack-stage
.running-total .rt-value .delta-feed .modifier-opt #cartFab #detailOverlay #runningTotal
#dishName #ingredientList #saveDishBtn #placeOrderBtn #addToCartBtn #orderBanner`.
CSS variables: `--bg --bg-glow --panel --panel-line --paper --paper-2 --paper-line
--white --ink --ink-soft --ink-inverse --ink-inverse-soft --brass --brass-bright
--brass-deep --rust --rust-deep --moss --moss-deep --font-display --font-body
--font-num --lift-1/2/3`. **`html.pro` in pro.css overrides these**, which re-themes
screens Claude has never seen.

**Pro layer mechanics (`pro.js`):** adds `html.pro`; a MutationObserver (disconnected
while it edits, reconnected after) re-tags the tab bar (`.pro-tabbar`), action bar
(`.pro-actionbar`), wraps tickets in `.pro-ticket-grid`, adds step badges, hero burger,
live preview `aside.pro-preview` (grid `.pro-owner-grid`, ≥1180 px), Sortable handles,
reveal/count-up via `Motion`, confetti on `.bl-badge.pop`, kitchen chime/flash, tilt,
ripple, scroll bar. Reveal animates only when the screen/tab changes or a filter pill is
clicked, and removes Motion's inline `opacity/transform` afterwards (otherwise hover
effects break).

---

## 6. Build history (in order; all delivered as paste-in patches)

1. Naming → Explodish; section-3-era UI fixes; ingredient dependency rules; modifiers;
   veg/Jain/allergen filters; motion pass; CSS auto-rendered ingredient discs; table
   QR; drag-and-drop; multi-tenant accounts; owner-tools UI visibility fixes.
2. Chat 2 (this handoff's chat): JWT secret guard + `.env`; templates (`add_templates.py`);
   allergen suggestions (`add_allergen_tagging.py`); GitHub push hygiene; **SQLite +
   security hardening (`db.js`, new `server.js`)**; kitchen order status (`add_order_status.py`);
   sold-out toggle (`add_soldout.py`); veg-only (`make_veg_only.py`, `remove_nonveg_dishes.js`);
   **batch 1** (order validation, saved cart, double-tap guard, order banner, fresh menu,
   delete confirm, today stats); **batch 1b** (server price check); **batch 3** (cancel,
   order history, CSV); **batch 2** (game-style drawn layers); **batch 2b** (build
   level, count-up total, haptic, `LAYER_IMAGES_ON`); **batch 4** (veg wording cleanup,
   hide dietary dropdown); **batch 5** (pro layer v1: libs + index.html tags); **batch 6**
   (pro v2: Motion, fonts, new palette, hero; `pro.css`/`pro.js` overwritten).
3. Owner guide (HTML artifact, updated through batch 3):
   https://claude.ai/artifact/W4XjSwoDWjuXZ8KRAo8oca (does not yet mention game
   layers, build level or the pro design).

---

## 7. Delivery conventions (keep using these)

- **Patch scripts:** `python3 batchN.py`, run from `menu-app`. Helper:
  `patch(path, anchor, new, label, marker)`: skip if `marker` already in file; skip if
  the anchor does not occur exactly once; else replace once and print `[OK]`. Appended
  blocks are guarded by a function-name check. Always **idempotent**; a `[SKIP]` with
  "anchor found 0 times" means nothing changed, so ask for the output.
- **New files:** `cat > path << 'EOF' … EOF`. **Overwriting** is fine for `pro.css`,
  `pro.js`, `db.js`, `server.js` (git has history).
- Tests before sending: build stand-ins from the code the user actually pasted, apply
  the scripts in order, `node --check`, run behaviour tests (curl against a stand-in
  server; headless Chromium for UI), render screenshots and *look at them*.
- Standard checks for the user: hard refresh (**Cmd+Shift+R**), `kill $(lsof -ti :3000)`
  when `EADDRINUSE`, start with `node --env-file=.env server.js`. Then
  `git add -A; git status --short` (must show only code files; never `.env`, `data/`),
  `git commit -m "…"; git push`.
- Rollback for the design layer: `?classic` or delete the `explodish pro layer` lines.
  Rollback for code: `git checkout public/app.js public/styles.css` (check `git status` first).
- Common user slips: running a command outside the folder; pasting a command with the
  placeholder `<PID>`; leaving the old server running; forgetting a hard refresh;
  `npm run dev` skips `.env`.

---

## 8. Rebuilding the test rig (after a sandbox reset)

- Browser: Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; puppeteer
  from `/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer`
  with `headless:'new'` and `args:['--no-sandbox']`. Serve test pages over **http**
  (`python3 -m http.server`), because `file://` breaks absolute `/fonts/...` URLs.
- Start servers with `&` and stop them **by PID** (`SRV=$!; kill $SRV`). `pkill -f`
  can match the shell's own command line and kill the tool call.
- `npm install` works in the sandbox (registry allowed). `better-sqlite3` installs fine.
- Rate limits will block bulk API tests; use a test copy with larger limits.
- Mock pages reproduce app markup from the pasted code; they do **not** include the
  user's real `styles.css`, so spacing/contrast on the real app can differ.

---

## 9. Next steps (priority order)

### 9.1 Confirm pro v2 on the real screen (first thing)
Ask for phone-sized screenshots: Owner tools, Kitchen, customer menu, an open dish,
cart, login. Check: contrast on every screen (the whole app was re-coloured through
variables), header hero position, sticky tab bar, preview layout at ~1180 px+, fonts
loaded, no console errors. Fix from screenshots. **Never restyle blind.**

### 9.2 Finish the "crazy UI/UX" the owner asked for
- **Open-dish bottom sheet:** slides up from the card (shared-element feel), swipe down
  to close, burger explodes apart on open, sticky glass footer; needs the real
  `.overlay/.detail` CSS (ask for `sed -n` of those rules).
- **Skeleton/loading states**, a bold **login/register screen**, **cart as a sheet**,
  an order **progress track** (received → preparing → ready) instead of plain text.
- Hero header on the customer page with the restaurant name and a CTA; sticky category
  bar; smoother page transitions (Motion `animate`, `inView`).
- More signature moments: tap-to-explode on cards, layer "drop" physics when adding,
  Mega Stack celebration polish, optional sound (off by default; kitchen chime exists).

### 9.3 Photoreal layers (owner-led, outside Claude's tools)
Claude cannot generate or edit photos. Plan: owner generates ONE consistent set of
transparent side-view layer images with an image tool of their choice (check its
commercial terms), exports WebP ~800-1000 px wide (<150 KB), names them as in section
2, drops them in `public/ingredients/`, and sets `LAYER_IMAGES_ON = true`. Test first
with 3 layers (top bun, clearly vegetarian patty, bottom bun). Shot-list/prompt
sheet: same style sentence for every ingredient, only the food name changes; avoid
anything that looks like meat or egg; no baked-in shadows (the app draws its own).
Photoreal real-time 3D (Three.js) was considered and deferred (heavy, hard to keep
consistent). Never use images found via search; licences unclear.

### 9.4 Pilot (most valuable)
Free tunnel (Cloudflare Tunnel or ngrok; check current free limits) so a restaurant can
scan real QR codes against the owner's laptop for a day. Set up 5-8 real dishes. One-page
visit plan + what to record (orders, average order, **share of orders with ≥1 add-on**
from the History card). After a pilot: hosting with a persistent disk for `data/`
(JSON/SQLite files are wiped on many free hosts), a real `JWT_SECRET` set on the host,
`NODE_ENV=production`, `TRUST_PROXY=1`.

### 9.5 Product gaps (build only when a restaurant asks)
Billing/pricing page; password reset; staff accounts; POS/KDS integration (Petpooja,
Posist); ingredient-level "86 this"; GST handling; combo/thali pricing; per-restaurant
switch for game elements; multi-outlet; offline handling; an owner-side swap editor for
Mode B; real database (Postgres) only if scale demands.

### 9.6 Cleanup
- Dead non-veg code in `app.js` (`activeDietary`, `dot-nonveg/egg` branches in the
  dietary dot, `renderModeBIcon` mentions) and in `PROJECT_CONTEXT`/README.
- `app.js` is one very large file; consider splitting **after** the pilot.
- Update the owner guide artifact for game layers, build level, pro design.
- Self-hosted fonts and libs are committed under `public/`; keep `package.json` in sync.
- Check the licences once (Motion MIT, SortableJS MIT, canvas-confetti ISC, Fraunces/Inter OFL).

---

## 10. Known risks / UNVERIFIED list

- Batches 1, 1b, 3, 2, 2b, 4 were each tested on stand-ins; the owner reported
  `[OK]` lines and pushed commits, but **never confirmed the browser behaviour**
  (cart persistence, banner, cancel, history/CSV, price-protection message, drawn
  layers on the real page, build level).
- The owner's own screenshots confirmed pro v1 in Owner tools (preview, step badges,
  sticky bar); they showed content peeking above the tab bar and an odd gap by the
  Jain checkbox (v2 addresses the first).
- Pro v2 was only seen in a mock. The hero burger was mis-sized once and fixed;
  confirm on the real header.
- Layer spacing, stage height (200 px), meter colours, and card scaling were set
  without seeing the real CSS for those parts.
- Cheap-phone performance of aurora/blur/animations is untested.
- `index.html` has never been shown to Claude; the installers assume one `</head>`
  and one `</body>` and print `[SKIP]` otherwise.
- The server rate limiter is in memory (resets on restart; per IP).
- `data-backup/` and `data/explodish.db.backup-*` exist locally; they are git-ignored.

---

## 11. Suggested first message in the new chat

> Read PROJECT_CONTEXT.md (attached/pasted). We are continuing Explodish. Start with 9.1:
> I'll send phone-sized screenshots of every screen after applying pro v2. Then do 9.2
> (open-dish bottom sheet, skeletons, login screen, cart sheet, order progress), and
> after that prepare the pilot (9.4). Keep replies short, send paste-in `EOF` blocks,
> test in a real browser before sending, and be honest about what is unverified.
