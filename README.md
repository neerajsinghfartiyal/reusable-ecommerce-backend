# Reusable eCommerce Backend

Node.js / Express / MongoDB REST API for the **Reusable eCommerce** platform (demo-branded as **VELMORA** in seed defaults). Powers catalog, CMS, media, cart, guest checkout, orders, returns, and admin authentication.

Pairs with:

- [`reusable-ecommerce-admin`](../reusable-ecommerce-admin) — React admin panel
- [`reusable-ecommerce-storefront`](../reusable-ecommerce-storefront) — React customer storefront (VELMORA)

**API-first commerce:** admin APIs manage catalog and operations; **public storefront APIs** power the customer site (products, categories, CMS pages, settings, cart sessions, shipping/payment selection, guest checkout).

For a full local demo walkthrough, see **[DEMO_CHECKLIST.md](./DEMO_CHECKLIST.md)**.

---

## Role in the platform

| Concern | Backend responsibility |
|---------|------------------------|
| Catalog | Products, categories (hierarchy), brands, attributes |
| Content | CMS pages (home, shop, static), media library |
| Store identity | Public store settings (name, logo, favicon, currency, contact) |
| Commerce | Session cart, guest customer upsert, checkout → orders |
| Operations | Admin auth, payment/shipping methods, coupons, returns |
| Import | CSV/XLSX product import with category path resolution |

The **storefront** and **admin** are separate frontends; both consume this API.

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

## Local setup

```bash
npm install
cp .env.example .env
npm run seed:admin      # default admin (first run)
npm run seed:store      # optional: demo store settings if none exist
npm run dev             # nodemon, default port 5000
```

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with nodemon |
| `npm start` | Production start |
| `npm run seed:admin` | Seed default super admin |
| `npm run seed:store` | Seed demo store settings (VELMORA) if collection is empty |
| `npm run fix:category-indexes` | Drop legacy global `name` index; ensure `{ parent, name }` unique |
| `npm run generate:import-template-xlsx` | Write static XLSX to disk (runtime templates also available via API) |
| `npm run smoke:variants` | Helper + optional DB smoke for product variants foundation |

Verify app loads:

```bash
node -e "require('./src/app')"
```

Verify server: `GET http://localhost:5000/` → `{ success: true, message: "Reusable eCommerce backend API is running" }`

---

## Environment variables

Create a `.env` file in the project root (see `.env.example`):

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

Static uploaded files are served from `/uploads`.

---

## Security & demo warnings

> **Local demos only:** Default admin is `admin@example.com` / `admin123` after `npm run seed:admin`.

Before any shared or production deployment:

- Change the default admin password immediately
- Use a long, random `JWT_SECRET` (never commit real secrets)
- Restrict **CORS** to known admin and storefront origins
- Configure **payment methods** and **shipping** appropriately for your market
- Use HTTPS and secure MongoDB access
- There is **no live payment gateway** — payment methods are selection records only

---

## Demo data requirements

Before a storefront checkout demo will succeed:

| Requirement | Notes |
|-------------|--------|
| Published product | `status: published`, stock > 0 for simple products |
| Active payment method | At least one method enabled when checkout requires payment |
| Shipping | **Optional** — controlled by Store Settings `shippingEnabled`. When disabled, checkout proceeds without shipping method selection |
| Store settings | Currency, store name, logo/favicon via admin or `npm run seed:store` |
| CMS home page | Publish slug `home` for full homepage CMS (storefront falls back if missing) |
| CMS shop page | Publish slug `shop` for custom `/shop` cover image (optional) |

---

## MongoDB setup

1. Start MongoDB locally, or create a free Atlas cluster.
2. Set `MONGO_URI` to your database.
3. Collections are created automatically by Mongoose on first use.
4. Run `npm run seed:admin` before first admin login.

### Default admin seed

| Field | Value |
|-------|-------|
| Email | `admin@example.com` |
| Password | `admin123` |
| Role | `super_admin` |

Idempotent: skips if `admin@example.com` already exists.

---

## Main modules

