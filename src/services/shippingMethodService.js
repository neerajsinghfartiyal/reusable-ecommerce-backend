const ShippingMethod = require("../models/ShippingMethod");
const StoreSetting = require("../models/StoreSetting");

const normalizeText = (value) =>
  typeof value === "string"
    ? value.trim()
    : value === null || value === undefined
      ? ""
      : String(value).trim();

const normalizeCountry = (value) => normalizeText(value).toUpperCase();

const normalizeState = (value) => normalizeText(value).toUpperCase();

const normalizePostalCode = (value) => normalizeText(value).toUpperCase();

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundMoney = (value) => Math.round(Math.max(0, value) * 100) / 100;

const getStoreShippingSettings = async () => {
  const settings = await StoreSetting.findOne().lean();
  return {
    shippingEnabled: settings?.shippingEnabled !== false,
    freeShippingThreshold: toNumber(settings?.freeShippingThreshold ?? settings?.shippingCharge, 0)
  };
};

const buildLocationFromCustomer = (customer = {}) => {
  const address = customer?.address || {};
  return {
    country: normalizeCountry(address.country),
    state: normalizeState(address.state),
    postalCode: normalizePostalCode(address.postalCode)
  };
};

const buildLocationFromAddress = (address = {}) => ({
  country: normalizeCountry(address.country),
  state: normalizeState(address.state),
  postalCode: normalizePostalCode(address.postalCode)
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

const isShippingMethodEligible = (method, { subtotal, location = {} } = {}) => {
  if (!method || method.isActive === false) {
    return false;
  }

  if (!matchesOrderAmount(method, subtotal)) {
    return false;
  }

  const country = normalizeCountry(location.country);
  const state = normalizeState(location.state);
  const postalCode = normalizePostalCode(location.postalCode);

  if (!matchesStringList(method.allowedCountries, country)) {
    return false;
  }

  if (!matchesStringList(method.allowedStates, state)) {
    return false;
  }

  if (!matchesStringList(method.postalCodes, postalCode)) {
    return false;
  }

  return true;
};

const applyFreeShippingThreshold = (charge, subtotal, threshold) => {
  const normalizedThreshold = toNumber(threshold, 0);
  if (normalizedThreshold > 0 && toNumber(subtotal, 0) >= normalizedThreshold) {
    return 0;
  }

  return charge;
};

const calculateShippingCharge = (method, { subtotal = 0, totalWeight = 0, itemCount = 0 } = {}) => {
  if (!method) {
    return 0;
  }

  const config = method.config && typeof method.config === "object" ? method.config : {};
  const baseRate = toNumber(method.baseRate, 0);
  const subtotalAmount = toNumber(subtotal, 0);
  let charge = 0;

  switch (method.type) {
    case "free":
    case "local_pickup":
      charge = method.type === "local_pickup" ? baseRate : 0;
      break;
    case "flat_rate":
      charge = baseRate;
      break;
    case "weight_based": {
      const ratePerKg = toNumber(config.ratePerKg ?? config.ratePerUnit, 0);
      const minCharge = toNumber(config.minCharge, 0);
      const weight = toNumber(totalWeight, 0) > 0 ? toNumber(totalWeight, 0) : toNumber(itemCount, 0);
      charge = baseRate + ratePerKg * weight;
      if (minCharge > 0) {
        charge = Math.max(charge, minCharge);
      }
      break;
    }
    case "price_based": {
      const percentage = toNumber(config.percentage, 0);
      if (percentage > 0) {
        charge = (subtotalAmount * percentage) / 100;
      } else if (Array.isArray(config.tiers)) {
        const tier = config.tiers.find((entry) => {
          const min = toNumber(entry?.min, 0);
          const max = toNumber(entry?.max, 0);
          if (max > 0) {
            return subtotalAmount >= min && subtotalAmount <= max;
          }
          return subtotalAmount >= min;
        });
        charge = toNumber(tier?.rate ?? tier?.amount, baseRate);
      } else {
        charge = baseRate;
      }
      break;
    }
    case "custom":
      charge = toNumber(config.amount, baseRate);
      break;
    default:
      charge = baseRate;
  }

  charge = applyFreeShippingThreshold(charge, subtotalAmount, method.freeShippingThreshold);

  return roundMoney(charge);
};

const buildShippingMethodSnapshot = (method, charge) => {
  if (!method) {
    return null;
  }

  return {
    methodId: method._id,
    code: method.code,
    name: method.name,
    displayName: method.displayName || method.name,
    type: method.type,
    instructions: method.instructions || "",
    charge: roundMoney(charge)
  };
};

const formatShippingOption = (method, charge) => ({
  _id: method._id,
  code: method.code,
  name: method.name,
  displayName: method.displayName || method.name,
  type: method.type,
  description: method.description || "",
  instructions: method.instructions || "",
  sortOrder: method.sortOrder || 0,
  charge: roundMoney(charge)
});

const getActiveShippingMethods = async () =>
  ShippingMethod.find({ isActive: true }).sort({ sortOrder: 1, createdAt: 1 }).lean();

const listCheckoutShippingOptions = async ({
  subtotal = 0,
  totalWeight = 0,
  itemCount = 0,
  location = {},
  shippingEnabled = true
} = {}) => {
  if (!shippingEnabled) {
    return [];
  }

  const methods = await getActiveShippingMethods();

  return methods
    .filter((method) => isShippingMethodEligible(method, { subtotal, location }))
    .map((method) => {
      const charge = calculateShippingCharge(method, { subtotal, totalWeight, itemCount });
      return formatShippingOption(method, charge);
    });
};

const resolveShippingMethod = async ({ shippingMethodId, shippingMethodCode }) => {
  if (shippingMethodId) {
    return ShippingMethod.findById(shippingMethodId);
  }

  if (shippingMethodCode) {
    const normalizedCode = normalizeText(shippingMethodCode).toLowerCase();
    return ShippingMethod.findOne({ code: normalizedCode });
  }

  return null;
};

const quoteShippingMethod = async ({
  shippingMethodId,
  shippingMethodCode,
  subtotal = 0,
  totalWeight = 0,
  itemCount = 0,
  location = {},
  shippingEnabled = true
}) => {
  if (!shippingEnabled) {
    return {
      method: null,
      charge: 0,
      snapshot: null
    };
  }

  const method = await resolveShippingMethod({ shippingMethodId, shippingMethodCode });

  if (!method) {
    return {
      method: null,
      charge: 0,
      snapshot: null,
      error: "Shipping method not found"
    };
  }

  if (!method.isActive) {
    return {
      method,
      charge: 0,
      snapshot: null,
      error: "Shipping method is not active"
    };
  }

  if (!isShippingMethodEligible(method, { subtotal, location })) {
    return {
      method,
      charge: 0,
      snapshot: null,
      error: "Shipping method is not available for this order"
    };
  }

  const charge = calculateShippingCharge(method, { subtotal, totalWeight, itemCount });
  const snapshot = buildShippingMethodSnapshot(method, charge);

  return {
    method,
    charge,
    snapshot,
    error: null
  };
};

const applyStoreFreeShippingOverride = async (charge, subtotal) => {
  const { shippingEnabled, freeShippingThreshold } = await getStoreShippingSettings();
  if (!shippingEnabled) {
    return 0;
  }

  return applyFreeShippingThreshold(charge, subtotal, freeShippingThreshold);
};

module.exports = {
  normalizeText,
  buildLocationFromCustomer,
  buildLocationFromAddress,
  getStoreShippingSettings,
  isShippingMethodEligible,
  calculateShippingCharge,
  buildShippingMethodSnapshot,
  formatShippingOption,
  getActiveShippingMethods,
  listCheckoutShippingOptions,
  resolveShippingMethod,
  quoteShippingMethod,
  applyStoreFreeShippingOverride
};
