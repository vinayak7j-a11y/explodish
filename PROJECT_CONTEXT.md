# Explodish: Project Context & Handoff (v4, 31 Oct 2026)

> **Read this first in any new chat.** It replaces every older copy (v3 and earlier).
> It holds the vision and north star, every decision made, the exact current state,
> how the code is organised, what is verified and what is NOT, how changes are
> delivered, and the prioritised next steps. Where something says **UNVERIFIED**, it
> passed tests in a sandbox but the owner has not confirmed it on their own screen.
> Say so honestly; never claim otherwise.

---

## 0. First five minutes of the new chat (do these before anything else)

1. Read this file fully. Read `ROADMAP` in section 9. Do not restart discussions
   that section 2 already settled.
2. Ask the owner to run, inside `~/Downloads/menu-app`:
   `git status -sb` and `git log --oneline -10` and `npm test`.
   **Why:** the last three patches (swaps/table/limits, live order updates, kitchen
   step 1.2) were applied by the owner but their commit status is unconfirmed. The
   last commit confirmed on GitHub is `dcd0330` (favicon). Expected after all patches:
   `npm test` prints `PASS: 24 passed, 0 failed` and then `PASS: 16 passed, 0 failed`
   (the second is the Telegram test).
3. If anything is uncommitted, give the commit commands in section 10.4 first.
4. Then continue with **step 1.4 (customer progress track)**, section 9. Step 1.3
   (Telegram) is DELIVERED but never tried against real Telegram: ask whether the owner
   created the bot (steps in section 3.6) and connected it, and fix whatever they hit.
5. Never work "blind": you can read their code yourself (see 8.1) and test in a
   real browser in your sandbox before sending anything.

---

## 1. How to work with this person (important)

- Owner is on a **Mac**, builds locally in `~/Downloads/menu-app`, shell is **zsh**.
  **Not experienced with the terminal.** Give commands with the folder stated and say
  what the output should look like. **Do not put `# comments` inside command blocks**:
  zsh treats them as arguments and prints errors (this happened).
- **Delivery format they asked for:** copy-pasteable terminal blocks, either
  `cat > file << 'EOF'` for new files or a **content-matching Python patch script**
  (`python3 - << 'EOF' ... EOF`) that prints `[OK]` / `[SKIP]` / `[FAIL]` per change.
  Never send unified diffs or line-number edits. Do not send a zip file each time.
- **Keep replies short and concrete.** Do the work, show results, say plainly what is
  UNVERIFIED. They get impatient with plans instead of work and with repeated asks.
- **Test in a real browser before sending** (they asked for this explicitly). Say
  honestly what you could not test.
- They want **big visible progress** (polished, creative, advanced UI/animation) *and*
  a product that actually works for a restaurant.
- Questions they have not answered yet are in section 11. Ask at most one per reply.
- They paste terminal output back. Read it carefully: they sometimes run an
  already-committed block twice ("nothing to commit" is harmless) or paste Python
  that includes `EOF` lines from earlier blocks.

---

## 2. North star and decisions (settled unless the owner changes them)

### 2.1 Product
**Explodish is a digital restaurant menu where every dish opens up.** Customers scan a
table QR code, see the menu, tap a dish and watch it "explode" into layers, add or
remove ingredients, see the price change live, and order. The order reaches the
kitchen screen.

- **Mode A (Exploded layers):** burgers, wraps, sandwiches, bowls. Layer-by-layer,
  live price with a delta feed, drag a layer down to remove / up to add, build level
  (Classic → Tasty → Loaded → Mega Stack) and confetti.
- **Mode B (Ingredient view):** curries, soups, drinks. Ingredient names, allergens,
  optional **swaps** (e.g. Paneer / Tofu +40).
- **Vegetarian only.** No non-veg, no egg. Server rejects non-veg names.
- Business reality: it is B2B SaaS. The most valuable proof is one real restaurant
  using it and a number: **share of orders with at least one add-on** and **average
  order value**. Remind the owner when they drift into features before that.

### 2.2 North-star funnel: simple for the restaurant, "done for you" at first
The owner does at most three things: **sign up, pick a plan, upload their menu.**
Everything else is done by the founder at first, then automated.

```
Reach -> Demo/hook -> Signup+plan+menu upload -> (founder builds) -> PRIVATE PREVIEW
      -> owner likes it -> pays -> LIVE on their table QR codes -> weekly proof -> renew
```

