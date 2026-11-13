# Explodish: Project Context & Handoff (v5, 13 Nov 2026)

> **Read this first in any new chat.** It replaces every older copy (v4 and earlier).
> It holds the vision and north star, every decision made, the exact current state,
> how the code is organised, what is verified and what is NOT, how changes are
> delivered, and the prioritised next steps. Where something says **UNVERIFIED**, it
> passed tests in a sandbox but the owner has not confirmed it on their own screen.
> Say so honestly; never claim otherwise.

---

## 0. First five minutes of the new chat (do these before anything else)

1. Read this file fully, then `ROADMAP` in section 9. Do not restart discussions that section 2 already settled.
2. Ask the owner to run, inside `~/Downloads/menu-app`:
   `git status -sb` and `git log --oneline -5` and `npm test`.
   Expected: clean tree, latest commit `e5e7f3b` (or newer), and five passing groups:
   `PASS: 77`, `PASS: 16`, `PASS: 38`, `PASS: 23`, `PASS: 9`.
3. Phase 1 (orders must never be lost) is BUILT. What is still **unconfirmed by the owner on real devices** (ask, one question at a time):
   (a) Chrome desktop notification test on their Mac (Kitchen tab -> Lock-screen notifications -> Turn on -> Send test notification),
   (b) a real Telegram bot (token in `.env`, Phone alerts card, locked-phone test), (c) a real print of a ticket,
   (d) the new drag-and-drop feel and the new dish art on a real phone.
4. Next work: **first test server** (follow `DEPLOY.md`, fix it where it is wrong), then Phase 2 (restaurant signup/preview funnel).
   No hosting provider has been chosen yet; suggested: a small Mumbai/Bangalore VPS (about US$4-6 a month) plus a domain. Check prices live.
5. Never work "blind": clone the repo and test in a real browser in your sandbox before sending anything (see 8.1).

---

## 1. How to work with this person (important)

- Owner is on a **Mac**, builds locally in `~/Downloads/menu-app`, shell is **zsh**.
  **Not experienced with the terminal.** Give commands with the folder stated and say
  what the output should look like. **Do not put `# comments` inside command blocks**:
  zsh treats them as arguments and prints errors (this happened).
- **Delivery format that works best now:** a **downloadable patch file** (`patch-*.py`, content-matching, prints `[OK]/[SKIP]/[FAIL]`) plus short copy-paste Terminal blocks to run and commit it. Long pasted blocks fail for them. Give each patch a NEW file name when re-issuing (a browser kept an old same-name copy once and the fix did not apply). Older format they asked for: copy-pasteable terminal blocks, either
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

- **They run every patch themselves and paste the Terminal output back.** Read it: `[SKIP]` everywhere means already applied (harmless);
  "nothing to commit" means it was committed earlier. They sometimes run a block twice. A slow `npm install` is almost always
  `better-sqlite3` rebuilding: tell them to `Ctrl+C` and run `npm install --ignore-scripts`.
- Their Mac has **old `data/*.json` files** from before SQLite; the app imports them into any EMPTY database once (also test databases).
  Tests must never assume an empty database (this broke the backup test once).
- Before sending a patch: apply it to a fresh `git clone` of origin, run it twice (2nd run = all `[SKIP]`), `node --check`, `npm test`, and test in a real browser.

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


---

## 3. Current state (what exists, as of 13 Nov 2026, commit e5e7f3b)

### 3.1 Platform / security
- Multi-tenant: `/admin` login/register, `/r/:slug` customer menu, `/` landing stub. `/r/:slug?preview=1` = the owner's preview (ordering off).
- Auth: bcryptjs + JWT in an httpOnly cookie (30 days; `secure` in production). `requireAuth` also checks the restaurant exists and is `active`.
- SQLite (`better-sqlite3`, WAL). `DB_FILE` env overrides the path. Production refuses to start without a real `JWT_SECRET`.
- Hardening: body limits, sanitisers, in-memory rate limits (set `TRUST_PROXY=1` behind a proxy), security headers (`X-Frame-Options: SAMEORIGIN`
  so only the app itself can frame itself; HSTS only when the request is https), CSV formula guard, server re-prices every order (tamper -> 409).
