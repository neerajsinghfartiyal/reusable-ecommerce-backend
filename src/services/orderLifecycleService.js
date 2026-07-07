const { normalizeText, getFulfillmentSnapshot } = require("../utils/orderFulfillment");
const { restorePurchasableStock } = require("./productInventoryService");

const ORDER_STATUS_OPTIONS = [
  "pending",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "return_requested",
  "returned",
  "refunded",
];

const PAYMENT_STATUS_OPTIONS = [
  "pending",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
  "cod_pending",
];

const TERMINAL_ORDER_STATUSES = ["cancelled", "refunded"];

const STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  return_requested: "Return requested",
  returned: "Returned",
  refunded: "Refunded",
};

const ALLOWED_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered"],
  out_for_delivery: ["delivered"],
  delivered: ["return_requested"],
  return_requested: ["returned", "refunded"],
  returned: ["refunded"],
  cancelled: [],
  refunded: [],
};

const PRE_SHIPMENT_STATUSES = new Set([
  "pending",
  "confirmed",
  "processing",
  "packed",
]);

const SHIPPED_LIKE_STATUSES = new Set(["shipped", "out_for_delivery", "delivered"]);

const normalizeOrderStatus = (status) => normalizeText(status).toLowerCase();

const getStatusLabel = (status) => STATUS_LABELS[normalizeOrderStatus(status)] || status || "Updated";

const validateOrderStatusTransition = (currentStatus, nextStatus, options = {}) => {
  const current = normalizeOrderStatus(currentStatus);
  const next = normalizeOrderStatus(nextStatus);

  if (!next) {
    return { valid: false, error: "Next status is required." };
  }

  if (!ORDER_STATUS_OPTIONS.includes(next)) {
    return { valid: false, error: "Invalid order status." };
  }

  if (current === next) {
    return { valid: true, unchanged: true };
  }

  if (TERMINAL_ORDER_STATUSES.includes(current)) {
    if (options.allowAdminOverride && options.reason) {
      return { valid: true, overridden: true };
    }

    return {
      valid: false,
      error: `Order status is final (${current}) and cannot be changed.`,
    };
  }

  const allowed = ALLOWED_TRANSITIONS[current] || [];

  if (allowed.includes(next)) {
    return { valid: true };
  }

  if (options.allowAdminOverride && options.reason) {
    return { valid: true, overridden: true };
  }

  return {
    valid: false,
    error: `Cannot transition order from ${current} to ${next}.`,
  };
};

const getAllowedNextStatuses = (order = {}) => {
  const current = normalizeOrderStatus(order.orderStatus);

  if (TERMINAL_ORDER_STATUSES.includes(current)) {
    return [];
  }

  return [...(ALLOWED_TRANSITIONS[current] || [])];
};

const buildTimelineEntry = ({
  status,
  label,
  message,
  note = "",
  createdBy = null,
  actorType = "system",
  metadata = {},
}) => ({
  status: status || "",
  label: label || getStatusLabel(status),
  message: message || "",
  note: normalizeText(note),
  createdAt: new Date(),
  createdBy: createdBy || null,
  actorType,
  metadata: metadata && typeof metadata === "object" ? metadata : {},
});

const shouldSkipTimelineDuplicate = (order, entry) => {
  const timeline = Array.isArray(order.orderTimeline) ? order.orderTimeline : [];
  const last = timeline[timeline.length - 1];

  if (!last) {
    return false;
  }

  return (
    normalizeOrderStatus(last.status) === normalizeOrderStatus(entry.status) &&
    normalizeText(last.message) === normalizeText(entry.message) &&
    normalizeText(last.note) === normalizeText(entry.note)
  );
};

const appendTimelineEvent = (order, entry) => {
  if (!order.orderTimeline) {
    order.orderTimeline = [];
  }

  if (shouldSkipTimelineDuplicate(order, entry)) {
    return order;
  }

  order.orderTimeline.push(entry);
  return order;
};

const syncFulfillmentFromOrderStatus = (order, nextStatus) => {
  const fulfillment = getFulfillmentSnapshot(order);
  const status = normalizeOrderStatus(nextStatus);
  const now = new Date();

  if (status === "processing" || status === "confirmed") {
    fulfillment.status = status === "confirmed" ? fulfillment.status || "unfulfilled" : "processing";
  }

  if (status === "packed") {
    fulfillment.status = "packed";
  }

  if (["shipped", "out_for_delivery"].includes(status)) {
    fulfillment.status = "shipped";
    if (!fulfillment.shippedAt) {
      fulfillment.shippedAt = now;
    }
  }

  if (status === "delivered") {
    fulfillment.status = "delivered";
    if (!fulfillment.shippedAt) {
      fulfillment.shippedAt = now;
    }
    if (!fulfillment.deliveredAt) {
      fulfillment.deliveredAt = now;
    }
  }

  if (status === "returned") {
    fulfillment.status = "returned";
  }

  order.fulfillment = fulfillment;
  return order;
};