Decisions:
- **No paid AI/API for the first 10 customers.** Everything must work without AI.
  Later AI only has to produce plain text in the paste-import format ("Name - price",
  category headings), so nothing gets rebuilt.
- **Concierge digitisation (manual) for early customers.** The owner uploads a photo
  or PDF of the menu. The founder extracts the text with free tools (Mac Live Text in
  Preview, Google Lens / Drive OCR, free tiers of Gemini/ChatGPT/Claude as a human
  helper, optionally Tesseract.js later; check free-tier limits and terms), pastes it
  into a **bulk-paste import** that parses `Name - price` + category headings and
  matches templates by keyword, then reviews and publishes.
- **Preview before payment (decided; preview beats a plain free trial).** The owner
  gets a private link/QR showing **their own top 5-8 dishes** for about 7 days. It is
  marked "Preview", ordering is disabled or limited to TEST orders that ring the
  owner's own kitchen screen. Only after they like it do they pay.
- **Payment at first:** manual UPI, founder flips the restaurant to live and sets
  `paid_until`. Razorpay AutoPay only after about 10 customers (check current terms).
- **Statuses:** `waiting -> building -> preview -> live -> expired`. `restaurants.active`
  and `requireAuth` already exist and are the base for this.
- **Start with the top 5-8 dishes** (burgers, wraps, sandwiches) and list the rest as
  plain/ingredient items. Charge after the menu is live. Promise "preview within 24 h".
- **Proposed but NOT confirmed by the owner:** one monthly plan plus a discounted
  yearly plan (no tiers yet); a money-back guarantee in the first week; when a
  subscription lapses the menu falls back to a **plain menu (no exploding)** with a
  reactivate banner for the owner (not a dead QR code).
- **Reach is the hard part.** First customers come from outreach: find burger/cafe/
  wrap shops on Google Maps, Zomato, Instagram; message "Send me your menu photo and in
  24 h you get a link to your own menu where burgers open up. Free." with a link to a
  no-signup demo menu. First 2-3 restaurants are for **proof** (before/after order
  value, add-on share) in exchange for a heavy discount and permission to share numbers.
  Do not promise any particular percentage; it must come from the pilot.
- A **landing page with a live demo menu (no signup)** and a **super-admin /ops page**
  for the founder are part of the plan.
- **Hosting comes before strangers can sign up.** The laptop tunnel in the 9.4 pilot
  is fine for one restaurant for a day. Real hosting needs a persistent disk, HTTPS, a
  real `JWT_SECRET`, `NODE_ENV=production`, `TRUST_PROXY=1`, nightly backups. Look up
  current prices when the time comes.

### 2.3 Exploding experience
- Owners cannot make 3D models or photos, so whatever is chosen must work from a
  **shared ingredient library** (about 24 consistent veg layers), not per-dish assets.
- Plan: a **bake-off page** (2D sprites + Motion springs vs a simple Three.js version)
  tested on a cheap Android phone, then pick one. Recommendation was a **stylised, not
  photoreal**, one-style illustrated set. Free 3D models (e.g. Kenney Food Kit CC0,
  Sketchfab) are possible but **licences were not checked**: check before using any.
- Low-end phone fallback, reduced-motion support, owner switch for game elements.
- **Photos (decided and built):** a dish photo is shown on the **menu card only**. In the
  open dish the exploding view always shows, with a **See photo / Show layers** toggle.

### 2.4 UI direction
- Owner dislikes the current frontend: wants more user-friendly, creative, polished,
  advanced UI/animation, better colours and design. Use design tokens, bottom-sheet
  dish, skeleton loaders, cart sheet, progress track, customer hero header.
- **Open:** dark vs light direction. Plan: two mock-ups using the real menu, 5-second
  test on 3 people. Dark makes food photos pop; light often feels more appetising in
  bright restaurants (opinion, untested).
- Order of work: lock funnel, then exploding prototype, then redesign around both.
  Redesign should come **after** a real restaurant has used the current design.

