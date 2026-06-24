# Reusable eCommerce Backend

REST API for the **Reusable eCommerce** platform: catalog, cart/checkout, orders, returns/exchanges, media, store settings, and admin authentication. Pairs with the separate [`reusable-ecommerce-admin`](../reusable-ecommerce-admin) React admin dashboard.

**API-first commerce:** cart, shipping quotes, payment selection, and checkout are fully implemented here. There is no customer storefront in the admin repo—use these endpoints from a future storefront, Postman, or curl.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js (CommonJS) |
| Framework | Express 5 |
| Database | MongoDB via Mongoose 9 |
| Auth | JWT (`jsonwebtoken`) + bcrypt |
| Uploads | Multer (media + import files) |
| Import | `xlsx` for template generation and parsing |
| Email | Nodemailer (optional SMTP) |

---

## Prerequisites

- **Node.js** 18+ (20+ recommended)
- **npm**
- **MongoDB** 6+ running locally or a connection string to Atlas

---

## Setup

```bash
# From this directory
npm install
cp .env.example .env   # or create .env manually (see below)
npm run seed:admin     # creates default admin (first run only)
npm run dev            # nodemon, default port 5000
```

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with nodemon |
| `npm start` | Production start |
| `npm run seed:admin` | Seed default super admin |
| `npm run generate:import-template-xlsx` | Optional: write static XLSX to disk (runtime templates are generated on demand) |

Verify: `GET http://localhost:5000/` → `{ success: true, message: "Reusable eCommerce backend API is running" }`

---

## Environment variables

Create a `.env` file in the project root:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/ecommerce_cms
JWT_SECRET=your_super_secret_key
NODE_ENV=development

# Optional — order notification emails
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM_NAME=Reusable Store
SMTP_FROM_EMAIL=no-reply@example.com
ADMIN_NOTIFICATION_EMAIL=
```

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default `5000`) |
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret for admin JWT signing |
| `NODE_ENV` | No | `development` / `production` |
| `SMTP_*` | No | If unset, email sends are skipped gracefully |

Static uploaded files are served from `/uploads` (product legacy uploads, media files).

---

## MongoDB setup

1. Start MongoDB locally, or create a free Atlas cluster.
2. Set `MONGO_URI` to your database (e.g. `mongodb://127.0.0.1:27017/ecommerce_cms`).
3. Collections are created automatically by Mongoose on first use—no manual migrations.
4. Run `npm run seed:admin` before first admin login.

### Default admin seed

| Field | Value |
|-------|-------|
| Email | `admin@example.com` |
| Password | `admin123` |
| Role | `super_admin` |

The seed script is idempotent: it skips if `admin@example.com` already exists.

---

## API response format

All endpoints return JSON:

```json
{
  "success": true,
  "message": "Human-readable message",
  "data": {}
}
```

Admin routes (except auth login and public routes) require:

```
Authorization: Bearer <jwt>
```

---

## API overview by module

### Auth — `/api/auth`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/login` | Admin login → JWT |
| GET | `/me` | Current admin profile |

### Dashboard — `/api/dashboard`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats` | KPIs, recent orders, low stock, activity |

### Catalog
| Base | Description |
|------|-------------|
| `/api/products` | CRUD, bulk patch |
| `/api/products/import/*` | Templates, preview, run, history, error CSV |
| `/api/categories` | Category master data |
| `/api/brands` | Brand master data |
| `/api/unit-types` | Unit type master data |
| `/api/attributes` | Product attributes (variable products) |

### Media — `/api/media`
Upload, list, update, delete, usage lookup. Backfill endpoints for legacy product URL → media ID mapping:

- `GET /backfill/product-media-ids/dry-run`
- `POST /backfill/product-media-ids/apply`

### Customers — `/api/customers`
CRUD. **Delete is blocked (409)** when the customer has linked orders or return requests.

### Orders — `/api/orders`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Admin create order |
| GET | `/` | List with filters |
| GET | `/:id` | Detail (populates customer, shipping/payment snapshots, replacement links) |
| PUT | `/:id/status` | Order status |
| PUT | `/:id/payment-status` | Payment status |
| PUT | `/:id/fulfillment` | Fulfillment + tracking |
| DELETE | `/:id` | Delete order |

