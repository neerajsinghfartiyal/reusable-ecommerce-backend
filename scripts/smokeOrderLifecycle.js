/**
 * Order lifecycle smoke — run: node scripts/smokeOrderLifecycle.js
 * Requires backend on PORT (default 5000) and MongoDB.
 */
require("dotenv").config();

const BASE = `http://localhost:${process.env.PORT || 5000}`;

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
  console.log("=== Order Lifecycle Smoke ===\n");

  const health = await request("GET", "/");
  assert(health.payload.success === true, "Backend health check");

  const login = await request("POST", "/api/auth/login", {
    body: { email: "admin@example.com", password: "admin123" },
  });
  const token = login.data?.token;
  assert(token, "Admin login token");

  const categories = await request("GET", "/api/categories", { token });
  const categoryList = Array.isArray(categories.data)
    ? categories.data
    : categories.data?.categories || categories.data?.items || [];
  const category = categoryList.find((c) => c?.name) || categoryList[0];
  assert(category?._id, "Category for test product");

  const suffix = Date.now();
  const session = `qa-order-life-${suffix}`;

  const simpleCreate = await request("POST", "/api/products", {
    token,
    body: {
      name: `Order Lifecycle Tee ${suffix}`,
      sku: `QA-ORDER-TEE-${suffix}`,
      price: 500,
      quantity: 20,
      category: category._id,
      status: "published",
    },
  });
  const productId = simpleCreate.data._id;
  const initialStock = Number(simpleCreate.data.quantity);

  await request("POST", `/api/cart/${session}/items`, {
    body: { productId, quantity: 1 },
  });

  const customer = await request("POST", "/api/public/customers/checkout", {
    body: {
      firstName: "Order",
      lastName: "Lifecycle",
      email: `qa-order-${suffix}@example.com`,
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

  const paymentOpts = await request("GET", `/api/cart/${session}/payment-options`);
  const paymentMethods = paymentOpts.data?.paymentOptions || [];
  assert(paymentMethods.length > 0, "Payment methods available");
  const paymentMethodId = paymentMethods[0].id || paymentMethods[0]._id;

  const checkout = await request("POST", `/api/cart/${session}/checkout`, {
    body: { customer: customerId, paymentMethodId },
  });
  const publicOrder = checkout.data?.order;
  assert(publicOrder?._id, "Checkout order created");
  assert(Array.isArray(publicOrder.orderTimeline) && publicOrder.orderTimeline.length > 0, "Public order has timeline");
  assert(publicOrder.adminNotes === undefined, "Public order does not expose adminNotes");

  const orderId = publicOrder._id;
  let timelineLength = publicOrder.orderTimeline.length;

  const confirmed = await request("PUT", `/api/orders/${orderId}/status`, {
    token,
    body: { orderStatus: "confirmed" },
  });
  assert(confirmed.data.orderStatus === "confirmed", "pending → confirmed");
  assert(confirmed.data.orderTimeline.length > timelineLength, "Timeline grows after confirmed");
  timelineLength = confirmed.data.orderTimeline.length;

  const processing = await request("PUT", `/api/orders/${orderId}/status`, {
    token,
    body: { orderStatus: "processing" },
  });
  assert(processing.data.orderStatus === "processing", "confirmed → processing");
  timelineLength = processing.data.orderTimeline.length;

  const tracking = await request("PUT", `/api/orders/${orderId}/tracking`, {
    token,
    body: {
      courierName: "QA Courier",
      trackingNumber: `TRK-${suffix}`,
      trackingUrl: `https://tracking.example.com/${suffix}`,
      note: "Smoke tracking update",
    },
  });
  assert(tracking.data.orderStatus === "shipped", "Tracking moves order to shipped");
  assert(tracking.data.trackingNumber === `TRK-${suffix}`, "Tracking number saved");
  assert(tracking.data.orderTimeline.length > timelineLength, "Timeline grows after tracking");
  timelineLength = tracking.data.orderTimeline.length;

  const note = await request("POST", `/api/orders/${orderId}/notes`, {
    token,
    body: { note: "Internal QA note", isPrivate: true },
  });
  assert(note.data.adminNotes?.length >= 1, "Admin note added");

  const payment = await request("PUT", `/api/orders/${orderId}/payment-status`, {
    token,
    body: { paymentStatus: "paid", paymentReference: `PAY-${suffix}` },
  });
  assert(payment.data.paymentStatus === "paid", "Payment status updated");

  const cancelSession = `${session}-cancel`;
  await request("POST", `/api/cart/${cancelSession}/items`, {
    body: { productId, quantity: 2 },
  });

  const cancelCheckout = await request("POST", `/api/cart/${cancelSession}/checkout`, {
    body: { customer: customerId, paymentMethodId },
  });
  const cancelOrderId = cancelCheckout.data?.order?._id;
  assert(cancelOrderId, "Cancel-test order created");

  const afterCheckoutProduct = await request("GET", `/api/products/${productId}`, { token });
  const stockAfterCheckout = Number(afterCheckoutProduct.data.quantity);
  assert(stockAfterCheckout === initialStock - 3, "Stock deducted for lifecycle + cancel orders");

  const cancelled = await request("PUT", `/api/orders/${cancelOrderId}/status`, {
    token,
    body: { orderStatus: "cancelled", reason: "QA cancellation" },
  });
  assert(cancelled.data.orderStatus === "cancelled", "Pending order cancelled");
  assert(cancelled.data.inventoryRestored === true, "inventoryRestored flag set");

  const afterCancelProduct = await request("GET", `/api/products/${productId}`, { token });
  const stockAfterCancel = Number(afterCancelProduct.data.quantity);
  assert(stockAfterCancel === initialStock - 1, "Stock restored once after cancel");

  const invalid = await request("PUT", `/api/orders/${cancelOrderId}/status`, {
    token,
    body: { orderStatus: "processing" },
    expectError: true,
  });
  assert(invalid.payload.success === false, "Invalid transition after cancelled rejected");

  const refund = await request("POST", `/api/orders/${orderId}/refund`, {
    token,
    body: {
      refundAmount: publicOrder.totalAmount,
      refundReference: `REF-${suffix}`,
      paymentStatus: "refunded",
      note: "Smoke refund groundwork",
    },
  });
  assert(refund.data.paymentStatus === "refunded", "Refund groundwork recorded");
  assert(refund.data.refundReference === `REF-${suffix}`, "Refund reference saved");

  await request("DELETE", `/api/products/${productId}`, { token });

  console.log("\nOrder lifecycle smoke completed successfully.");
};

main().catch((error) => {
  console.error("\nOrder lifecycle smoke FAILED:", error.message);
  process.exit(1);
});