const shouldRestoreStockForCancellation = (order = {}) => {
  const status = normalizeOrderStatus(order.orderStatus);
  const fulfillment = getFulfillmentSnapshot(order);

  if (SHIPPED_LIKE_STATUSES.has(status)) {
    return false;
  }

  if (["shipped", "delivered", "returned"].includes(fulfillment.status)) {
    return false;
  }

  return PRE_SHIPMENT_STATUSES.has(status) || status === "cancelled";
};

const restoreOrderInventoryIfNeeded = async (order) => {
  if (order.inventoryRestored) {
    return { restored: false, reason: "already_restored" };
  }

  if (!shouldRestoreStockForCancellation(order)) {
    return { restored: false, reason: "not_eligible" };
  }

  for (const item of order.items || []) {
    await restorePurchasableStock(item.product, item.variantId || null, item.quantity);
  }

  order.inventoryRestored = true;
  return { restored: true };
};

const applyOrderStatusChange = async (order, nextStatus, actor = {}) => {
  const current = normalizeOrderStatus(order.orderStatus);
  const next = normalizeOrderStatus(nextStatus);
  const validation = validateOrderStatusTransition(current, next, actor);

  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  if (validation.unchanged) {
    return { success: true, order, unchanged: true };
  }

  const willCancel = next === "cancelled" && current !== "cancelled";

  if (willCancel) {
    const fulfillment = getFulfillmentSnapshot(order);
    if (["shipped", "delivered", "returned"].includes(fulfillment.status)) {
      return {
        success: false,
        error:
          "Shipped or delivered orders cannot be cancelled. Use returns and refund workflows instead.",
      };
    }

    await restoreOrderInventoryIfNeeded(order);
    order.cancelledAt = new Date();
    if (actor.reason) {
      order.cancellationReason = normalizeText(actor.reason);
    }
  }

  if (next === "return_requested" && actor.reason) {
    order.returnReason = normalizeText(actor.reason);
  }

  if (next === "refunded") {
    order.refundedAt = order.refundedAt || new Date();
  }

  if (next === "delivered") {
    syncFulfillmentFromOrderStatus(order, "delivered");
  } else if (["shipped", "out_for_delivery", "packed", "processing", "confirmed"].includes(next)) {
    syncFulfillmentFromOrderStatus(order, next);
  }

  order.orderStatus = next;

  const timelineMessage =
    actor.message ||
    (validation.overridden
      ? `Status overridden to ${getStatusLabel(next)}`
      : `Order status changed to ${getStatusLabel(next)}`);

  appendTimelineEvent(
    order,
    buildTimelineEntry({
      status: next,
      label: getStatusLabel(next),
      message: timelineMessage,
      note: actor.note || actor.reason || "",
      createdBy: actor.createdBy || null,
      actorType: actor.actorType || "admin",
      metadata: {
        previousStatus: current,
        overridden: Boolean(validation.overridden),
        ...(actor.metadata || {}),
      },
    }),
  );

  return { success: true, order };
};

const initializeOrderLifecycle = (order, actor = {}) => {
  const status = normalizeOrderStatus(order.orderStatus) || "pending";

  if (!Array.isArray(order.orderTimeline) || order.orderTimeline.length === 0) {
    order.orderTimeline = [
      buildTimelineEntry({
        status,
        label: getStatusLabel(status),
        message: actor.message || "Order created",
        note: actor.note || "",
        createdBy: actor.createdBy || null,
        actorType: actor.actorType || "system",
        metadata: actor.metadata || {},
      }),
    ];
  }

  if (order.inventoryRestored === undefined) {
    order.inventoryRestored = false;
  }

  return order;
};

const buildTimelineFallback = (order = {}) => {
  const existing = Array.isArray(order.orderTimeline) ? order.orderTimeline : [];

  if (existing.length > 0) {
    return existing;
  }

  const status = normalizeOrderStatus(order.orderStatus) || "pending";
  const events = [
    buildTimelineEntry({
      status,
      label: getStatusLabel(status),
      message: "Order recorded",
      actorType: "system",
      createdAt: order.createdAt || new Date(),
    }),
  ];

  if (order.cancelledAt) {
    events.push(
      buildTimelineEntry({
        status: "cancelled",
        label: getStatusLabel("cancelled"),
        message: "Order cancelled",
        note: order.cancellationReason || "",
        actorType: "system",
        createdAt: order.cancelledAt,
      }),
    );
  }

  if (order.refundedAt) {
    events.push(
      buildTimelineEntry({
        status: "refunded",
        label: getStatusLabel("refunded"),
        message: "Order refunded",
        actorType: "system",
        createdAt: order.refundedAt,
        metadata: {
          refundAmount: order.refundAmount,
          refundReference: order.refundReference,
        },
      }),
    );
  }

  return events;
};