Orders store `shippingMethodSnapshot` and `paymentMethodSnapshot` at creation time for historical accuracy. Legacy orders fall back to populated refs or string `paymentMethod`.

### Returns — `/api/returns`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Create return/exchange request |
| GET | `/` | List |
| GET | `/:id` | Detail |
| PUT | `/:id/status` | Status workflow |
| POST | `/:id/replacement-order` | Create $0 replacement order (exchange) |
| PUT | `/:id/replacement-order` | Link existing order as replacement |
| DELETE | `/:id` | Delete request |

**Exchange workflow:** `approved` or `received` → create replacement order → set status to `exchanged` (requires linked `replacementOrder`). Original order fulfillment moves to `returned`.

### Cart & checkout — `/api/cart/:sessionId`
Session-based cart (no auth). `sessionId` is any client-generated string (e.g. UUID).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get or create cart |
| POST | `/items` | Add item `{ product, quantity }` |
| PUT | `/items/:productId` | Update quantity |
| DELETE | `/items/:productId` | Remove item |
| DELETE | `/` | Clear cart |
| POST | `/coupon` | Apply coupon |
| DELETE | `/coupon` | Remove coupon |
| GET | `/shipping-options` | Quote shipping for cart |
| PUT | `/shipping-method` | Select shipping method |
| GET | `/payment-options` | List payment options |
| PUT | `/payment-method` | Select payment method |
| POST | `/checkout` | Create order from cart |

**Checkout body:** `{ customer, notes?, shippingMethodId?, shippingMethodCode?, paymentMethodId?, paymentMethodCode? }`

When active shipping/payment methods exist and store toggles are enabled, checkout requires a valid selection.

### Public (no auth) — `/api/public`
| Path | Description |
|------|-------------|
| `/products`, `/products/:slug` | Published catalog |
| `/categories`, `/brands` | Catalog metadata |
| `/settings` | Public store identity (name, logo, currency display fields) |
| `/shipping-options` | Shipping quotes (query: subtotal, location, etc.) |
| `/payment-options` | Active payment methods |
| `/pages`, `/pages/:slug` | CMS pages |

### Store configuration
| Base | Description |
|------|-------------|
| `/api/settings` | Store settings (auth required) |
| `/api/shipping-methods` | Shipping method CRUD |
| `/api/payment-methods` | Payment method CRUD |
| `/api/coupons` | Coupon CRUD |

### Other
| Base | Description |
|------|-------------|
| `/api/pages` | CMS pages (admin) |
| `/api/redirects` | URL redirects |
| `/api/activity-logs` | Admin audit log (read-only) |
| `/api/admins` | Admin user management |
| `/api/uploads/products` | Legacy product image upload (superseded by Media Library) |

---

## Product import

**Source of truth:** `src/config/productImportSchema.js`

| Endpoint | Description |
|----------|-------------|
| `GET /api/products/import/template/csv` | Download CSV template |
| `GET /api/products/import/template/xlsx` | Download XLSX template (generated at runtime) |
| `POST /api/products/import/preview` | Upload file → validation preview + column mapping hints |
| `POST /api/products/import/run` | Commit import |
| `GET /api/products/import/history` | Past import runs |
| `GET /api/products/import/history/:id/errors-csv` | Failed rows export |

**Supported types:** `simple`, `variable`, `variation` rows in one file.

**Media on import:** Featured/gallery image URLs are matched to existing Media records or registered as import references; `featuredMediaId` / `galleryMediaIds` are set on commit while URL fields are preserved.

**Import instructions** in the XLSX template describe the live workflow: preview → mapping → commit → history.

**Not imported yet:** `seo_title`, `seo_description` (documented in template as future schema support).

---

## Shipping & payment integration

1. **Admin** creates methods under `/api/shipping-methods` and `/api/payment-methods`.
2. **Store settings** can enable/disable shipping and payment at checkout.
3. **Cart** quotes options based on subtotal, item count, and customer location.
4. **Checkout** snapshots selected method onto the order (`shippingMethodSnapshot`, `paymentMethodSnapshot`).
5. **Public API** exposes read-only option lists for a future storefront.

Free-shipping thresholds and method-specific rules live in `shippingMethodService.js` and `paymentMethodService.js`.