- Tenant isolation verified; hostile text shown as text everywhere checked.
- Health check `GET /healthz`. Graceful shutdown on SIGTERM/SIGINT (about 1.4 s). `npm audit`: 0 vulnerabilities (Express deps updated).

### 3.2 Owner side (`/admin` -> Owner tools)
- **Add your menu** card: paste text or choose a photo -> review list (edit name/price/category/type, include/exclude) -> Publish -> **Undo this import**.
  Parser `public/menuparse.js` (free, no AI): `Name - price`, rupee forms, dot leaders, `99/149` sizes (Regular/Large or Half/Full), headings, price on next line,
  junk/phone/GST lines ignored and listed, non-veg blocked, "Since 1998"/noise dropped, duplicates and already-on-menu flagged.
  Photo reading `public/menuimport.js`: **Tesseract.js in the browser** (files served from `node_modules` via `/vendor/ocr/*`, English only, about 10 s per photo).
  Imported dishes use templates and are marked **needsReview** ("Check ingredients"): hidden from Jain/allergen-filtered customers until **Mark checked**.
  OCR reads the rupee sign as "1": photo prices 100-199 are flagged "Check price" and the photo + "read as" line are shown beside each row.
- **Your menu, as customers see it**: live phone-frame preview (`public/menupreview.js`), ordering off, Refresh/Hide/Open customer page.
- The old dish form is hidden behind **Build one dish by hand** (Mode A layers / Mode B ingredients with swaps, modifiers, photo, drag-reorder UNVERIFIED by hand).
- Table QR codes (`/api/qr`); they use `PUBLIC_URL` when set and say which address they open (warn on localhost/LAN).

### 3.3 Customer side (`/r/:slug`)
- Menu grid, category pills, Jain filter, "No <allergen>" chips, table chip, sold-out labels, menu refresh every 45 s.
- Open dish: steppers, drag layers, modifiers, delta feed, running total, build level, confetti. **New art `public/layerart.js`**: shaded 3/4-view SVG layers
  (bun with sesame, grill-marked patty, melting cheese, frilly lettuce, seeded tomato, onion rings, pickles, sauce, paneer), flat bread for wraps,
  bowls (curry/dal/soup/biryani with garnish and steam) and glasses (drink with ice, straw, lemon) for ingredient-view dishes; bigger stage, build-up animation.
- Cart popover (Remove, + Another, Total). **Failure-proof ordering (`public/orderguard.js`)**: one attempt id per cart so Retry never double-orders,
  red "Order not sent yet / You're offline / Ordering is paused" bar with **Retry order**, 20 s timeout, cart kept until the kitchen really has the order.
- **Order progress track**: "Order #12 - Table 5", Received / Preparing / Ready, "Ready in about N min" (owner-set waiting time, counted from Start preparing),
  "A waiter will come to your table soon" if still unaccepted after 3 min (`WAITER_AFTER_SEC`), Cancel while `new`.
- **Pause**: if the kitchen paused ordering, a banner shows and orders are refused (409 `ordering_paused`).

### 3.4 Kitchen (`/admin` -> Kitchen & dashboard)
- Live push (SSE) with backup polling and a red "Connection lost" bar; repeating alert sound every 6 s while any order is `new` until **Start preparing**; Sound on/off, Test alert; badge on the tab.
- Tickets: big TABLE label, `Order #N`, changes in bold capitals, **Print** button (80 mm receipt layout via a hidden frame; `public/print.js`), TEST ORDER label.
- **Rush controls**: Pause/Resume ordering (red bar on every owner tab while paused), tap-to-toggle Sold out for every dish, **Send a test order** (practice order marked TEST,
  excluded from stats/history/CSV, takes no order number), screen wake lock ("Screen stays awake" note; falls back to advice).
- **Waiting time** card (minutes shown to customers). **Lock-screen notifications** card (web push, `push.js`, `public/sw.js`, `public/pushsetup.js`; needs https except localhost;
  iPhone needs Add to Home Screen, iOS 16.4+). **Phone alerts** card (Telegram, only when `TELEGRAM_BOT_TOKEN` is set).
