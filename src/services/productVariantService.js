const mongoose = require("mongoose");

const normalizeOptionsObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce((acc, [key, entry]) => {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(entry ?? "").trim();
    if (!normalizedKey || !normalizedValue) return acc;
    acc[normalizedKey] = normalizedValue;
    return acc;
  }, {});
};

const buildTitleFromLegacyVariation = (variation = {}) => {
  const attributes = Array.isArray(variation.attributes) ? variation.attributes : [];
  const labels = attributes
    .map((entry) => entry?.label || entry?.value || entry?.name)
    .filter(Boolean);

  if (labels.length) return labels.join(" / ");
  if (variation.sku) return String(variation.sku).trim();
  return "Variant";
};

const mapLegacyVariationToVariant = (variation = {}) => {
  const attributes = Array.isArray(variation.attributes) ? variation.attributes : [];
  const options = attributes.reduce((acc, entry) => {
    const key = String(entry?.name || entry?.code || "").trim();
    const value = String(entry?.label || entry?.value || "").trim();
    if (key && value) acc[key] = value;
    return acc;
  }, {});

  const basePrice = Number(variation.price || 0);
  const salePrice =
    variation.salePrice !== undefined && variation.salePrice !== null
      ? Number(variation.salePrice)
      : null;
  const effectivePrice =
    salePrice !== null && !Number.isNaN(salePrice) ? salePrice : basePrice;
  const compareAtPrice =
    salePrice !== null && !Number.isNaN(salePrice) && salePrice < basePrice ? basePrice : null;

  return {
    _id: variation._id,
    sku: variation.sku || "",
    title: buildTitleFromLegacyVariation(variation),
    options,
    price: effectivePrice,
    compareAtPrice,
    stockQuantity: Number(variation.quantity || 0),
    image: variation.image || "",
    isActive: String(variation.status || "active").toLowerCase() === "active",
    sortOrder: 0,
    source: "variations",
  };
};

const mapCanonicalVariant = (variant = {}) => ({
  _id: variant._id,
  sku: variant.sku || "",
  title: variant.title || "",
  options: normalizeOptionsObject(
    variant.options instanceof Map ? Object.fromEntries(variant.options) : variant.options,
  ),
  price: Number(variant.price || 0),
  compareAtPrice:
    variant.compareAtPrice !== undefined && variant.compareAtPrice !== null
      ? Number(variant.compareAtPrice)
      : null,
  stockQuantity: Number(variant.stockQuantity || 0),
  image: variant.image || "",
  isActive: variant.isActive !== false,
  sortOrder: Number(variant.sortOrder || 0),
  source: "variants",
});

const getCanonicalVariants = (product = {}) => {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length) {
    return variants.map(mapCanonicalVariant);
  }

  const legacy = Array.isArray(product.variations) ? product.variations : [];
  return legacy.map(mapLegacyVariationToVariant);
};

const getActiveVariants = (product = {}, { includeInactive = false } = {}) => {
  const all = getCanonicalVariants(product);
  if (includeInactive) return all;
  return all.filter((variant) => variant.isActive);
};

const getProductPurchaseMode = (product = {}) => {
  if (product?.hasVariants === true) return "variant";

  const activeVariants = getActiveVariants(product);
  if (activeVariants.length > 0) return "variant";

  return "simple";
};

const findVariantRecord = (product = {}, variantId) => {
  if (!variantId) return null;

  const id = String(variantId);
  const canonical = (product.variants || []).find((entry) => String(entry._id) === id);
  if (canonical) {
    return mapCanonicalVariant(canonical);
  }

  const legacy = (product.variations || []).find((entry) => String(entry._id) === id);
  if (legacy) {
    return mapLegacyVariationToVariant(legacy);
  }

  return null;
};

