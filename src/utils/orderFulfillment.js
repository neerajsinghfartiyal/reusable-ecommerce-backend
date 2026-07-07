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
  "cod_pending"
];

const FULFILLMENT_STATUS_OPTIONS = [
  "unfulfilled",
  "processing",
  "packed",
  "shipped",
  "delivered",
  "returned"
];

const FULFILLMENT_TRANSITIONS = {
  unfulfilled: ["processing", "packed", "shipped"],
  processing: ["packed", "shipped"],
  packed: ["shipped"],
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  returned: []
};

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();

const deriveLegacyFulfillmentStatus = (orderStatus) => {
  switch (normalizeText(orderStatus).toLowerCase()) {
    case "confirmed":
    case "processing":
      return "processing";
    case "packed":
      return "packed";
    case "shipped":
    case "out_for_delivery":
      return "shipped";
    case "delivered":
      return "delivered";
    case "returned":
    case "return_requested":
      return "returned";
    default:
      return "unfulfilled";
  }
};

const buildAddressSnapshot = (customerDoc = {}) => {
  const address = customerDoc?.address || {};

  return {
    firstName: normalizeText(customerDoc?.firstName),
    lastName: normalizeText(customerDoc?.lastName),
    email: normalizeText(customerDoc?.email),
    phone: normalizeText(customerDoc?.phone),
    street: normalizeText(address?.street),
    city: normalizeText(address?.city),
    state: normalizeText(address?.state),
    postalCode: normalizeText(address?.postalCode),
    country: normalizeText(address?.country)
  };
};

const buildInitialFulfillment = ({ orderStatus, notes = "" } = {}) => {
  const status = deriveLegacyFulfillmentStatus(orderStatus);
  const now = new Date();

  return {
    status,
    carrier: "",
    courierName: "",
    trackingNumber: "",
    trackingUrl: "",
    shippedAt: status === "shipped" || status === "delivered" ? now : null,
    deliveredAt: status === "delivered" ? now : null,
    notes: normalizeText(notes)
  };
};

const getFulfillmentSnapshot = (order = {}) => {
  const current = order?.fulfillment || {};
  const fallbackStatus = deriveLegacyFulfillmentStatus(order?.orderStatus);
  const carrier = normalizeText(current?.courierName || current?.carrier);

  return {
    status: current?.status || fallbackStatus,
    carrier,
    courierName: carrier,
    trackingNumber: normalizeText(current?.trackingNumber),
    trackingUrl: normalizeText(current?.trackingUrl),
    shippedAt: current?.shippedAt || null,
    deliveredAt: current?.deliveredAt || null,
    notes: normalizeText(current?.notes)
  };
};

const canTransitionFulfillment = (currentStatus, nextStatus) => {
  if (!nextStatus || currentStatus === nextStatus) {
    return true;
  }

  return (FULFILLMENT_TRANSITIONS[currentStatus] || []).includes(nextStatus);
};

const applyOrderStatusForFulfillment = (order, nextStatus) => {
  if (!order || !nextStatus || order.orderStatus === "cancelled") {
    return;
  }

  if (nextStatus === "processing" || nextStatus === "packed") {
    order.orderStatus = nextStatus === "packed" ? "packed" : "processing";
    return;
  }

  if (nextStatus === "shipped") {
    order.orderStatus = "shipped";
    return;
  }

  if (nextStatus === "delivered") {
    order.orderStatus = "delivered";
  }

  if (nextStatus === "returned") {
    order.orderStatus = "returned";
  }
};

module.exports = {
  ORDER_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  FULFILLMENT_STATUS_OPTIONS,
  normalizeText,
  deriveLegacyFulfillmentStatus,
  buildAddressSnapshot,
  buildInitialFulfillment,
  getFulfillmentSnapshot,
  canTransitionFulfillment,
  applyOrderStatusForFulfillment
};