const applyTrackingUpdate = (order, payload = {}, actor = {}) => {
  const fulfillment = getFulfillmentSnapshot(order);
  const previousTracking = fulfillment.trackingNumber;
  const previousCarrier = fulfillment.carrier;

  if (payload.courierName !== undefined) {
    fulfillment.carrier = normalizeText(payload.courierName);
    fulfillment.courierName = fulfillment.carrier;
  }

  if (payload.trackingNumber !== undefined) {
    fulfillment.trackingNumber = normalizeText(payload.trackingNumber);
  }

  if (payload.trackingUrl !== undefined) {
    fulfillment.trackingUrl = normalizeText(payload.trackingUrl);
  }

  order.fulfillment = fulfillment;

  const trackingChanged =
    previousTracking !== fulfillment.trackingNumber ||
    previousCarrier !== fulfillment.carrier ||
    (payload.trackingUrl !== undefined &&
      normalizeText(payload.trackingUrl) !== normalizeText(fulfillment.trackingUrl));

  if (trackingChanged) {
    appendTimelineEvent(
      order,
      buildTimelineEntry({
        status: order.orderStatus,
        label: "Tracking updated",
        message: fulfillment.trackingNumber
          ? `Tracking ${fulfillment.trackingNumber} added`
          : "Tracking details updated",
        note: actor.note || "",
        createdBy: actor.createdBy || null,
        actorType: actor.actorType || "admin",
        metadata: {
          courierName: fulfillment.carrier,
          trackingNumber: fulfillment.trackingNumber,
          trackingUrl: fulfillment.trackingUrl,
        },
      }),
    );
  }

  const shouldMoveToShipped =
    payload.moveToShipped !== false &&
    fulfillment.trackingNumber &&
    PRE_SHIPMENT_STATUSES.has(normalizeOrderStatus(order.orderStatus));

  return { order, trackingChanged, shouldMoveToShipped };
};

const addAdminNote = (order, { note, createdBy = null, isPrivate = true }) => {
  const trimmed = normalizeText(note);

  if (!trimmed) {
    return { success: false, error: "Note is required." };
  }

  if (!Array.isArray(order.adminNotes)) {
    order.adminNotes = [];
  }

  order.adminNotes.push({
    note: trimmed,
    createdAt: new Date(),
    createdBy: createdBy || null,
    isPrivate: isPrivate !== false,
  });

  return { success: true, order };
};

const applyRefundUpdate = (order, payload = {}, actor = {}) => {
  const refundAmount = payload.refundAmount !== undefined ? Number(payload.refundAmount) : null;
  const paymentStatus = payload.paymentStatus || "refunded";

  if (!PAYMENT_STATUS_OPTIONS.includes(paymentStatus)) {
    return { success: false, error: "Invalid payment status for refund." };
  }

  if (refundAmount !== null && (Number.isNaN(refundAmount) || refundAmount < 0)) {
    return { success: false, error: "Refund amount must be zero or greater." };
  }

  order.paymentStatus = paymentStatus;
  order.refundedAt = new Date();

  if (refundAmount !== null) {
    order.refundAmount = refundAmount;
  }

  if (payload.refundReference !== undefined) {
    order.refundReference = normalizeText(payload.refundReference);
  }

  if (payload.paymentReference !== undefined) {
    order.paymentReference = normalizeText(payload.paymentReference);
  }

  if (["refunded", "partially_refunded"].includes(paymentStatus)) {
    const nextStatus = payload.orderStatus === "returned" ? "returned" : "refunded";
    const canMoveToRefunded = validateOrderStatusTransition(
      normalizeOrderStatus(order.orderStatus),
      nextStatus,
      { allowAdminOverride: true, reason: actor.reason || "refund_processed" },
    );

    if (canMoveToRefunded.valid && normalizeOrderStatus(order.orderStatus) !== nextStatus) {
      order.orderStatus = nextStatus;
    }
  }

  appendTimelineEvent(
    order,
    buildTimelineEntry({
      status: order.orderStatus,
      label: "Refund recorded",
      message: `Payment marked as ${paymentStatus.replace(/_/g, " ")}`,
      note: actor.note || actor.reason || "",
      createdBy: actor.createdBy || null,
      actorType: actor.actorType || "admin",
      metadata: {
        refundAmount: order.refundAmount,
        refundReference: order.refundReference,
        paymentStatus,
      },
    }),
  );

  return { success: true, order };
};

module.exports = {
  ORDER_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  TERMINAL_ORDER_STATUSES,
  STATUS_LABELS,
  ALLOWED_TRANSITIONS,
  normalizeOrderStatus,
  getStatusLabel,
  validateOrderStatusTransition,
  getAllowedNextStatuses,
  buildTimelineEntry,
  appendTimelineEvent,
  syncFulfillmentFromOrderStatus,
  shouldRestoreStockForCancellation,
  restoreOrderInventoryIfNeeded,
  applyOrderStatusChange,
  initializeOrderLifecycle,
  buildTimelineFallback,
  applyTrackingUpdate,
  addAdminNote,
  applyRefundUpdate,
};
