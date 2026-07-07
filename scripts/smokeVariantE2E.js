/**
 * E2E variant QA script — run: node scripts/smokeVariantE2E.js
 * Requires backend on PORT (default 5000) and MongoDB.
 */
require("dotenv").config();

const BASE = `http://localhost:${process.env.PORT || 5000}`;
const SESSION = `qa-variant-${Date.now()}`;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const request = async (method, path, { body, token, expectError = false } = {}) => {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!expectError && (!response.ok || payload.success === false)) {
    throw new Error(
      `${method} ${path} failed (${response.status}): ${payload.message || response.statusText}`,
    );
  }
  return { response, payload, data: payload.data };
};

const main = async () => {
  console.log("=== Variant E2E QA ===\n");

  // 1. App health
  const health = await request("GET", "/");
  assert(health.payload.success === true, "Backend health check");

  // 2. Admin login
  const login = await request("POST", "/api/auth/login", {
    body: { email: "admin@example.com", password: "admin123" },
  });
  const token = login.data?.token;
  assert(token, "Admin login token");

  // 3. Category
  const categories = await request("GET", "/api/categories", { token });
  const categoryList = Array.isArray(categories.data)
    ? categories.data
    : categories.data?.categories || categories.data?.items || [];
  const category = categoryList.find((c) => c?.name) || categoryList[0];
  assert(category?._id, "Category for test product");

  const suffix = Date.now();
  const parentSku = `QA-HOODIE-PARENT-${suffix}`;

  // 4. Create variant product
  const create = await request("POST", "/api/products", {
    token,
    body: {
      name: `Variant QA Hoodie ${suffix}`,
      sku: parentSku,
      price: 2000,
      quantity: 0,
      category: category._id,
      status: "published",
      hasVariants: true,
      variants: [
        {
          sku: `QA-HOODIE-BLK-M-${suffix}`,
          title: "Black / M",
          options: { color: "Black", size: "M" },
          price: 2200,
          compareAtPrice: 2500,
          stockQuantity: 2,
          isActive: true,
          sortOrder: 0,
        },
        {
          sku: `QA-HOODIE-BLK-L-${suffix}`,
          title: "Black / L",
          options: { color: "Black", size: "L" },
          price: 2300,
          compareAtPrice: 2600,
          stockQuantity: 5,
          isActive: true,
          sortOrder: 1,
        },
        {
          sku: `QA-HOODIE-WHT-M-${suffix}`,
          title: "White / M",
          options: { color: "White", size: "M" },
          price: 2100,
          stockQuantity: 0,
          isActive: true,
          sortOrder: 2,
        },
      ],
    },
  });

  const product = create.data;
  const productId = product._id;
  const slug = product.slug;
  assert(product.hasVariants === true, "Product hasVariants");
  assert(product.variants?.length === 3, "Product has 3 variants");

  const variantA = product.variants.find((v) => v.title === "Black / M");
  const variantB = product.variants.find((v) => v.title === "Black / L");
  const variantC = product.variants.find((v) => v.title === "White / M");
  assert(variantA && variantB && variantC, "All variants created");

  // 5. Admin reload
  const adminGet = await request("GET", `/api/products/${productId}`, { token });
  const adminProduct = adminGet.data;
  assert(adminProduct.variants?.length === 3, "Admin reload shows 3 variants");

  // 6. Public API — active variants (includes out-of-stock active)
  const publicGet = await request("GET", `/api/public/products/${slug}`);
  const publicProduct = publicGet.data;
  assert(publicProduct.hasVariants === true, "Public hasVariants");
  assert(publicProduct.variants?.length === 3, "Public exposes active variants");
  const publicInactive = publicProduct.variants.every((v) => v.isActive !== false);
  assert(publicInactive, "Public variants are active only");

  // 7. Add without variantId — should fail
  const noVariant = await request(
    "POST",
    `/api/cart/${SESSION}/items`,
    { body: { productId, quantity: 1 }, expectError: true },
  );
  assert(noVariant.payload.success === false, "Add without variantId rejected");

  // 8. Add out-of-stock variant — should fail
  const outOfStock = await request(
    "POST",
    `/api/cart/${SESSION}/items`,
    {
      body: { productId, variantId: variantC.variantId || variantC._id, quantity: 1 },
      expectError: true,
    },
  );
  assert(outOfStock.payload.success === false, "Out-of-stock variant rejected");

  // 9. Add variant A and B
  await request("POST", `/api/cart/${SESSION}/items`, {
    body: { productId, variantId: variantA.variantId || variantA._id, quantity: 1 },
  });
  await request("POST", `/api/cart/${SESSION}/items`, {
    body: { productId, variantId: variantB.variantId || variantB._id, quantity: 1 },
  });

  const cart = await request("GET", `/api/cart/${SESSION}`);
  const items = cart.data?.items || [];
  assert(items.length === 2, "Two separate cart lines");

  const lineA = items.find(
    (i) => String(i.variantId) === String(variantA.variantId || variantA._id),
  );
  const lineB = items.find(
    (i) => String(i.variantId) === String(variantB.variantId || variantB._id),
  );
  assert(lineA && lineB, "Both variant lines present");
  assert(lineA.variantTitle === "Black / M", "variantTitle snapshot");
  assert(lineA.sku, "sku snapshot");
  assert(lineA.maxQuantity === 2, "variant A maxQuantity");
  assert(lineA.variantStockQuantity === 2, "variant A variantStockQuantity");
  assert(lineA.inStock === true, "variant A inStock");
  assert(lineB.maxQuantity === 5, "variant B maxQuantity");

  // 10. Quantity update beyond stock — should fail
  const overQty = await request(
    "PUT",
    `/api/cart/${SESSION}/items/${productId}`,
    {
      body: { quantity: 3, variantId: variantA.variantId || variantA._id },
      expectError: true,
    },
  );
  assert(overQty.payload.success === false, "Over-stock quantity update rejected");

  // 11. Simple product cart
  const simpleSku = `QA-SIMPLE-${suffix}`;
  const simpleCreate = await request("POST", "/api/products", {
    token,
    body: {
      name: `Variant QA Simple Tee ${suffix}`,
      sku: simpleSku,
      price: 500,
      quantity: 10,
      category: category._id,
      status: "published",
    },
  });
  const simpleId = simpleCreate.data._id;
  const simpleSession = `${SESSION}-simple`;
  await request("POST", `/api/cart/${simpleSession}/items`, {
    body: { productId: simpleId, quantity: 1 },
  });
  const simpleCart = await request("GET", `/api/cart/${simpleSession}`);
  const simpleItem = simpleCart.data?.items?.[0];
  assert(simpleItem && !simpleItem.variantId, "Simple cart item has no variantId");
  assert(simpleItem.maxQuantity === 10, "Simple product maxQuantity");

  // 12. Checkout variant cart
  const customer = await request("POST", "/api/public/customers/checkout", {
    body: {
      firstName: "QA",
      lastName: "Tester",
      email: `qa-${suffix}@example.com`,
      phone: "9999999999",
      address: {
        street: "1 Test St",
        city: "Mumbai",
        state: "MH",
        postalCode: "400001",
        country: "IN",
      },
    },
  });
  const customerId = customer.data?._id;
  assert(customerId, "Customer created");

  const paymentOpts = await request("GET", `/api/cart/${SESSION}/payment-options`);
  const paymentMethods = paymentOpts.data?.paymentOptions || [];
  assert(paymentMethods.length > 0, "Payment methods available");
  const paymentMethodId = paymentMethods[0].id || paymentMethods[0]._id;

  const checkout = await request("POST", `/api/cart/${SESSION}/checkout`, {
    body: { customer: customerId, paymentMethodId },
  });
  const order = checkout.data?.order;
  assert(order?._id, "Order created");
  assert(order.items?.length === 2, "Order has 2 variant items");

  const orderItemA = order.items.find((i) => i.variantTitle === "Black / M");
  assert(orderItemA?.sku, "Order item variant sku");
  assert(orderItemA?.variantTitle === "Black / M", "Order item variant title");

  // 13. Stock deduction
  const afterCheckout = await request("GET", `/api/products/${productId}`, { token });
  const vAStock = afterCheckout.data.variants.find(
    (v) => String(v.variantId || v._id) === String(variantA.variantId || variantA._id),
  );
  const vBStock = afterCheckout.data.variants.find(
    (v) => String(v.variantId || v._id) === String(variantB.variantId || variantB._id),
  );
  assert(Number(vAStock?.stockQuantity) === 1, "Variant A stock deducted to 1");
  assert(Number(vBStock?.stockQuantity) === 4, "Variant B stock deducted to 4");

  // 14. Order cancel restores stock
  await request("PUT", `/api/orders/${order._id}/status`, {
    token,
    body: { orderStatus: "cancelled" },
  });
  const afterCancel = await request("GET", `/api/products/${productId}`, { token });
  const vArestored = afterCancel.data.variants.find(
    (v) => String(v.variantId || v._id) === String(variantA.variantId || variantA._id),
  );
  const vBrestored = afterCancel.data.variants.find(
    (v) => String(v.variantId || v._id) === String(variantB.variantId || variantB._id),
  );
  assert(Number(vArestored?.stockQuantity) === 2, "Variant A stock restored");
  assert(Number(vBrestored?.stockQuantity) === 5, "Variant B stock restored");

  // Cleanup test products
  await request("DELETE", `/api/products/${productId}`, { token });
  await request("DELETE", `/api/products/${simpleId}`, { token });

  console.log("\nAll E2E variant QA checks passed.");
  console.log(`Test product slug: ${slug}`);
  console.log(`Session used: ${SESSION}`);
};

main().catch((error) => {
  console.error("\nE2E QA FAILED:", error.message);
  process.exit(1);
});
