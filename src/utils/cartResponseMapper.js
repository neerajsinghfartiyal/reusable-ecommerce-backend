const { resolvePurchasableProduct } = require("../services/productVariantService");

const toPlainObject = (value) => {
  if (!value) return null;
  if (typeof value.toObject === "function") {
    return value.toObject({ virtuals: true });
  }
  return { ...value };
};

const getCartItemStockFields = (item = {}, product = null) => {
  if (!product || typeof product !== "object") {
    return {
      stockQuantity: 0,
      maxQuantity: 0,
      inStock: false,
    };
  }

  const variantId = item?.variantId ? String(item.variantId) : null;
  const purchasable = resolvePurchasableProduct(product, variantId);
  const stockQuantity = Number(purchasable?.stockQuantity || 0);
  const inStock = Boolean(purchasable?.isInStock);
  const fields = {
    stockQuantity,
    maxQuantity: stockQuantity,
    inStock,
  };

  if (variantId) {
    fields.variantStockQuantity = stockQuantity;
  }

  return fields;
};

const mapCartItemForResponse = (item = {}) => {
  const plainItem = toPlainObject(item) || {};
  const product =
    plainItem.product && typeof plainItem.product === "object" ? plainItem.product : null;
  const stockFields = getCartItemStockFields(plainItem, product);

  return {
    ...plainItem,
    ...stockFields,
    product: product || plainItem.product,
  };
};

const mapCartForResponse = (cartDoc) => {
  if (!cartDoc) return null;

  const cart = toPlainObject(cartDoc);
  if (!cart) return null;

  return {
    ...cart,
    items: Array.isArray(cart.items) ? cart.items.map(mapCartItemForResponse) : [],
  };
};

module.exports = {
  getCartItemStockFields,
  mapCartItemForResponse,
  mapCartForResponse,
};
