const {
  DEMO_STORE_NAME,
  DEMO_STORE_TAGLINE
} = require("../constants/storeDefaults");

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();

const normalizeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
};

const normalizeKeywords = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizeAddressInput = (address = {}, currentAddress = {}) => {
  const current = currentAddress && typeof currentAddress === "object" ? currentAddress : {};

  return {
    street: normalizeText(address.street ?? address.line1 ?? current.street),
    line2: normalizeText(address.line2 ?? address.addressLine2 ?? current.line2),
    city: normalizeText(address.city ?? current.city),
    state: normalizeText(address.state ?? current.state),
    postalCode: normalizeText(address.postalCode ?? address.zip ?? current.postalCode),
    country: normalizeText(address.country ?? current.country)
  };
};

const normalizeSeoInput = (seo = {}, currentSeo = {}) => {
  const current = currentSeo && typeof currentSeo === "object" ? currentSeo : {};

  return {
    title: normalizeText(seo.title ?? seo.seoTitle ?? current.title),
    description: normalizeText(seo.description ?? seo.seoDescription ?? current.description),
    keywords: normalizeKeywords(seo.keywords ?? seo.seoKeywords ?? current.keywords)
  };
};

const normalizeSocialInput = (social = {}, currentSocial = {}) => {
  const current = currentSocial && typeof currentSocial === "object" ? currentSocial : {};

  return {
    facebook: normalizeText(social.facebook ?? current.facebook),
    instagram: normalizeText(social.instagram ?? current.instagram),
    linkedin: normalizeText(social.linkedin ?? current.linkedin),
    twitter: normalizeText(social.twitter ?? current.twitter),
    youtube: normalizeText(social.youtube ?? current.youtube)
  };
};

const applyStoreSettingsUpdate = (settings, body = {}) => {
  if (body.storeName !== undefined) settings.storeName = normalizeText(body.storeName) || DEMO_STORE_NAME;
  if (body.storeTagline !== undefined) settings.storeTagline = normalizeText(body.storeTagline);
  if (body.storeEmail !== undefined) settings.storeEmail = normalizeText(body.storeEmail).toLowerCase();
  if (body.storePhone !== undefined) settings.storePhone = normalizeText(body.storePhone);
  if (body.currency !== undefined) settings.currency = normalizeText(body.currency).toUpperCase() || "USD";
  if (body.currencySymbol !== undefined) settings.currencySymbol = normalizeText(body.currencySymbol) || "$";
  if (body.logo !== undefined) settings.logo = normalizeText(body.logo);
  if (body.favicon !== undefined || body.faviconUrl !== undefined) {
    settings.favicon = normalizeText(body.favicon ?? body.faviconUrl);
  }

  if (body.address !== undefined || body.addressLine2 !== undefined) {
    settings.address = normalizeAddressInput(body.address || {}, settings.address);
    if (body.addressLine2 !== undefined) {
      settings.address.line2 = normalizeText(body.addressLine2);
    }
  }

  if (body.taxEnabled !== undefined) {
    settings.taxEnabled = normalizeBoolean(body.taxEnabled, settings.taxEnabled);
  }

  if (body.taxPercentage !== undefined) {
    settings.taxPercentage = Math.max(0, normalizeNumber(body.taxPercentage, 0));
  }

  if (body.shippingEnabled !== undefined) {
    settings.shippingEnabled = normalizeBoolean(body.shippingEnabled, settings.shippingEnabled);
  }

  const thresholdValue =
    body.freeShippingThreshold !== undefined
      ? body.freeShippingThreshold
      : body.shippingCharge !== undefined
        ? body.shippingCharge
        : undefined;

  if (thresholdValue !== undefined) {
    const threshold = Math.max(0, normalizeNumber(thresholdValue, 0));
    settings.freeShippingThreshold = threshold;
    settings.shippingCharge = threshold;
  }

  if (body.seo !== undefined) {
    settings.seo = normalizeSeoInput(body.seo, settings.seo);
  }

  if (body.social !== undefined) {
    settings.social = normalizeSocialInput(body.social, settings.social);
  }

  if (body.maintenanceMode !== undefined) {
    settings.maintenanceMode = normalizeBoolean(body.maintenanceMode, settings.maintenanceMode);
  }

  if (settings.taxEnabled === false) {
    settings.taxPercentage = 0;
  }

  if (settings.shippingEnabled === false) {
    settings.freeShippingThreshold = 0;
    settings.shippingCharge = 0;
  }

  return settings;
};

const toStoreSettingsResponse = (settings) => {
  if (!settings) {
    return null;
  }

  const doc = typeof settings.toObject === "function" ? settings.toObject() : settings;
  const address = doc.address || {};
  const seo = doc.seo || {};
  const social = doc.social || {};
  const freeShippingThreshold =
    doc.freeShippingThreshold !== undefined && doc.freeShippingThreshold !== null
      ? doc.freeShippingThreshold
      : doc.shippingCharge || 0;

  return {
    ...doc,
    logoUrl: doc.logo || "",
    faviconUrl: doc.favicon || "",
    taxEnabled:
      typeof doc.taxEnabled === "boolean" ? doc.taxEnabled : normalizeNumber(doc.taxPercentage, 0) > 0,
    shippingEnabled:
      typeof doc.shippingEnabled === "boolean"
        ? doc.shippingEnabled
        : normalizeNumber(freeShippingThreshold, 0) > 0,
    freeShippingThreshold,
    shippingCharge: freeShippingThreshold,
    address: {
      ...address,
      line1: address.street || "",
      line2: address.line2 || "",
      street: address.street || ""
    },
    seo: {
      title: seo.title || "",
      description: seo.description || "",
      keywords: Array.isArray(seo.keywords) ? seo.keywords : []
    },
    social: {
      facebook: social.facebook || "",
      instagram: social.instagram || "",
      linkedin: social.linkedin || "",
      twitter: social.twitter || "",
      youtube: social.youtube || ""
    }
  };
};

const toPublicStoreSettings = (settings) => {
  const response = toStoreSettingsResponse(settings);

  if (!response) {
    return {
      storeName: DEMO_STORE_NAME,
      storeTagline: DEMO_STORE_TAGLINE,
      storeEmail: "",
      storePhone: "",
      currency: "USD",
      currencySymbol: "$",
      logo: "",
      favicon: "",
      taxEnabled: false,
      taxPercentage: 0,
      shippingEnabled: false,
      freeShippingThreshold: 0,
      shippingCharge: 0,
      maintenanceMode: false,
      seo: {
        title: "",
        description: "",
        keywords: []
      },
      social: {
        facebook: "",
        instagram: "",
        linkedin: "",
        twitter: "",
        youtube: ""
      }
    };
  }

  return {
    storeName: response.storeName || DEMO_STORE_NAME,
    storeTagline: response.storeTagline || DEMO_STORE_TAGLINE,
    storeEmail: response.storeEmail || "",
    storePhone: response.storePhone || "",
    currency: response.currency || "USD",
    currencySymbol: response.currencySymbol || "$",
    logo: response.logo || "",
    favicon: response.favicon || "",
    taxEnabled: response.taxEnabled,
    taxPercentage: response.taxPercentage || 0,
    shippingEnabled: response.shippingEnabled,
    freeShippingThreshold: response.freeShippingThreshold || 0,
    shippingCharge: response.freeShippingThreshold || 0,
    maintenanceMode: response.maintenanceMode || false,
    seo: response.seo,
    social: response.social
  };
};

module.exports = {
  applyStoreSettingsUpdate,
  toStoreSettingsResponse,
  toPublicStoreSettings
};