---

## Returns & replacement orders

| Concept | Behavior |
|---------|----------|
| `ReturnRequest.type` | `return` or `exchange` |
| Replacement order | `orderKind: "replacement"`, `totalAmount: 0`, `paymentStatus: paid` |
| Links | `sourceOrder`, `returnRequest`, `replacementOrder` cross-references |
| Stock | Replacement creation decrements product stock (simple product quantity) |
| Status `exchanged` | Requires `type === "exchange"` and linked `replacementOrder` |

`restockable` flag on return items is stored but does not yet trigger inventory restock on `received`.

---

## Known limitations & assumptions

- **No automated test suite** in this repository.
- **Simple product stock only** in cart checkout and replacement orders (`product.quantity`); variable/variation SKU stock is not fully handled.
- **Maintenance mode** field exists in store settings but is not enforced on `/api/public` or `/api/cart`.
- **Customer delete** returns `409` when orders or return requests exist.
- **Legacy upload route** `/api/uploads/products` remains for backward compatibility; Media Library is the preferred path.
- **Email** requires SMTP configuration; otherwise notifications are no-ops.
- **No payment gateway integration** — payment methods are configuration/selection records, not live payment processing.

---

## Suggested demo flow

End-to-end smoke test combining admin UI and API. Run backend + admin frontend together.

### 1. Bootstrap

```bash
# Terminal 1 — backend
cd reusable-ecommerce-backend
npm install && npm run seed:admin && npm run dev

# Terminal 2 — admin
cd reusable-ecommerce-admin
npm install && npm run dev
```

Login at `http://localhost:5173` with `admin@example.com` / `admin123`.

### 2. Admin setup (UI)

1. **Store Settings** — set currency, enable shipping/payment.
2. **Shipping Methods** — create e.g. "Standard Shipping" (active).
3. **Payment Methods** — create e.g. "Cash on Delivery" (active).
4. **Categories / Brands / Unit Types** — create masters for import/product assignment.
5. **Products** — publish at least one simple product with stock, or complete a **Product Import**.
6. **Customers** — create a customer with a shipping address.

### 3. Cart → checkout (API)

Replace `SESSION_ID`, `PRODUCT_ID`, `CUSTOMER_ID`, and method IDs with real values from your database or API responses.

```bash
BASE=http://localhost:5000
SESSION=demo-session-001

# Add to cart
curl -s -X POST "$BASE/api/cart/$SESSION/items" \
  -H "Content-Type: application/json" \
  -d '{"product":"<PRODUCT_ID>","quantity":1}'

# View cart
curl -s "$BASE/api/cart/$SESSION"

# Shipping options
curl -s "$BASE/api/cart/$SESSION/shipping-options"

# Select shipping (use id or code from options)
curl -s -X PUT "$BASE/api/cart/$SESSION/shipping-method" \
  -H "Content-Type: application/json" \
  -d '{"shippingMethodId":"<SHIPPING_METHOD_ID>"}'

# Payment options
curl -s "$BASE/api/cart/$SESSION/payment-options"

# Select payment
curl -s -X PUT "$BASE/api/cart/$SESSION/payment-method" \
  -H "Content-Type: application/json" \
  -d '{"paymentMethodId":"<PAYMENT_METHOD_ID>"}'

# Checkout
curl -s -X POST "$BASE/api/cart/$SESSION/checkout" \
  -H "Content-Type: application/json" \
  -d '{"customer":"<CUSTOMER_ID>","notes":"Demo order"}'
```

Confirm the order appears in admin **Orders** with shipping/payment snapshots.

### 4. Fulfillment & returns (UI)

1. Open the order → update fulfillment (packed → shipped → delivered) and optional tracking.
2. Create a **return/exchange** request from order detail.
3. For **exchange**: set status to `approved` → **Create replacement order** on return detail → set status to `exchanged`.
4. Verify replacement order banner on the new order and original order marked returned.

### 5. Guard rails

- Try deleting a customer with orders → expect `409` with explanatory message.
- Re-download import XLSX template → instructions should describe live import (not "future release").

---

## Related repository

| Repo | Role |
|------|------|
| `reusable-ecommerce-admin` | React admin SPA |

Both repos are designed to run as sibling directories under the same parent folder.