- Stats today, most-added extras, order history (Today/7/30/All, average order, add-on revenue/share, cancelled, CSV).

### 3.5 Alerts and reminders
- New order -> SSE + sound; Telegram message "New order #N - Table X ..." and lock-screen push (tag per order); if still `new` after 2 min (`TELEGRAM_REMINDER_MS`, `PUSH_REMINDER_MS`)
  reminders up to 3 times; accepted orders get none. Telegram/push failures never block ordering. Push devices removed automatically on 404/410.
- VAPID keys are generated once and stored in the database (`kv` table): **back the database up** or every device must re-subscribe. Set `PUSH_CONTACT=mailto:...` before going live.

### 3.6 Backups
- `backup.js`: SQLite online backup, single-file copy, integrity-checked, prunes to newest N. Automatic when `BACKUP_DIR` is set (every `BACKUP_EVERY_HOURS`, default 24; `BACKUP_KEEP` default 14).
  `npm run backup` by hand. `restore.js <file>` (stop the server first) keeps the old database as `.before-restore-<time>`, refuses damaged files. Off-site copy is manual (`scp`) for now.

---

## 4. Stack and files

No build step. Express + SQLite + vanilla JS.

```
menu-app/
  server.js        routes, auth, sanitisers, rate limits, price check, SSE hub, test order, pause, health, shutdown
  db.js            SQLite layer + legacy JSON import + order numbers + push/kv/pause helpers + online backup
  telegram.js      optional Telegram alerts            push.js    web push alerts (web-push library)
  backup.js / restore.js                               .env.example  every setting explained     DEPLOY.md  hosting guide
  deploy/explodish.service, deploy/Caddyfile           package.json  engines node>=20.6; scripts test/backup/restore
  test/smoke.js (77)  telegram.js (16)  menuparse.js (38)  push.js (23)  backup.js (9)    <- npm test runs all five
  public/
    index.html     shell; scripts load in this order: menuparse, menuimport, menupreview, orderguard, rush, print, pushsetup (+ layerart) then app.js
    app.js         the three experiences (customer, owner, kitchen)        styles.css / pro.css / pro.js   design + animation layer
    layerart.js    dish artwork (layers, bowls, glasses)                   menuparse.js / menuimport.js    menu import
    menupreview.js owner preview                                           orderguard.js  retry-safe ordering + pause banner
    rush.js        rush controls, test order, wake lock                    print.js       ticket printing
    pushsetup.js   notifications card                                      sw.js, manifest.webmanifest, icons/   service worker + install icons
```
- Run: `cd ~/Downloads/menu-app && node --env-file=.env server.js` -> http://localhost:3000. URLs: `/admin`, `/r/<slug>`, `/r/<slug>?table=7`, `/healthz`.
- Owner's real test restaurant: **Thakur ji ki rasoi**, slug `thakur-ji-ki-rasoi`.
- Repo: https://github.com/vinayak7j-a11y/explodish (public). `.gitignore` covers `node_modules/ .env data/ backups/ ...`.
- Photo reading needs `tesseract.js`, `tesseract.js-core`, `@tesseract.js-data/eng`; push needs `web-push` (all in package.json).

---

## 5. Data model, pricing, API

### Tables
`restaurants(id, slug UNIQUE, name, email UNIQUE, password_hash, active, created_at, prep_minutes, ordering_paused)`, `dishes(id, restaurant_id, data JSON)`,
`orders(id, restaurant_id, time, data JSON)`, `telegram_links(restaurant_id PK, chat_id, linked_at)`, `push_subscriptions(endpoint PK, restaurant_id, p256dh, auth, label, created_at)`,
`kv(key, value)` (VAPID keys). Migrations are idempotent (`PRAGMA table_info` then `ALTER`).

### Dish document
As before (`id, name, mode A|B, basePrice, category, image, removalRefund, dietary:"veg", jainFriendly, soldOut, ingredients[], modifiers[]`) plus **`needsReview`** (boolean, set by imports, cleared by Mark checked or saving by hand).
Imported sizes become modifier group `mod-size` (first price = base price). `soldOut` changes only via `PATCH /api/dishes/:id/soldout`.