### 2.5 Orders must never be lost (Phase 1 principle)
Kitchen alerts must be reliable (live push, repeating sound until accepted, backup alert
to the owner's phone, offline bar, failure-proof order submission).

---

## 3. Current state (what exists)

### 3.1 Platform / security
- Multi-tenant: `/admin` login/register, `/r/:slug` customer menu, `/` landing stub.
- Auth: bcryptjs + JWT in an httpOnly cookie (30 days). `requireAuth` also checks the
  restaurant exists and `active`.
- **SQLite** (`better-sqlite3`, `data/explodish.db`, WAL). `DB_FILE` env overrides the path.
- JWT secret from `.env` (git-ignored). Run with `node --env-file=.env server.js`.
- Hardening: body limit 100 kb (12 MB for `/api/dishes`), dish/order sanitisers, in-memory
  rate limits, security headers, JSON-only errors, CSV formula guard.
- **Server re-prices every order item** from the saved menu; tampered prices -> 409.
- **Tenant isolation verified** (see 6): another restaurant cannot read or change your
  orders/dishes/CSV. Hostile text in dish name, category or table link is shown as text
  and does not run script (checked on customer, owner and kitchen pages).
- **Table value validation (new):** server and page accept only 1-8 letters, digits or
  dashes; anything else is stored as "no table" and the order still goes through.
- **Order rate limits (changed):** orders 200 per 10 min per IP per restaurant path,
  cancels 60 per 10 min. Behind a tunnel or proxy every customer can look like one IP
  unless `TRUST_PROXY=1` is set.

### 3.2 Owner side (`/admin` -> Owner tools)
- Dish form: photo, name, category, Jain-friendly, base price, removal rule, mode A/B,
  layers/ingredients, modifier groups, publish/save/clear. Templates dropdown, keyword
  allergen suggestions, dependency chips, sold-out toggle, Edit, Delete.
- **Mode B swaps (new):** each ingredient row has "Customer can swap this"; ticking it
  shows an options box: `Paneer, Tofu +40, Mushroom +30` (first = default). Saving with
  fewer than two options is refused with a message. Editing pre-fills the box.
- Table QR codes (`/api/qr`, printable grid via "Print all"). **QR links use the address
  you opened the admin from** (`window.location.origin`): opening admin at `localhost`
  makes QR codes unreachable from a phone. For phone tests open admin via the Mac's wifi
  IP (`ipconfig getifaddr en0`) or a tunnel. A `PUBLIC_URL` setting is planned.
- Live preview of the exploded dish (wide screens only), drag-to-reorder layers
  (SortableJS, **not verified by hand**).

### 3.3 Customer side (`/r/:slug`)
- Menu grid, category pills, Jain filter, "No <allergen>" chips, table chip.
- Open dish: steppers, drag layers, modifiers, delta feed, running total, build level.
  **Dish with a photo:** menu card shows the photo; open dish shows layers with a
  See photo toggle.
- **Cart (new):** each item has **Remove** and **+ Another**, a Total row, then Place
  order. Cart saved across refresh (12 h). Still a small popover over the menu (a full
  cart sheet is planned in the redesign).
- After ordering: status banner polled every 8 s with Cancel while status is `new`.
- Menu refreshes every 45 s and on tab focus.

### 3.4 Kitchen (`/admin` -> Kitchen & dashboard)
- **Live push (new, step 1.1):** `GET /api/orders/stream` (Server-Sent Events). Server
  calls `notifyOrders(restaurantId, kind)` on new order, status change and cancel. Client
  `EventSource` refreshes in about 0.1 s. Backup polling: every 5 s when the stream is
  down, every 20 s when up. Red **"Connection lost"** bar (`#connBar`) when offline or
  after 25 s of failed refreshes; clears on recovery. Auto-reconnect after a server
  restart is verified. Heartbeat ping every 25 s.
- **Live connection starts at login on any tab** (`renderAdmin` calls `startKitchenPoll`).
- **Alerts (step 1.2, delivered; owner confirmation pending):** while any order has
  status `new`, the sound repeats every 6 s (`window.EXPLODISH_NEW` > 0) until someone
  taps **Start preparing** (that tap is the "accept"). New order on the Owner tab rings
  at once and shows a red count badge (`.kbadge`) on the Kitchen tab. **Sound on/off**
  and **Test alert** buttons in `.pro-sound-bar` (Test alert plays two rings even when
  muted). Browsers only allow sound after a tap on the page.
- **Telegram backup alert (step 1.3, delivered; tested only against a FAKE Telegram):**
  see 3.6.
- **Tickets (new):** first card is **Live orders**; ordered new first, then preparing,
  then ready, each oldest first. Big `TABLE A1` label, "Order id · time · N min ago".
  Changes are bold capitals: red `mod-remove` (starts with No/Without/Skip/−/-),
  green `mod-add` (starts with +), brown `mod-other`. Cancel button readable.
  Grouping tickets by table was NOT built (oldest-first was judged more important).
- Stats (today only), most-added extras, **Order history** (Today / 7 days / 30 days / All
  time, average order, add-on revenue, add-on share, cancelled, **CSV**). **Numbers match
  raw orders (verified).**

### 3.6 Telegram phone alerts (optional, off until a bot token is set)
- New file `telegram.js`. Switched on only when `TELEGRAM_BOT_TOKEN` is in `.env`. Free.
- **Owner setup (once, by the founder):** in Telegram open **@BotFather**, send `/newbot`, pick a
  name and a username ending in `bot`, copy the token. Add to `.env`:
  `TELEGRAM_BOT_TOKEN=<token>` and optionally `PUBLIC_URL=https://<public address>` (used in the
  message text). Restart the server. The bot username is fetched automatically.
  **Never paste the token in chat or commit it** (`.env` is git-ignored).
- **Per restaurant:** Kitchen tab -> **Phone alerts** card -> **Connect Telegram** opens
  `https://t.me/<bot>?start=<one-time token>`; pressing Start links that chat (the server learns
  this by long-polling `getUpdates`, so no public address is needed). Links are single-use and
  expire after 15 min. Card buttons: Send test message, Disconnect. The card is hidden when the
  server has no bot token.
- **Alerts:** every new order sends "New order - Table N, items with changes, total". If it is
  still `new` after `TELEGRAM_REMINDER_MS` (default 2 min) a "Not accepted yet" reminder is sent,
  up to 3 times; accepted orders get none. Pending reminders are rebuilt on server start.
  Telegram failures never block ordering.
- DB table `telegram_links(restaurant_id, chat_id, linked_at)`; one chat per restaurant (a group
  chat also works if the link is opened there). Only one server may poll a bot at a time
  (a second one gets a 409 from Telegram).
- Tested with `test/telegram.js` against a fake Telegram server (16 checks) and a browser test of
  the card. **Never tested with the real Telegram** (the sandbox has no internet).

### 3.5 Visual layer
- Drawn SVG game-style layers; optional real images in `public/ingredients/` named by
  ingredient/kind, **off by default** (`var LAYER_IMAGES_ON = true;` near the end of
  `app.js`). Pro design v2 (`html.pro`, `?classic` shows the old look).
- Favicon added (inline SVG, matches the layers logo).

---

## 4. Stack and files

No build step. Express + SQLite + vanilla JS.

```
menu-app/
  server.js        routes, auth, sanitisers, rate limits, price check, SSE hub
  telegram.js      optional Telegram phone alerts (bot token in .env)
  db.js            SQLite layer + one-time legacy JSON import
  package.json     "test": "node test/smoke.js && node test/telegram.js"
  test/smoke.js    24-check smoke test (own server on random port, throwaway DB)
  test/telegram.js 16-check Telegram test against a fake Telegram server
  .env             JWT_SECRET=...  (git-ignored, never paste in chat)
  data/            explodish.db  (git-ignored)
  public/
    index.html     shell + favicon + pro tags. Assets use ABSOLUTE /styles.css, /app.js
    app.js         one big file (about 2,000+ lines), all three experiences
    styles.css     base design + later patches (cart, photo toggle, phone layout, tickets)
    pro.css/pro.js pro design layer + kitchen chime/flash/sound bar
    vendor/ fonts/ ingredients/(empty)
```

- Run: `cd ~/Downloads/menu-app && node --env-file=.env server.js` -> http://localhost:3000
- URLs: `/admin`, `/r/<slug>`, `/r/<slug>?table=7`. Dev demo account (DB empty, non-prod):
  `owner@demo.test` / `demo12345`, slug `demo-kitchen`. Owner's real test restaurant:
  **Thakur ji ki rasoi**, slug `thakur-ji-ki-rasoi` (had no dishes published when checked).
- Repo: https://github.com/vinayak7j-a11y/explodish (public). `.gitignore` covers
  `node_modules/ .env data/ data-backup/ .DS_Store add_*.py ... *.bak batch*.py make_*.py`.
- `EADDRINUSE` on start only means the server is already running: restart with
  `kill $(lsof -ti :3000) 2>/dev/null; node --env-file=.env server.js`
  (`kill: not enough arguments` just means nothing was running).

---

## 5. Data model, pricing, API

### Tables
`restaurants(id, slug UNIQUE, name, email UNIQUE, password_hash, active, created_at)`,
`dishes(id, restaurant_id, data JSON)`, `orders(id, restaurant_id, time, data JSON)`, `telegram_links(restaurant_id PK, chat_id, linked_at)`.

### Dish document
```json
{ "id":"…", "name":"…", "mode":"A|B", "basePrice":149, "category":"Burgers",
  "image":null, "removalRefund":false, "dietary":"veg", "jainFriendly":false, "soldOut":false,
  "ingredients":[ {"id":"b4","name":"Cheese slice","included":true,"mandatory":false,
                   "unitPrice":20,"maxQty":3,"allergens":["Dairy"],"requires":[]} ],
  "modifiers":[ {"id":"mod-spice","name":"Spice","options":[{"label":"Regular","priceDelta":0},
                                                           {"label":"Spicy","priceDelta":30}]} ] }
```
Mode B ingredient: `{id, name, allergens, swappable, swapOptions:[{label, price}]}`.
`soldOut` changes only via `PATCH /api/dishes/:id/soldout`.

### Order document and request
Stored: `{id, time, status:new|preparing|ready|done|cancelled, table|null, total, upsell,
items:[{dishName, price, mods[], deltas[{label,amount,noChange}], dishId, config, modifierChoices}]}`.
Mode A `config` = `[{id, qty}]`. Mode B `config` = `[{index, swapChoice}]`.
Server recomputes total (sum of item prices) and upsell (sum of positive deltas).

### Pricing
`total = basePrice`; mode A each ingredient `diff = qty − (included?1:0)`: `diff ≥ 0` ->
`diff × unitPrice`; `diff < 0` -> `removalRefund ? diff × unitPrice : 0`; mode B swaps add
`swapOptions[choice].price`; modifiers add `priceDelta`. Server 409 `menu_changed` on any
mismatch, qty over `maxQty`, removed mandatory layer; sold-out dishes -> 409 `{soldOut:[…]}`.

### API
Public: `GET /api/r/:slug`, `GET /api/r/:slug/dishes`, `POST /api/r/:slug/orders`
(200/10 min), `GET /api/r/:slug/orders/:id/status`, `POST /api/r/:slug/orders/:id/cancel`
(only while `new`, 60/10 min), `GET /api/qr`.
Auth: `POST /api/auth/register|login|logout`, `GET /api/auth/me` (a 401 here before login is
normal).
Admin: `GET|POST /api/dishes`, `PUT|DELETE /api/dishes/:id`, `PATCH /api/dishes/:id/soldout`,
`GET /api/orders`, **`GET /api/orders/stream` (SSE)**, `PATCH /api/orders/:id/status`,
`GET /api/orders.csv`.
Telegram (admin): `GET /api/telegram/status`, `POST /api/telegram/link`, `POST /api/telegram/test`,
`DELETE /api/telegram/link`.
Env: `JWT_SECRET`, `PORT`, `NODE_ENV`, `TRUST_PROXY`, `REPORT_TZ`, `DB_FILE`, `PUBLIC_URL`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (optional), `TELEGRAM_REMINDER_MS` (default 120000),
`TELEGRAM_API_BASE` (tests only).

---

## 6. What has been done in this chat (all pushed unless noted)

| Commit | What |
|---|---|
| `5bb2baa` | **P0 fix:** `index.html` used relative `styles.css`/`app.js`, so `/r/<slug>` loaded no CSS/JS. Now absolute. |
| `68889a5` + tag `v0-baseline` | `npm test` smoke test; rollback tag |
| `fa548cc` | Cart: Remove, + Another, Total |
| `bfa7f68` | Photo: layers always shown, See photo toggle, card keeps thumbnail |
| `ae7f098` | Phone layout: sheet footer padding, owner page no sideways scroll (was 525 px on a 390 px phone), Live orders first, sound pill spacing, readable Cancel button |
| `dcd0330` | Favicon (the only 404 on the customer page was `/favicon.ico`) |
| applied locally, **commit unconfirmed** | Swaps in owner form, table validation, higher limits (21 tests); live order updates (24 tests); kitchen step 1.2 (alert/tickets/badge); Telegram alerts step 1.3 (new `telegram.js`, `test/telegram.js`; `npm test` = 24 + 16) |

Feature audit (browser, desktop + phone viewport) **passed**: menu, filters, pricing,
limits, modifiers, swaps pricing, cart reload, place order, status banner, owner login/
CRUD/sold-out/photo/QR, kitchen stats/tickets/status/history/CSV, tenant isolation, XSS
text, cancel rules, Mega Stack + confetti, Print all.

---

## 7. Verified vs UNVERIFIED, and known issues

**Owner-confirmed on their machine:** `npm test` passes (18, then 21, then 24 after patches);
customer page loads styled with Table chip; QR codes generate; admin shows Table QR grid.
**Everything else is verified only in the assistant's sandbox Chromium** (desktop + 390 px
emulation, mostly DOM-driven clicks).