const getSimplePurchasable = (product = {}) => {
  const basePrice = Number(product.price || 0);
  const salePrice =
    product.salePrice !== undefined && product.salePrice !== null
      ? Number(product.salePrice)
      : null;
  const effectivePrice =
    salePrice !== null && !Number.isNaN(salePrice) ? salePrice : basePrice;
  const compareAtPrice =
    salePrice !== null && !Number.isNaN(salePrice) && salePrice < basePrice ? basePrice : null;
  const stockQuantity = Number(product.quantity || 0);

  return {
    productId: product._id,
    variantId: null,
    purchaseMode: "simple",
    title: product.name || "",
    variantTitle: "",
    sku: product.sku || "",
    price: effectivePrice,
    compareAtPrice,
    stockQuantity,
    image: product.featuredImage || "",
    selectedOptions: {},
    isInStock: stockQuantity > 0,
    variantSource: null,
  };
};

const resolvePurchasableProduct = (product = {}, variantId = null) => {
  const mode = getProductPurchaseMode(product);

  if (mode === "simple") {
    return getSimplePurchasable(product);
  }

  const variant = findVariantRecord(product, variantId);
  if (!variant) {
    return null;
  }

  return {
    productId: product._id,
    variantId: variant._id,
    purchaseMode: "variant",
    title: product.name || "",
    variantTitle: variant.title || "",
    sku: variant.sku || product.sku || "",
    price: Number(variant.price || 0),
    compareAtPrice:
      variant.compareAtPrice !== undefined && variant.compareAtPrice !== null
        ? Number(variant.compareAtPrice)
        : null,
    stockQuantity: Number(variant.stockQuantity || 0),
    image: variant.image || product.featuredImage || "",
    selectedOptions: variant.options || {},
    isInStock: Number(variant.stockQuantity || 0) > 0,
    variantSource: variant.source,
  };
};

const validateVariantSelection = (product = {}, variantId = null) => {
  const mode = getProductPurchaseMode(product);

  if (mode === "simple") {
    if (variantId) {
      return { valid: false, error: "This product does not use variants." };
    }

    const purchasable = getSimplePurchasable(product);
    if (!purchasable.isInStock) {
      return { valid: false, error: "Product is out of stock." };
    }

    return { valid: true, purchasable };
  }

  if (!variantId) {
    return { valid: false, error: "variantId is required for this product." };
  }

  const variant = findVariantRecord(product, variantId);
  if (!variant) {
    return { valid: false, error: "Selected variant was not found." };
  }

  if (!variant.isActive) {
    return { valid: false, error: "Selected variant is inactive." };
  }

  if (Number(variant.stockQuantity || 0) <= 0) {
    return { valid: false, error: "Selected variant is out of stock." };
  }

  return { valid: true, purchasable: resolvePurchasableProduct(product, variantId) };
};

const normalizeProductVariants = (value) => {
  let parsed = [];

  if (Array.isArray(value)) {
    parsed = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const jsonValue = JSON.parse(value);
      parsed = Array.isArray(jsonValue) ? jsonValue : [];
    } catch (error) {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item) => item && typeof item === "object")
    .map((item, index) => ({
      sku: item?.sku ? String(item.sku).trim() : "",
      title: item?.title ? String(item.title).trim() : "",
      options: normalizeOptionsObject(item?.options),
      price: Number(item?.price ?? 0),
      compareAtPrice:
        item?.compareAtPrice !== undefined && item?.compareAtPrice !== null && item?.compareAtPrice !== ""
          ? Number(item.compareAtPrice)
          : null,
      stockQuantity: Number(item?.stockQuantity ?? item?.quantity ?? 0),
      image: item?.image ? String(item.image).trim() : "",
      isActive: item?.isActive !== undefined ? Boolean(item.isActive) : true,
      sortOrder: Number(item?.sortOrder ?? index),
    }));
};

const validateProductVariantsPayload = (variants = []) => {
  const errors = [];
  const seenSkus = new Set();

  variants.forEach((variant, index) => {
    const label = `variants[${index}]`;

    if (Number.isNaN(variant.price) || variant.price < 0) {
      errors.push(`${label}.price must be >= 0`);
    }

    if (
      variant.compareAtPrice !== null &&
      (Number.isNaN(variant.compareAtPrice) || variant.compareAtPrice < 0)
    ) {
      errors.push(`${label}.compareAtPrice must be >= 0`);
    }

    if (Number.isNaN(variant.stockQuantity) || variant.stockQuantity < 0) {
      errors.push(`${label}.stockQuantity must be >= 0`);
    }

    const sku = String(variant.sku || "").trim().toLowerCase();
    if (sku) {
      if (seenSkus.has(sku)) {
        errors.push(`${label}.sku must be unique within the product`);
      }
      seenSkus.add(sku);
    }
  });

  return errors;
};