### Order document
`{id, number (daily 1,2,3; null for test), time, status new|preparing|ready|done|cancelled, preparingAt, readyAt, table|null, total, upsell, clientId (attempt id), test (practice order), items[...]}`.
Pricing and server checks unchanged (re-price from the saved menu, 409 `menu_changed`, sold-out 409 `{soldOut:[...]}`).

### API
Public: `GET /api/r/:slug` (now includes `orderingPaused`), `GET /api/r/:slug/dishes`, `POST /api/r/:slug/orders` (200/10 min; `clientId` makes retries safe: a repeat returns the first order with 200;
409 `ordering_paused` when paused), `GET /api/r/:slug/orders/:id/status` (status, number, ageSec, preparingAgeSec, prepMinutes, waiterAfterSec), `POST .../cancel`, `GET /api/qr`, `GET /healthz`.
Auth: `POST /api/auth/register|login|logout`, `GET /api/auth/me`.
Admin: dishes CRUD + soldout, `GET /api/orders`, `GET /api/orders/stream` (SSE), `PATCH /api/orders/:id/status`, `GET /api/orders.csv` (test orders excluded),
`GET|PUT /api/settings` (prepMinutes), `GET|PUT /api/ordering` (paused), `GET /api/config` (publicUrl), **`POST /api/orders/test`**,
`/api/telegram/*`, `/api/push/status|subscribe|test`, `DELETE /api/push/subscribe`. Service worker at `/sw.js` (never cached).
Env: `JWT_SECRET`, `PORT`, `NODE_ENV`, `TRUST_PROXY`, `PUBLIC_URL`, `DB_FILE`, `BACKUP_DIR/BACKUP_EVERY_HOURS/BACKUP_KEEP`, `REPORT_TZ`, `WAITER_AFTER_SEC`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_REMINDER_MS`, `PUSH_CONTACT`, `PUSH_REMINDER_MS`, `VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY` (optional; else generated). See `.env.example`.

---

## 6. What has been done (all pushed; newest first)

| Commit | What |
|---|---|
| `e5e7f3b` | Backup test no longer assumes an empty database |
| `8235d4e` | Hosting prep: `/healthz`, backups + restore, clean shutdown, PUBLIC_URL for QR codes, HSTS on https, `.env.example`, `DEPLOY.md`, systemd + Caddy files |
| `e8d4e2e`, `80ad793` | Dependency security updates (0 vulnerabilities) |
| `4ab99ad` | Steps 1.7 + 1.8: print ticket, send test order, wake lock, order number in Telegram, no drag hint on ingredient dishes |
| `45acd53` | Step 1.6: rush controls (pause ordering, sold-out from kitchen) |
| `80c1d9a` | Lock-screen notifications (web push) |
| `d521557` | Step 1.5: retry-safe ordering, Retry bar, cart kept |
| `26f9c05` | Owner menu preview (phone frame, ordering off) |
| `2873c1a` | Better dish graphics (layers, bowls, glasses, build-up animation) |
| `c82d4e9` | Menu import: paste or photo -> review -> publish -> undo |
| `59f7533` | Step 1.4: order number + progress track + waiting time + waiter message |
| `17bef16` and earlier | Kitchen alerts, Telegram, live updates (SSE), swaps, cart controls, photo toggle, phone layout fixes, favicon, `npm test`, absolute asset paths (P0 fix) |

---

## 7. Verified vs UNVERIFIED, and known issues

**Owner-confirmed on their machine:** all five `npm test` groups pass; paste import published 3 dishes; the new owner screens load; commits pushed.
**Verified only in the assistant's sandbox Chromium (desktop + 390 px emulation):** menu import with OCR on two synthetic menus, publish/undo, customer menu with new art for all 9 templates,
stepper add/remove, owner preview (0 orders created from the frame), lost-reply/offline/500/retry flows, pause/resume/sold-out flow, test order + ticket rendering, service worker showing a pushed notification, Mode B hint hidden.

UNVERIFIED / untested:
- **Real phones and Safari/iPad**; sound audible; locked phone behaviour; wake lock on real devices.
- **Real Telegram** (only a fake server). **Real web push delivery** (no internet in the sandbox; only the server logic, the library's request building, and the service worker display were tested). iPhone Add to Home Screen flow.
- **A real printer**; paper width/margins.
- **OCR on real photographed menus** (only synthetic images: clean table menu 8/8 dishes; dotted-leader menu about 9/14 with several garbled names). Hindi/Devanagari menus unsupported.
- Dragging layers by hand (customer and owner) - never exercised by automation.
- Two kitchen devices at once: pause state refreshes on focus, not instantly.
- **`DEPLOY.md` has never been run on a real server.** Real https certificate, off-site backup copy, and nightly backup on a real host untested.
- Very tall stacks ("Mega Stack" with every extra) fit-to-stage not checked.

Known issues not fixed:
- Cart is still a small popover (full cart sheet planned in the redesign). Menu card picture is small on phones. `app.js` is very large.
- Imported dishes use template layers/allergens (hence "Check ingredients"); descriptions from menus are not stored.
- Thin strip above the tab bar (cause unknown). Owner live preview of the by-hand form is hidden at phone width.

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

- Tools lessons added: `git checkout .` in the clone **reverts tracked files you edited** (lost work once): copy files you want to keep first. `git stash -u` also hides new files.
  Stale servers from earlier test runs keep ports and databases (delete `*.db`, `-wal`, `-shm`, kill `node server.js`). Do not background a server inside a command that must return (use `setsid nohup ... &` and separate calls).
  Headless Chromium wipes localStorage on reload (test persistence by rebuilding state instead). Puppeteer `Notification` needs `overridePermissions`; push subscribe fails offline (expected in the sandbox).
  Patch builder pattern: a Python template with `replace_once(path, anchor, new, marker, what)`, embedded base64 for new files, built by a small generator script; verify on a fresh clone, run twice.

---

## 9. Roadmap v3 (status as of this handoff)

Rules for every step: never lose an order; owner does at most 3 things; no paid AI for the first 10 customers; one change per step, tested in a real browser, say what is UNVERIFIED; measure add-on share and average order value.

**Phase 0 safety net:** DONE (baseline, `npm test` now 5 groups, tags). Left: event tracking (menu_open, dish_open, addon_added, cart_open, order_placed) to show scans vs orders vs add-on share; one branch per phase.

**Phase 1 orders must never be missed:** 1.1 live push DONE, 1.2 kitchen alerts DONE, 1.3 Telegram DELIVERED (real bot untested), 1.4 progress track DONE, 1.5 failure-proof ordering DONE,
1.6 rush controls DONE, 1.7 print ticket DONE (real printer untested), 1.8 test order DONE. Plus web push (DELIVERED, real delivery untested), wake lock, retry safety.
Possible follow-ups: ticket grouping by table, tablet landscape layout, auto-print (needs kiosk printing), per-table order cooldown, rate limit message when many customers share one IP.

**Phase 5 hosting (moved up, because phones need https for lock-screen notifications):**
5.1 hosting - **NEXT: set up a first test server with the owner using `DEPLOY.md`** (provider and domain not chosen). 5.2 production config DONE in code (`.env.example`, JWT check, `TRUST_PROXY`, `PUBLIC_URL`, HSTS).
5.3 nightly backups DONE in code (manual off-site copy; test a restore on the real host). 5.4 monitoring: `/healthz` exists; add an uptime monitor + log review. 5.5 pilot kit. 5.6 run the pilot.
Pilot steps: real https address, `TRUST_PROXY=1`, 5-8 real dishes via the importer, record orders, average order and add-on share, ask permission to use numbers.

**Phase 2 restaurant lifecycle (funnel):** 2.1 data (status waiting/building/preview/live/expired, paid_until, plan, whatsapp, preview_token) - 2.2 signup + plan + menu photo/PDF upload (10 MB, files not in DB) -
2.3 `/ops` back-office (queue, image beside the editor, status buttons, payment log, WhatsApp templates, read-only view, password reset) - 2.4 bulk import: **mostly DONE** (paste + OCR + review + undo; PDF input and a "5 real menus under 20% fixes" test remain) -
2.5 preview mode (7-day private link, TEST orders ring the owner's kitchen; the practice-order mechanism already exists) - 2.6 go live + printable QR pack - 2.7 expiry (plain-menu fallback, grace, reminders) -
2.8 weekly proof report - 2.9 onboarding checklist - 2.10 plans/terms/privacy/refund (professional review).

**Phase 3 exploding experience:** art for layers/bowls/glasses DONE (original SVG by code, no licences). Left: 2D vs 3D bake-off on a cheap Android phone, smoother drag with snap/haptics/undo, optional game layer with owner off-switch,
low-end fallback, labels with lines to each layer, optional dish photo polish.
**Phase 4 UI redesign:** dark vs light mock-ups, design tokens, bottom-sheet dish, full cart sheet, skeletons, owner home "today in 3 numbers", auth screens, copy pass (Hindi later), accessibility + speed QA, landing page with a live demo menu.
**Phase 6 growth / Phase 7 edge cases:** unchanged from v4 (sales assets, funnel dashboard, referral; re-price when a dish changes in a cart, long menus, account export/deletion, AI import later, Razorpay AutoPay after about 10 customers, POS, Hindi, multi-outlet, combos, GST invoices).

Polish checklist (finish line): a new owner is live in under 3 minutes of their own effort; a customer adds an extra in 3 taps or fewer; kitchen alert in under 3 s and cannot be missed; works one-handed on a cheap phone; every error has a friendly message; nothing described as tested unless it was.

---

## 10. Commands the owner uses

1. Start: `cd ~/Downloads/menu-app` then `node --env-file=.env server.js`
2. Restart: `kill $(lsof -ti :3000) 2>/dev/null; node --env-file=.env server.js`
3. Test: `npm test` (expect `PASS: 77`, `16`, `38`, `23`, `9`)
4. Apply a patch: `python3 ~/Downloads/patch-<name>.py` then `npm test`, restart, then the `git add ... / git commit -m ... / git push` block given with that patch.
5. Backup now: `npm run backup` (makes `backups/explodish-<time>.db`). Restore (server stopped): `node restore.js backups/<file>.db`.
6. Phone test on the same wifi: `ipconfig getifaddr en0`, open `http://<that number>:3000/admin`. (Lock-screen notifications need https, so not on this address.)
7. Dependencies: if `npm install` hangs, `Ctrl+C` then `npm install --ignore-scripts`. `npm audit fix` currently reports 0 vulnerabilities.
8. Rollback: `git checkout v0-baseline` to look, `git checkout main` to return (separate lines, no comments in zsh blocks).

---

## 11. Open questions (the owner has not answered; ask one at a time)

1. Did the Chrome notification test work on the Mac, and did a real Telegram bot alert reach a locked phone?
2. Hosting: which provider (suggested: a small Mumbai/Bangalore VPS) and which domain? Who pays and in what currency (some providers need a dollar card)?
3. Which device will the kitchen use (phone, tablet, laptop)? It decides the kitchen layout and whether web push, Telegram or a printer matters most.
4. Which city/area and which kind of restaurants first? It decides outreach and the demo menu.
5. Plans and price (proposed: one monthly plus a discounted yearly; decide after pilots). Lapsed subscription: plain-menu fallback (recommended) or menu off? Refund rule?
6. Dark or light design direction (decide from two mock-ups)?
7. Can they send one real restaurant menu photo, so OCR accuracy can be measured on a real one?

---

## 12. Starting message for the new chat (the owner pastes this)

Attach this file, link the repo, and ask the assistant to read section 0, check `git log` and `npm test` output they paste, and continue with the first test server (using `DEPLOY.md`) or whatever the owner picks.
Keep replies short, give a downloadable `patch-*.py` plus short Terminal blocks, test in a real browser first, and say honestly what is unverified.
