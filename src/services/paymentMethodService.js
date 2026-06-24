const PaymentMethod = require("../models/PaymentMethod");

const normalizeText = (value) =>
  typeof value === "string"
    ? value.trim()
    : value === null || value === undefined
      ? ""
      : String(value).trim();

const normalizeCountry = (value) => normalizeText(value).toUpperCase();

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildLocationFromCustomer = (customer = {}) => {
  const address = customer?.address || {};
  return {
    country: normalizeCountry(address.country)
  };
};

const buildLocationFromAddress = (address = {}) => ({
  country: normalizeCountry(address.country)
});

const matchesStringList = (allowedValues, actualValue) => {
  if (!Array.isArray(allowedValues) || allowedValues.length === 0) {
    return true;
  }

  if (!actualValue) {
    return false;
  }

  const normalizedAllowed = allowedValues.map((item) => normalizeText(item).toUpperCase());
  return normalizedAllowed.includes(actualValue);
};

const matchesOrderAmount = (method, subtotal) => {
  const amount = toNumber(subtotal, 0);
  const minOrderAmount = toNumber(method?.minOrderAmount, 0);
  const maxOrderAmount = toNumber(method?.maxOrderAmount, 0);

  if (minOrderAmount > 0 && amount < minOrderAmount) {
    return false;
  }

  if (maxOrderAmount > 0 && amount > maxOrderAmount) {
    return false;
  }

  return true;
};

const isPaymentMethodEligible = (method, { subtotal, location = {} } = {}) => {
  if (!method || method.isActive === false) {
    return false;
  }

  if (!matchesOrderAmount(method, subtotal)) {
    return false;
  }

  const country = normalizeCountry(location.country);
  if (!matchesStringList(method.allowedCountries, country)) {
    return false;
  }

  return true;
};

const deriveInitialPaymentStatus = (method) => {
  if (!method) {
    return "pending";
  }

  if (method.provider === "cod") {
    return "cod_pending";
  }

  return "pending";
};

const buildPaymentMethodSnapshot = (method) => {
  if (!method) {
    return null;
  }

  return {
    methodId: method._id,
    code: method.code,
    name: method.name,
    displayName: method.displayName || method.name,
    type: method.type,
    provider: method.provider,
    instructions: method.instructions || ""
  };
};

const getPaymentMethodLabel = (method) => method?.displayName || method?.name || "";

const formatPaymentOption = (method) => ({
  _id: method._id,
  code: method.code,
  name: method.name,
  displayName: method.displayName || method.name,
  type: method.type,
  provider: method.provider,
  description: method.description || "",
  instructions: method.instructions || "",
  testMode: Boolean(method.testMode),
  sortOrder: method.sortOrder || 0,
  initialPaymentStatus: deriveInitialPaymentStatus(method)
});

const getActivePaymentMethods = async () =>
  PaymentMethod.find({ isActive: true }).sort({ sortOrder: 1, createdAt: 1 }).lean();

const listCheckoutPaymentOptions = async ({ subtotal = 0, location = {} } = {}) => {
  const methods = await getActivePaymentMethods();

  return methods
    .filter((method) => isPaymentMethodEligible(method, { subtotal, location }))
    .map((method) => formatPaymentOption(method));
};

const resolvePaymentMethod = async ({ paymentMethodId, paymentMethodCode }) => {
  if (paymentMethodId) {
    return PaymentMethod.findById(paymentMethodId);
  }

  if (paymentMethodCode) {
    const normalizedCode = normalizeText(paymentMethodCode).toLowerCase();
    return PaymentMethod.findOne({ code: normalizedCode });
  }

  return null;
};

const quotePaymentMethod = async ({
  paymentMethodId,
  paymentMethodCode,
  subtotal = 0,
  location = {}
}) => {
  const method = await resolvePaymentMethod({ paymentMethodId, paymentMethodCode });

  if (!method) {
    return {
      method: null,
      snapshot: null,
      initialPaymentStatus: "pending",
      label: "",
      error: "Payment method not found"
    };
  }

  if (!method.isActive) {
    return {
      method,
      snapshot: null,
      initialPaymentStatus: "pending",
      label: getPaymentMethodLabel(method),
      error: "Payment method is not active"
    };
  }

  if (!isPaymentMethodEligible(method, { subtotal, location })) {
    return {
      method,
      snapshot: null,
      initialPaymentStatus: "pending",
      label: getPaymentMethodLabel(method),
      error: "Payment method is not available for this order"
    };
  }

  return {
    method,
    snapshot: buildPaymentMethodSnapshot(method),
    initialPaymentStatus: deriveInitialPaymentStatus(method),
    label: getPaymentMethodLabel(method),
    error: null
  };
};

module.exports = {
  normalizeText,
  buildLocationFromCustomer,
  buildLocationFromAddress,
  isPaymentMethodEligible,
  deriveInitialPaymentStatus,
  buildPaymentMethodSnapshot,
  getPaymentMethodLabel,
  formatPaymentOption,
  getActivePaymentMethods,
  listCheckoutPaymentOptions,
  resolvePaymentMethod,
  quotePaymentMethod
};