const inferHasVariants = (variants = [], hasVariantsFlag) => {
  if (hasVariantsFlag !== undefined && hasVariantsFlag !== null && hasVariantsFlag !== "") {
    return Boolean(hasVariantsFlag);
  }

  return variants.some((variant) => variant.isActive !== false);
};

const mapVariantForResponse = (variant = {}) => ({
  variantId: variant._id ? String(variant._id) : "",
  sku: variant.sku || "",
  title: variant.title || "",
  options: variant.options || {},
  price: Number(variant.price || 0),
  compareAtPrice:
    variant.compareAtPrice !== undefined && variant.compareAtPrice !== null
      ? Number(variant.compareAtPrice)
      : null,
  stockQuantity: Number(variant.stockQuantity || 0),
  image: variant.image || "",
  isActive: variant.isActive !== false,
  sortOrder: Number(variant.sortOrder || 0),
});

const mapProductForAdminResponse = (productDoc = {}) => {
  const product =
    typeof productDoc.toObject === "function" ? productDoc.toObject() : { ...productDoc };
  const variants = getCanonicalVariants(product);

  return {
    ...product,
    hasVariants: inferHasVariants(variants, product.hasVariants),
    variants: variants.map(mapVariantForResponse),
  };
};

const mapProductForPublicResponse = (productDoc = {}) => {
  const product =
    typeof productDoc.toObject === "function" ? productDoc.toObject() : { ...productDoc };
  const activeVariants = getActiveVariants(product).map(mapVariantForResponse);
  const hasVariants = product.hasVariants === true || activeVariants.length > 0;

  return {
    ...product,
    hasVariants,
    variants: hasVariants ? activeVariants : [],
  };
};

const cartLinesMatch = (item = {}, productId, variantId = null) => {
  if (String(item.product) !== String(productId)) return false;

  const left = item.variantId ? String(item.variantId) : "";
  const right = variantId ? String(variantId) : "";
  return left === right;
};

const buildCartItemSnapshot = (product = {}, purchasable = {}, quantity = 1) => ({
  product: product._id,
  variantId: purchasable.variantId || null,
  productName: product.name || "",
  variantTitle: purchasable.variantTitle || "",
  variantOptions: purchasable.selectedOptions || {},
  sku: purchasable.sku || product.sku || "",
  price: Number(purchasable.price || 0),
  quantity: Number(quantity || 1),
  featuredImage: purchasable.image || product.featuredImage || "",
  total: Number(purchasable.price || 0) * Number(quantity || 1),
});

const buildOrderItemSnapshot = (cartItem = {}) => ({
  product: cartItem.product,
  variantId: cartItem.variantId || null,
  productName: cartItem.productName || "",
  variantTitle: cartItem.variantTitle || "",
  variantOptions: cartItem.variantOptions || {},
  sku: cartItem.sku || "",
  image: cartItem.featuredImage || "",
  quantity: Number(cartItem.quantity || 1),
  price: Number(cartItem.price || 0),
  unitPrice: Number(cartItem.price || 0),
  total: Number(cartItem.total || 0),
  lineTotal: Number(cartItem.total || 0),
});

module.exports = {
  normalizeOptionsObject,
  getCanonicalVariants,
  getActiveVariants,
  getProductPurchaseMode,
  findVariantRecord,
  resolvePurchasableProduct,
  validateVariantSelection,
  normalizeProductVariants,
  validateProductVariantsPayload,
  inferHasVariants,
  mapVariantForResponse,
  mapProductForAdminResponse,
  mapProductForPublicResponse,
  cartLinesMatch,
  buildCartItemSnapshot,
  buildOrderItemSnapshot,
};