### Auth — `/api/auth`
Admin JWT login and profile.

### Store settings — `/api/settings`, `/api/public/settings`
Store name, tagline, logo, favicon, currency, contact, tax/shipping toggles. Public read for storefront branding.

### Media library — `/api/media`
Upload, list, folders, usage lookup. Preferred path for product/CMS images.

**Supported formats:** JPG, JPEG, PNG, WebP, SVG  
**Size limits:** Media uploads **10 MB**; legacy product uploads **5 MB**

### CMS pages — `/api/pages` (admin), `/api/public/pages` (storefront)
Slug-based pages. Important slugs:

| Slug | Purpose |
|------|---------|
| `home` | Homepage sections (banners, category showcase, promos, CTA) |
| `shop` | Shop page featured image / cover for storefront `/shop` |

Public routes: `GET /api/public/pages/home`, `GET /api/public/pages/:slug`

### Categories — `/api/categories`, `/api/public/categories`
Hierarchical category master data.

### Products — `/api/products`, `/api/public/products`
CRUD, bulk patch, public catalog with filters (category includes descendants).

**Product variants (Phase 1 — backend foundation):**

- Simple products (`hasVariants: false` or omitted) continue to use product-level `price`, `salePrice`, and `quantity`.
- Variant products store purchasable options on `variants[]` (`sku`, `title`, `options`, `price`, `compareAtPrice`, `stockQuantity`, `image`, `isActive`, `sortOrder`).
- Public product APIs expose `hasVariants` and **active** `variants` only. Admin APIs expose all variants.
- Legacy import variable products still use `variations[]`; helpers resolve either `variants[]` or `variations[]` for purchase/stock.
- Admin and storefront UIs for variant management/selection are planned for later phases.

### Product import — `/api/products/import/*`
CSV/XLSX templates, preview, commit, history, error export. Imported rows still default to simple products; variable import continues to populate `variations[]`. Direct `variants[]` import is planned for a later phase.

### Cart & guest checkout — `/api/cart/:sessionId`
Session-based cart (no auth). Guest customer upsert at `POST /api/public/customers/checkout`. Checkout at `POST /api/cart/:sessionId/checkout`.

Cart items optionally store `variantId` plus variant title/options snapshots. Add variant products with `variantId` in the request body; simple products work unchanged without `variantId`. Same product + different variants create separate cart lines.

### Orders — `/api/orders`
Order management, fulfillment, payment status, snapshots.

### Payment methods — `/api/payment-methods`
Active methods quoted at checkout when required.

### Shipping methods — `/api/shipping-methods`
Active methods quoted when `shippingEnabled` is true in store settings.

---

## Category hierarchy

Categories support up to three practical levels:

| Level | Example | `parent` |
|-------|---------|----------|
| Root (parent category) | Fashion | `null` |
| Subcategory | Men | Fashion id |
| Child category | T-Shirts | Men id |

**Rules:**

- **Same subcategory name under different parents is allowed** (e.g. `Accessories` under Fashion and under Electronics). Uniqueness is scoped to siblings: compound index `{ parent, name }`.
- **Products are assigned to the deepest category** provided (child if set, else sub, else main).
- **Public product filter** by category id includes **descendant categories** (filtering Fashion returns products in Men, T-Shirts, etc.).
- **Legacy flat names** like `Fashion / Men` can be normalized with `scripts/normalizeCategories.js`.

If category create/update fails with a legacy global name index error, run:

```bash
npm run fix:category-indexes
# or dry-run: node scripts/fixCategoryIndexes.js --dry-run
```

---

## Product import

**Source of truth:** `src/config/productImportSchema.js`

| Endpoint | Description |
|----------|-------------|
| `GET /api/products/import/template/csv` | Download CSV template |
| `GET /api/products/import/template/xlsx` | Download XLSX template |
| `POST /api/products/import/preview` | Upload file → validation preview |
| `POST /api/products/import/run` | Commit import |
| `GET /api/products/import/history` | Past import runs |

### Category columns

