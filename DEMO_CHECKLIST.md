# Cross-repo demo checklist

Use this checklist to run a full **backend + admin + storefront** demo. All three repos should be sibling directories under the same parent folder.

## 1. Start infrastructure

- [ ] MongoDB is running (local or Atlas)
- [ ] Backend `.env` configured (`MONGO_URI`, `JWT_SECRET`)
- [ ] Run `npm run seed:admin` on first setup
- [ ] (Optional) Run `npm run seed:store` if store settings do not exist yet

## 2. Start services (recommended order)

| Terminal | Directory | Command | URL |
|----------|-----------|---------|-----|
| 1 | `reusable-ecommerce-backend` | `npm run dev` | http://localhost:5000 |
| 2 | `reusable-ecommerce-admin` | `npm run dev` | http://localhost:5173 |
| 3 | `reusable-ecommerce-storefront` | `npm run dev` | http://localhost:5173 or **5174** if admin uses 5173 |

Verify backend: `GET http://localhost:5000/` returns success.

## 3. Admin setup (before storefront demo)

Log in at http://localhost:5173 with **local demo credentials only**:

- Email: `admin@example.com`
- Password: `admin123`

Then confirm in admin:

- [ ] **Store settings** saved — store name, tagline, currency, contact details
- [ ] **Logo** and **favicon/site icon** set (Media Library or URL)
- [ ] **Home CMS page** published — slug `home`, page type `homepage`, banners + category showcase + dual promo + final CTA
- [ ] **Shop CMS page** created/published if custom `/shop` cover is needed — slug `shop`, status published, featured image set
- [ ] **Categories** ready with hierarchy and images where needed
- [ ] **At least one published product** with stock > 0
- [ ] **At least one active payment method**
- [ ] **Shipping** — optional; enable in Store Settings + add shipping methods only if you need a delivery demo

## 4. Storefront customer flow

Open the storefront (http://localhost:5173 or http://localhost:5174).

- [ ] **Homepage** loads — CMS banners, category showcase, deduped product rows, icon category nav
- [ ] Scroll down/up — category icons hide/show smoothly; no mega menu or dropdowns
- [ ] **Shop** (`/shop`) — browse, search, category filter, sort
- [ ] **Shop cover** — custom image appears if Shop CMS page is published; fallback otherwise
- [ ] **Categories** (`/categories`) — browse root departments
- [ ] **Product detail** — open a product by slug
- [ ] **Add to cart** and **Buy Now** from PDP
- [ ] **Cart** — line items, payment selection when required
- [ ] **Checkout** — guest customer details, shipping if enabled, payment, place order
- [ ] **Order success** page appears; cart clears

## 5. Confirm in admin

- [ ] New order appears in **Orders**
- [ ] Order shows customer, line items, and shipping/payment snapshots

## 6. Quick API smoke (optional)

```bash
# Health
curl http://localhost:5000/

# Public settings and CMS
curl http://localhost:5000/api/public/settings
curl http://localhost:5000/api/public/pages/home
curl http://localhost:5000/api/public/pages/shop

# Public catalog
curl "http://localhost:5000/api/public/products?limit=1"
curl http://localhost:5000/api/public/categories
```

Guest checkout uses:

- `POST /api/public/customers/checkout` — upsert guest customer (returns customer id)
- `POST /api/cart/:sessionId/checkout` — convert cart to order (`customer` id + payment method; shipping when enabled)

See [README.md](./README.md) for full API details.

## Production reminder

Before any shared or production deployment:

- Change default admin password
- Rotate `JWT_SECRET`
- Restrict CORS to known admin/storefront origins
- Configure payment methods and shipping properly for your market
- See **Security & production** in each repo README