UNVERIFIED / untested:
- Real phone and **Safari/iPad**; sound actually audible (the tests count sounds the page
  asked for); Test alert volume; a **locked phone** or background tab may pause sound.
- Dragging layers (owner Sortable and customer drag) not tested by automation.
- **Telegram with the real Telegram service** (only a fake server was used); message wording; whether
  Telegram delivers while the phone is locked (it normally does, but not tried).
- Live updates through a **Cloudflare/ngrok tunnel** (heartbeat is in place but untried).
- Mode B publish with allergens; printing a real QR sheet; the kitchen minutes-ago text only
  updates when the screen redraws.
- Photoreal layer images (`LAYER_IMAGES_ON`) and pro v2 visual polish on all screens.

Known issues not fixed:
- Thin strip of content above the tab bar (cause unknown).
- Owner live preview is hidden at phone width (works on desktop).
- Cart is still a small popover over the menu.
- Dead non-veg code in `app.js`; `app.js` is a very large file.

---

## 8. Working environment notes for the assistant

### 8.1 Reading and testing the code
- **Cloning works from bash:** `git clone https://github.com/vinayak7j-a11y/explodish.git`
  (github.com is allowed). The web-fetch tool is unreliable for this repo (stale or empty
  page; it only opens URLs the user pasted). Use the clone, and `git fetch && git reset
  --hard origin/main` to refresh.
