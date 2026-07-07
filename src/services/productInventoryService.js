const Product = require("../models/Product");
const { findVariantRecord } = require("./productVariantService");

const deductPurchasableStock = async (product = {}, variantId = null, quantity = 1) => {
  const qty = Number(quantity || 0);
  if (!product?._id || qty <= 0) {
    return { success: false, error: "Invalid stock deduction request." };
  }

  if (!variantId) {
    const updated = await Product.findOneAndUpdate(
      { _id: product._id, quantity: { $gte: qty } },
      { $inc: { quantity: -qty } },
      { new: true },
    );

    if (!updated) {
      return {
        success: false,
        error: `Insufficient stock for ${product.name}. Available stock may have changed.`,
      };
    }

    return { success: true, product: updated };
  }

  const variant = findVariantRecord(product, variantId);
  if (!variant) {
    return { success: false, error: "Selected variant was not found for stock deduction." };
  }

  if (variant.source === "variants") {
    const updated = await Product.findOneAndUpdate(
      {
        _id: product._id,
        variants: {
          $elemMatch: {
            _id: variantId,
            stockQuantity: { $gte: qty },
            isActive: { $ne: false },
          },
        },
      },
      { $inc: { "variants.$[variant].stockQuantity": -qty } },
      {
        new: true,
        arrayFilters: [{ "variant._id": variantId }],
      },
    );

    if (!updated) {
      return {
        success: false,
        error: `Insufficient stock for ${product.name}. Available variant stock may have changed.`,
      };
    }

    return { success: true, product: updated };
  }

  const updated = await Product.findOneAndUpdate(
    {
      _id: product._id,
      variations: {
        $elemMatch: {
          _id: variantId,
          quantity: { $gte: qty },
          status: "active",
        },
      },
    },
    { $inc: { "variations.$[variation].quantity": -qty } },
    {
      new: true,
      arrayFilters: [{ "variation._id": variantId }],
    },
  );

  if (!updated) {
    return {
      success: false,
      error: `Insufficient stock for ${product.name}. Available variant stock may have changed.`,
    };
  }

  return { success: true, product: updated };
};

const restorePurchasableStock = async (productId, variantId = null, quantity = 1) => {
  const qty = Number(quantity || 0);
  if (!productId || qty <= 0) return null;

  const product = await Product.findById(productId);
  if (!product) return null;

  if (!variantId) {
    return Product.findByIdAndUpdate(productId, { $inc: { quantity: qty } }, { new: true });
  }

  const variant = findVariantRecord(product, variantId);
  if (!variant) return null;

  if (variant.source === "variants") {
    return Product.findOneAndUpdate(
      { _id: productId, "variants._id": variantId },
      { $inc: { "variants.$[variant].stockQuantity": qty } },
      { new: true, arrayFilters: [{ "variant._id": variantId }] },
    );
  }

  return Product.findOneAndUpdate(
    { _id: productId, "variations._id": variantId },
    { $inc: { "variations.$[variation].quantity": qty } },
    { new: true, arrayFilters: [{ "variation._id": variantId }] },
  );
};

module.exports = {
  deductPurchasableStock,
  restorePurchasableStock,
};
