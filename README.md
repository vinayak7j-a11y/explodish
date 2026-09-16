# Layer — Interactive Restaurant Menu

An end-to-end prototype of a customizable digital menu:

- **Menu tab** — the customer-facing viewer. Layered dishes (burgers, wraps) open
  into an "exploded layers" view where you add/remove/adjust ingredients with
  live per-action pricing. Non-layered dishes (curries, drinks) open into an
  ingredient-transparency view with allergen tags and swaps.
- **Owner tools tab** — the restaurant onboarding flow. Upload a photo, tag
  ingredients, set pricing and the removal-price rule, publish. Edit or delete
  anything already published.
- **Kitchen & dashboard tab** — every placed order renders as a real kitchen
  ticket, plus stats: total orders, revenue, revenue from add-ons specifically,
  and a most-added-extras leaderboard.

## Stack

Deliberately boring so it's easy to read and change:

- **Backend:** Node.js + Express (`server.js`), no framework magic.
- **Storage:** flat JSON files in `data/` (`dishes.json`, `orders.json`) via
  plain `fs.readFileSync`/`writeFileSync`. No database to install. This is the
  first thing to swap out (for Postgres/SQLite/Mongo) once this needs to run
  for more than a pilot — the API routes are the only place that touches it.
- **Frontend:** plain HTML/CSS/vanilla JS in `public/`, no build step, no
  framework. Talks to the backend over `fetch()` calls to `/api/dishes` and
  `/api/orders`.

## Running it

```bash
npm install
npm start
```

Then open **http://localhost:3000** in a browser. That's it — no `.env`, no
database setup, no build step.

## Project structure

```
menu-app/
├── server.js           # Express server + all API routes
├── package.json
├── data/
│   ├── dishes.json      # dish + ingredient data (edit by hand or via Owner tools)
│   └── orders.json      # placed orders (kitchen tickets + dashboard stats read from here)
└── public/
    ├── index.html
    ├── styles.css
    └── app.js            # all frontend logic — rendering, pricing engine, API calls
```

## API reference

| Method | Route              | Body                          | Notes                                   |
|--------|--------------------|--------------------------------|------------------------------------------|
| GET    | `/api/dishes`       | —                              | Returns all dishes                       |
| POST   | `/api/dishes`       | dish object (no `id`)          | Creates a dish, server assigns `id`      |
| PUT    | `/api/dishes/:id`   | full dish object               | Replaces a dish                          |
| DELETE | `/api/dishes/:id`   | —                              | Removes a dish                           |
| GET    | `/api/orders`       | —                              | Returns all orders                       |
| POST   | `/api/orders`       | order object (no `id`/`time`)  | Creates an order, server assigns both    |

## Data model

A dish looks like:

```json
{
  "id": "seed-burger",
  "name": "The Original Smash Burger",
  "mode": "A",                 // "A" = exploded layers, "B" = ingredient view
  "basePrice": 189,
  "category": "Burgers",
  "image": null,                // data URL, or a real file path once you add uploads
  "removalRefund": false,       // does removing an included ingredient lower the price?
  "ingredients": [
    { "id": "b1", "name": "Sesame bun", "included": true, "mandatory": true,
      "unitPrice": 0, "maxQty": 1, "allergens": ["Gluten"] }
  ]
}
```

Mode B ingredients skip `mandatory`/`maxQty`/`included` and instead use
`swappable` + `swapOptions: [{ label, price }]`.

## Known gaps (by design, for a first pass)

These are the natural next layers once you've picked a real pilot restaurant:

- **No accounts / multi-restaurant support** — right now it's one shared menu.
  Adding restaurant accounts means adding a `restaurantId` to dishes/orders and
  a login layer.
- **No real database** — JSON files are fine for a pilot, not for concurrent
  writes at scale. Swap `data.js`-style read/write calls for Postgres/SQLite
  when ready (schema above maps over almost 1:1).
- **No POS/KDS integration** — orders currently just sit in `orders.json`.
  A real deployment would push each order to the restaurant's existing
  kitchen display / POS system instead.
- **No AI-assisted ingredient tagging** — the owner tool is fully manual
  right now. Auto-suggesting ingredients from the uploaded photo (via a
  vision model) is the highest-leverage next feature for onboarding speed.
- **No payments.**

## Making changes

Everything is plain, readable files — no build step to fight with:

- Pricing logic lives in `computeTotal()` / `adjustQty()` in `public/app.js`.
- Visual styling and design tokens (colors, type, spacing) live at the top of
  `public/styles.css` as CSS variables.
- API routes and persistence live entirely in `server.js`.