- `npm install` works. Start a test server detached: `setsid nohup env PORT=3066
  DB_FILE=/tmp/x.db node server.js > /tmp/s.log 2>&1 < /dev/null &`. **It can die between
  tool calls, so check and restart in the same command.** Stop by port with
  `fuser -k 3066/tcp`. **Never `pkill -f "node server.js"`** (it can match and kill the
  shell's own command line).
- Browser: Chromium `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; puppeteer from
  `/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer`
  with `headless:'new'`, `args:['--no-sandbox']`.
- Lessons: puppeteer `click` near sticky bars can fail, so use DOM `.click()` via
  `page.evaluate`; set inputs by assigning `.value` then dispatching `input` and `change`;
  scope selectors (`.ticket` is also on dish cards; `[class*=toast]` matches both the
  container and its child, which once looked like a duplicate pop-up); scope disc checks to
  `#detailOverlay`; do not reuse stale element handles after a re-render; headless
  localStorage clearing on every navigation breaks "survives reload" tests.
- `renderAdmin()` rebuilds the whole admin panel; only render when on the kitchen tab or
  state is safe, otherwise owner form typing is lost.
- The owner's local checkout is the source of truth; the clone must match origin.

### 8.2 Patch script conventions (keep using)
- `python3 - << 'EOF'` scripts with a `need(s, anchor, what)` helper: each anchor must occur
  exactly once or the script prints `[FAIL] … nothing changed` and exits; a marker string
  makes re-runs print `[SKIP]`. Tests first in the sandbox, applied **twice** to prove
  idempotency, then `node --check`, `npm test`, then a browser test.
- Each delivery ends with the verification commands and the commit block:
  `git add <files>`, `git commit -m "…"`, `git push`.
- Extend `test/smoke.js` by inserting a block before the `Status flow` section.

### 8.3 Selector cheat sheet
Customer: `.dish-card[data-id]`, `.cat-pill[data-cat]`, `#jainToggle`, `.allergen-pill`,
`#detailOverlay`, `.stepper[data-ing] .step-inc/.step-dec`, `.modifier-opt[data-opt]`,
`.swap-select`, `#runningTotal`, `#deltaFeed`, `.build-level`, `.stack-disc`, `.detail-hero`,
`#photoToggle`, `#addToCartBtn`, `#closeDetail`, `#cartFab`, `#cartPanel`,
`[data-cart-act="remove|more"][data-i]`, `#placeOrderBtn`, `.table-chip`.
Owner: `#authEmail #authPassword #authSubmit #authError`, `.tab[data-tab="owner|kitchen"]`,
`#dishName #dishCategory #dishBase #saveDishBtn #resetDraftBtn #templateSelect
#addIngredientBtn #ingredientList .ingredient-row .mode-btn[data-mode="A|B"] .ing-swappable
.ing-swaps .dish-manage-row #photoInput #tableCount #genQrBtn #qrGrid`.
Kitchen: `.ticket-card .th-table .status-badge .status-btn[data-next] .hist-range
.top-ing-row .kbadge #connBar .pro-sound-bar .pro-sound .pro-test`.
Globals: `ORDERS, CART, DISHES, activeTab, ownerDraft, currentDetail, CURRENT_TABLE,
window.EXPLODISH_NEW, window.explodishChime`.
Key functions: `refreshKitchenOrders, syncNewCount, setConnBar, startKitchenPoll,
statusControls, kitchenViewBase, historyCard, drawCartPanel, toggleCartPanel,
renderDetailOverlay, renderIngredientRowsB, parseSwapText, swapText, saveDraft`.

---

## 9. Roadmap v2 (status as of this handoff)

Rules for every step: never lose an order (orders first); owner does at most 3 things;
no paid AI for 10 customers; one change per step, tested in a real browser, say what is
UNVERIFIED; `git tag` before each phase; measure add-on share and average order value.
Legend: DONE, DELIVERED (applied by owner, confirmation pending), TODO.

**Phase 0: safety net**
- 0.1 Baseline screens: DONE (assistant ran the app itself; fixed P0 and layout bugs).
- 0.2 One-command test (`npm test`): DONE. Browser-driven order test: TODO (optional).
- 0.3 Git hygiene: tag `v0-baseline` DONE; refresh PROJECT_CONTEXT (this file) DONE; one
  branch per phase TODO.
- 0.4 Event tracking (menu_open, dish_open, addon_added, cart_open, order_placed; anonymous):
  TODO. History card should then show scans vs orders vs add-on share.
- 0.5 Feature audit: DONE (see 6). Leftover: manual drag-reorder check, Safari/phone.

**Phase 1: orders must never be missed**
- 1.1 Live push + connection bar: DONE (commit status unconfirmed).
- 1.2 Kitchen screen: repeating alert, accept, Test alert, readable tickets, badge:
  DELIVERED. Possible follow-ups: ticket grouping by table, tablet landscape layout,
  keep-screen-awake, installable PWA.
- 1.3 Telegram backup alert: DELIVERED (see 3.6). Done when a locked phone still rings: needs the
  owner to create the bot and try it for real; check current Telegram bot rules.
- **1.4 Customer progress: NEXT.** Order number, Received/Preparing/Ready track, ETA from an
  owner-set prep time (no fake precision), "a waiter will come" if not accepted in time.
- 1.5 Failure-proof ordering: idempotency key (retry never double-orders), offline
  detection, cart kept, clear Retry.
- 1.6 Rush controls: "Pause ordering" switch, sold-out toggle from the kitchen screen.
- 1.7 Printing: print-friendly ticket button (thermal printers later).
- 1.8 Test order: owner presses "Send test order" and sees/hears it arrive.

**Phase 2: restaurant lifecycle (funnel)**
2.1 data (status, paid_until, plan, whatsapp, preview_token; idempotent migration) ·
2.2 signup + plan + menu photo/PDF upload (10 MB, files not in DB) · 2.3 `/ops` back-office
(queue, image beside editor, status buttons, payment log, WhatsApp templates, read-only view,
password reset) · 2.4 bulk-paste import (`Name - price`, ₹, `/-`, `99/149` sizes, headings,
review screen, undo; goal: 5 real menus with under 20% of rows needing fixes) · 2.5 preview
mode (banner, unguessable link, 7-day expiry, TEST orders ring the owner's kitchen, excluded
from stats) · 2.6 go live (+ printable QR pack PDF with short link) · 2.7 expiry (plain
fallback, 3-day grace, reminders) · 2.8 weekly proof report · 2.9 owner onboarding checklist
· 2.10 plans/terms/privacy/refund (professional review; not legal or tax advice).

**Phase 3: exploding experience**
3.1 bake-off page (2D vs 3D, cheap Android) · 3.2 art direction (about 24 veg layers, under
40 KB each) · 3.3 interaction (stagger spring, drag, snap, haptics, undo, +/− always) ·
3.4 light game layer with owner off-switch · 3.5 Mode B icons/spice/swaps · 3.6 low-end
fallback · 3.7 optional dish photo (partly done: toggle).

**Phase 4: UI redesign**
4.1 direction (dark vs light mock-ups) · 4.2 design tokens (replace `html.pro` overrides) ·
4.3 customer screens (hero, sticky category bar, bottom-sheet dish, cart sheet, order track,
skeletons, empty/error/sold-out states) · 4.4 owner screens (home "today in 3 numbers",
simple vs advanced) · 4.5 auth screens · 4.6 copy pass (Hindi later) · 4.7 accessibility
and speed QA · 4.8 landing page with live demo.

**Phase 5: hosting and pilot**
5.1 hosting · 5.2 production config · 5.3 nightly backups with a tested restore · 5.4
monitoring · 5.5 pilot kit (visit plan, what to record, permission to use numbers) · 5.6 run
the pilot (P0 lost order, P1 confusing, P2 polish).
**Pilot setup steps to prepare:** tunnel (Cloudflare Tunnel or ngrok, check free limits),
open admin through the public URL (QR links use it) or add `PUBLIC_URL`, set
`TRUST_PROXY=1`, 5-8 real dishes, record orders, average order and add-on share.

**Phase 6: growth** sales assets, funnel dashboard, support playbook, referral (after paying
customers).

**Phase 7: edge cases and later:** per-table order cooldown (anti-flood), re-price politely
when a dish changes while in a cart, midnight/timezone stats, long menus and big images,
account export/deletion, session expiry, safe migrations; later and only when triggered: AI
menu import, Razorpay AutoPay, POS integration (Petpooja, Posist), Hindi, multi-outlet,
combos/thali, GST invoices (ask an accountant).

Polish checklist (finish line): new owner live in under 3 minutes of their own effort;
a customer adds an extra in 3 taps or fewer; kitchen alert in under 3 s and cannot be
missed; works one-handed on a cheap phone; every error has a friendly message; nothing
described as tested unless it was.

---

## 10. Commands the owner uses

1. Start: `cd ~/Downloads/menu-app` then `node --env-file=.env server.js`
2. Restart: `kill $(lsof -ti :3000) 2>/dev/null; node --env-file=.env server.js`
3. Test: `npm test` (expect `PASS: 24 passed, 0 failed` then `PASS: 16 passed, 0 failed`)
4. Commit pending work (only if `git status -sb` shows changes):
   `git add server.js db.js telegram.js package.json public/app.js public/pro.js public/pro.css public/styles.css test/smoke.js test/telegram.js`
   `git commit -m "Swaps, live updates, kitchen alerts, Telegram alerts"`
   `git push`
5. Phone test on the same wifi: `ipconfig getifaddr en0`, open `http://<that number>:3000/admin`,
   regenerate QR codes, scan. macOS may ask to allow incoming connections.
6. Rollback: `git checkout v0-baseline` to look, `git checkout main` to return (separate
   lines, no comments).

---

## 11. Open questions (the owner has not answered; ask one at a time)

1. Which device will the kitchen use (phone, tablet, laptop)? It decides the kitchen layout.
2. Which city/area and which kind of restaurants first? It decides outreach and the demo menu.
3. Which plans and what price? (Proposed: one monthly plus a discounted yearly; decide after pilots.)
4. Lapsed subscription: plain-menu fallback (recommended) or menu off? Refund/guarantee rule?
5. Dark or light design direction? (Decide from the two mock-ups.)
6. Did the owner create the Telegram bot and get a real alert on a locked phone? Did the
   **Test alert** sound loud enough on the kitchen device? Does layer drag-reorder
   work by hand in Owner tools?

---

## 12. Starting message for the new chat (the owner pastes this)

See the short message provided alongside this file. In short: attach this file, link the
repo, ask the assistant to continue from step 1.4 (and first check how Telegram went), keep replies short, give paste-in
terminal blocks, test in a real browser first, and say honestly what is unverified.
