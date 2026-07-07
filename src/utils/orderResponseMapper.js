const { getFulfillmentSnapshot } = require("./orderFulfillment");
const {
  buildTimelineFallback,
  getAllowedNextStatuses,
  getStatusLabel,
} = require("../services/orderLifecycleService");

const toPlainOrder = (orderDoc = {}) =>
  typeof orderDoc.toObject === "function" ? orderDoc.toObject({ virtuals: true }) : { ...orderDoc };

const mapVariantOptions = (options = {}) => {
  if (!options) return {};
  if (options instanceof Map) {
    return Object.fromEntries(options.entries());
  }
  return { ...options };
};

const mapOrderItems = (items = []) =>
  (Array.isArray(items) ? items : []).map((item) => ({
    product: item.product,
    variantId: item.variantId || null,
    productName: item.productName,
    variantTitle: item.variantTitle || "",
    variantOptions: mapVariantOptions(item.variantOptions),
    sku: item.sku,
    image: item.image || "",
    quantity: item.quantity,
    price: item.price,
    unitPrice: item.unitPrice ?? item.price,
    total: item.total,
    lineTotal: item.lineTotal ?? item.total,
  }));

const mapFulfillmentForResponse = (order = {}) => {
  const fulfillment = getFulfillmentSnapshot(order);

  return {
    ...fulfillment,
    courierName: fulfillment.carrier || fulfillment.courierName || "",
  };
};

const mapTimelineForAdmin = (order = {}) => {
  const timeline = buildTimelineFallback(order);

  return timeline.map((entry) => ({
    status: entry.status,
    label: entry.label || getStatusLabel(entry.status),
    message: entry.message || "",
    note: entry.note || "",
    createdAt: entry.createdAt,
    createdBy: entry.createdBy || null,
    actorType: entry.actorType || "system",
    metadata: entry.metadata || {},
  }));
};

const mapCustomerVisibleTimeline = (order = {}) =>
  mapTimelineForAdmin(order).filter((entry) => {
    const metadata = entry.metadata || {};
    return metadata.customerVisible !== false;
  });

const mapOrderForAdmin = (orderDoc = {}) => {
  const order = toPlainOrder(orderDoc);
  const fulfillment = mapFulfillmentForResponse(order);

  return {
    ...order,
    items: mapOrderItems(order.items),
    fulfillment,
    orderTimeline: mapTimelineForAdmin(order),
    adminNotes: Array.isArray(order.adminNotes) ? order.adminNotes : [],
    allowedNextStatuses: getAllowedNextStatuses(order),
    statusLabel: getStatusLabel(order.orderStatus),
    trackingNumber: fulfillment.trackingNumber,
    trackingUrl: fulfillment.trackingUrl,
    courierName: fulfillment.courierName,
    shippedAt: fulfillment.shippedAt,
    deliveredAt: fulfillment.deliveredAt,
  };
};

const mapOrderForPublic = (orderDoc = {}) => {
  const order = toPlainOrder(orderDoc);
  const fulfillment = mapFulfillmentForResponse(order);
  const status = order.orderStatus;

  const includeTracking = ["shipped", "out_for_delivery", "delivered"].includes(status);

  return {
    _id: order._id,
    orderNumber: order.orderNumber,
    orderStatus: status,
    statusLabel: getStatusLabel(status),
    paymentStatus: order.paymentStatus,
    items: mapOrderItems(order.items),
    subtotal: order.subtotal,
    taxAmount: order.taxAmount,
    shippingAmount: order.shippingAmount,
    discountAmount: order.discountAmount,
    totalAmount: order.totalAmount,
    couponCode: order.couponCode || "",
    paymentMethod: order.paymentMethod || "",
    shippingMethodSnapshot: order.shippingMethodSnapshot || null,
    paymentMethodSnapshot: order.paymentMethodSnapshot || null,
    shippingAddressSnapshot: order.shippingAddressSnapshot || {},
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    orderTimeline: mapCustomerVisibleTimeline(order),
    trackingNumber: includeTracking ? fulfillment.trackingNumber : "",
    trackingUrl: includeTracking ? fulfillment.trackingUrl : "",
    courierName: includeTracking ? fulfillment.courierName : "",
    shippedAt: includeTracking ? fulfillment.shippedAt : null,
    deliveredAt: status === "delivered" ? fulfillment.deliveredAt : null,
    cancelledAt: order.cancelledAt || null,
    refundedAt: order.refundedAt || null,
  };
};

module.exports = {
  mapOrderForAdmin,
  mapOrderForPublic,
  mapOrderItems,
  mapTimelineForAdmin,
  mapCustomerVisibleTimeline,
};