Use **either** a legacy path **or** hierarchical columns:

| Column | Description |
|--------|-------------|
| `category` | Legacy path string, e.g. `Fashion > Men > T-Shirts` or `Apparel > Tees` |
| `main_category` | Root category name (parent null) |
| `sub_category` | Second level under main |
| `child_category` | Deepest level; **product assigned here** when provided |

Import resolves or creates category paths and assigns the product to the deepest resolved category.

**Supported product types:** `simple`, `variable`, `variation` rows in one file.

**Media on import:** Image URLs matched to Media records or registered as import references.

---

## Maintenance scripts

| Script | Purpose |
|--------|---------|
| `node scripts/normalizeCategories.js` | Dry-run plan to migrate legacy flat category names into hierarchy |
| `node scripts/normalizeCategories.js --apply` | Apply normalization (reassign products; does not auto-delete) |
| `node scripts/fixCategoryIndexes.js` | Fix MongoDB indexes for sibling-scoped category names |
| `node scripts/fixCategoryIndexes.js --dry-run` | Report index changes without applying |
| `npm run seed:store` | Seed VELMORA demo store settings if none exist |

---

## API response format

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

## Public API (storefront) — `/api/public`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/products`, `/products/:slug` | Published catalog |
| GET | `/categories`, `/brands` | Catalog metadata |
| GET | `/settings` | Store name, logo, favicon, currency, contact |
| GET | `/pages/home` | Homepage CMS sections |
| GET | `/pages/:slug` | CMS page by slug (e.g. `shop`) |
| GET | `/shipping-options` | Shipping quotes |
| GET | `/payment-options` | Active payment methods |
| POST | `/customers/checkout` | Guest customer upsert |

### Cart checkout flow

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/public/customers/checkout` | Upsert guest customer → returns customer `_id` |
| POST | `/api/cart/:sessionId/checkout` | Create order (`customer` id, `paymentMethodId`; `shippingMethodId` when shipping enabled) |

---

## Cart API — `/api/cart/:sessionId`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get or create cart |
| POST | `/items` | Add item (`productId`, `quantity`, optional `variantId`) |
| PUT | `/items/:productId` | Update quantity (optional `variantId` in body or query) |
| DELETE | `/items/:productId` | Remove item (optional `variantId` in body or query) |
| GET | `/shipping-options` | Quote shipping |
| PUT | `/shipping-method` | Select shipping |
| GET | `/payment-options` | List payment options |
| PUT | `/payment-method` | Select payment |
| POST | `/checkout` | Create order |

---

## Known limitations

- **No automated test suite** in this repository (use `npm run smoke:variants` for variant foundation checks).
- **Variant UI** is not implemented in admin or storefront yet — APIs accept/return variant data for future UI phases.
- **Product import** does not populate `variants[]` yet; variable rows still map to legacy `variations[]`.
- **Maintenance mode** field exists but is not enforced on public/cart routes yet.
- **No payment gateway integration** — methods are configuration/selection only.
- **Email** requires SMTP; otherwise notifications are skipped.

---

## Suggested demo flow

See **[DEMO_CHECKLIST.md](./DEMO_CHECKLIST.md)** for the full cross-repo checklist.

```bash
# Terminal 1 — backend
cd reusable-ecommerce-backend && npm install && cp .env.example .env && npm run seed:admin && npm run dev

# Terminal 2 — admin
cd reusable-ecommerce-admin && npm install && cp .env.example .env && npm run dev

# Terminal 3 — storefront
cd reusable-ecommerce-storefront && npm install && cp .env.example .env && npm run dev
```

- Admin: http://localhost:5173 — `admin@example.com` / `admin123` (**local only**)
- Storefront: http://localhost:5174 (if admin uses 5173)
- Backend: http://localhost:5000

---

## Related repositories

| Repo | Role |
|------|------|
| `reusable-ecommerce-admin` | React admin SPA |
| `reusable-ecommerce-storefront` | React customer storefront (VELMORA) |

All three repos are designed to run as sibling directories under the same parent folder.
