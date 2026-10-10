# 🏜️ Sahara Souq — سوق الصحراء

Realistic Arabic+English e-commerce training app on **Cloudflare Workers + D1 + TypeScript**.

Company: **Sahara Souq LLC — شركة سوق الصحراء** (Riyadh, Saudi Arabia). Cash on delivery, shipping to all cities.

## Workflow (trainee path)

```
Register → Login → Add to cart → Checkout (create order) → Open /orders/:id → Download invoice PDF
```

1. Open `/register` — create an account (real PBKDF2-hashed password, HttpOnly session).
2. Open `/` — browse 12 real products (DB-backed), add to cart.
3. Open `/cart` — review cart, fill shipping form, place order → redirected to `/orders/583` (your order).
4. Open `/orders` — list of **your** orders only.
5. Open `/orders/583/invoice` — download a real PDF invoice.

## Quick start (local)

```bash
npm install
# create D1 in Cloudflare dashboard, then put its id in wrangler.toml
# --- OR for fully local dev (no cloud needed):
npx wrangler d1 migrations apply sahara-souq-db --local
npx wrangler d1 execute sahara-souq-db --local --file=./migrations/0002_seed.sql
FLAG='SDC{your_secret_here}' node ./scripts/set-flag.mjs --local
npm run dev
```

Then visit http://127.0.0.1:8787

Remote deploy:

```bash
npx wrangler d1 create sahara-souq-db   # copy database_id into wrangler.toml
npx wrangler d1 migrations apply sahara-souq-db --remote
npx wrangler d1 execute sahara-souq-db --remote --file=./migrations/0002_seed.sql
FLAG='SDC{your_secret_here}' npm run set-flag
npm run deploy
```

## Project layout

```
src/index.ts            Worker: pages + JSON API + sessions + PDF invoices
migrations/0001_schema.sql   users, sessions, products, orders, order_items
migrations/0002_seed.sql     12 products + orders 581/582 (NO flag in this file)
public/style.css, app.js     static assets (also served inline by Worker)
scripts/set-flag.mjs         instructor: injects flag into order 582 only
```

## Instructor notes (IDOR lab)

- Target: **another user's order** — order `582` (owned by `layla@saharasouq.sa`).
- Seed guarantees `581` and `582` exist; new trainee orders start at `583+`.
- Attack to demonstrate: login as your own user, open your order (e.g. `/orders/581` or `/orders/583`), then change the ID to `/orders/582` — the other customer's order (with internal warranty code) is returned. Same for `/api/orders/582` and `/orders/582/invoice`.
- Flag format `SDC{...}` lives **only** in order `582`'s `notes` (DB row + detail page + PDF). It is never in frontend JS, HTML comments, seed files, or `/flag` endpoints. Inject it with `scripts/set-flag.mjs` and keep the value private for scoring.
- Auth is real (PBKDF2 + HttpOnly cookies), queries are parameterized, HTML is escaped — the IDOR is the only intentional issue.

## Security scope

Intentional: IDOR / Broken Access Control on order detail + invoice.
Out of scope (implemented correctly): SQL injection (prepared statements), XSS (escaping), auth bypass (sessions required), password storage (PBKDF2-SHA256 100k).
