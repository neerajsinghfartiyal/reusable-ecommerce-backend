require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const Cart = require("../src/models/Cart");
const {
  getProductPurchaseMode,
  resolvePurchasableProduct,
  validateVariantSelection,
  mapProductForPublicResponse,
  mapProductForAdminResponse,
  cartLinesMatch,
  buildCartItemSnapshot,
  buildOrderItemSnapshot,
} = require("../src/services/productVariantService");
const { deductPurchasableStock, restorePurchasableStock } = require("../src/services/productInventoryService");
const { getCartItemStockFields } = require("../src/utils/cartResponseMapper");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const runHelperSmoke = () => {
  const simpleProduct = {
    _id: "prod-simple",
    name: "Simple Tee",
    sku: "TEE-001",
    price: 1000,
    salePrice: 800,
    quantity: 5,
    featuredImage: "/tee.jpg",
    hasVariants: false,
    variants: [],
    variations: [],
  };

  assert(getProductPurchaseMode(simpleProduct) === "simple", "simple product mode");
  const simplePurchasable = resolvePurchasableProduct(simpleProduct);
  assert(simplePurchasable.price === 800, "simple product uses sale price");
  assert(simplePurchasable.isInStock === true, "simple product in stock");

  const simpleValidation = validateVariantSelection(simpleProduct, null);
  assert(simpleValidation.valid === true, "simple product validates without variantId");

  const variantProduct = {
    _id: "prod-variant",
    name: "Variant Hoodie",
    sku: "HOODIE-PARENT",
    price: 2000,
    quantity: 0,
    hasVariants: true,
    featuredImage: "/hoodie.jpg",
    variants: [
      {
        _id: "var-black-m",
        sku: "HOODIE-BM",
        title: "Black / M",
        options: { color: "Black", size: "M" },
        price: 2200,
        compareAtPrice: 2500,
        stockQuantity: 3,
        image: "/hoodie-black.jpg",
        isActive: true,
        sortOrder: 0,
      },
      {
        _id: "var-white-m",
        sku: "HOODIE-WM",
        title: "White / M",
        options: { color: "White", size: "M" },
        price: 2200,
        stockQuantity: 0,
        image: "/hoodie-white.jpg",
        isActive: true,
        sortOrder: 1,
      },
    ],
    variations: [],
  };

  assert(getProductPurchaseMode(variantProduct) === "variant", "variant product mode");
  const missingVariant = validateVariantSelection(variantProduct, null);
  assert(missingVariant.valid === false, "variant product requires variantId");
  const outOfStock = validateVariantSelection(variantProduct, "var-white-m");
  assert(outOfStock.valid === false, "out-of-stock variant rejected");
  const validVariant = validateVariantSelection(variantProduct, "var-black-m");
  assert(validVariant.valid === true, "active in-stock variant accepted");

  const publicResponse = mapProductForPublicResponse(variantProduct);
  assert(publicResponse.hasVariants === true, "public response hasVariants");
  assert(publicResponse.variants.length === 2, "public response includes active variants");

  const adminResponse = mapProductForAdminResponse(variantProduct);
  assert(adminResponse.variants.length === 2, "admin response includes variants");

  const cartItem = buildCartItemSnapshot(variantProduct, validVariant.purchasable, 2);
  assert(cartItem.variantId === "var-black-m", "cart snapshot stores variantId");
  assert(cartItem.total === 4400, "cart snapshot total");

  const orderItem = buildOrderItemSnapshot(cartItem);
  assert(orderItem.unitPrice === 2200, "order snapshot unitPrice");
  assert(orderItem.lineTotal === 4400, "order snapshot lineTotal");

  assert(
    cartLinesMatch({ product: "prod-variant", variantId: "var-black-m" }, "prod-variant", "var-black-m"),
    "cart line match for same variant",
  );
  assert(
    !cartLinesMatch({ product: "prod-variant", variantId: "var-black-m" }, "prod-variant", "var-white-m"),
    "cart line mismatch for different variant",
  );

  const variantStockFields = getCartItemStockFields(
    { variantId: "var-black-m" },
    variantProduct,
  );
  assert(variantStockFields.variantStockQuantity === 3, "variant cart stock fields");
  assert(variantStockFields.maxQuantity === 3, "variant cart max quantity");
  assert(variantStockFields.inStock === true, "variant cart in stock");

  const simpleStockFields = getCartItemStockFields({}, simpleProduct);
  assert(simpleStockFields.maxQuantity === 5, "simple cart max quantity");
  assert(simpleStockFields.inStock === true, "simple cart in stock");

  console.log("Helper smoke checks passed.");
};

const runDbSmoke = async () => {
  if (!process.env.MONGO_URI) {
    console.log("Skipping DB smoke (MONGO_URI not set).");
    return;
  }

  await mongoose.connect(process.env.MONGO_URI);

  const categoryId = new mongoose.Types.ObjectId();
  const suffix = Date.now();

  const simple = await Product.create({
    name: `Smoke Simple ${suffix}`,
    sku: `SMOKE-SIMPLE-${suffix}`,
    price: 500,
    quantity: 10,
    category: categoryId,
    status: "published",
  });

  const variantProduct = await Product.create({
    name: `Smoke Variant ${suffix}`,
    sku: `SMOKE-VAR-PARENT-${suffix}`,
    price: 1000,
    quantity: 0,
    category: categoryId,
    status: "published",
    hasVariants: true,
    variants: [
      {
        sku: `SMOKE-VAR-A-${suffix}`,
        title: "Option A",
        options: { size: "A" },
        price: 1100,
        stockQuantity: 4,
        isActive: true,
        sortOrder: 0,
      },
    ],
  });

  const variantId = variantProduct.variants[0]._id;
  const selection = validateVariantSelection(variantProduct, variantId);
  assert(selection.valid, "DB variant validates");

  const cart = await Cart.create({
    sessionId: `smoke-${suffix}`,
    items: [
      buildCartItemSnapshot(simple, resolvePurchasableProduct(simple), 1),
      buildCartItemSnapshot(variantProduct, selection.purchasable, 2),
    ],
  });

  assert(cart.items.length === 2, "cart stores simple and variant lines");

  const deduction = await deductPurchasableStock(variantProduct, variantId, 1);
  assert(deduction.success, "variant stock deduction works");
  await restorePurchasableStock(variantProduct._id, variantId, 1);

  await Cart.deleteOne({ _id: cart._id });
  await Product.deleteMany({ _id: { $in: [simple._id, variantProduct._id] } });
  await mongoose.disconnect();

  console.log("DB smoke checks passed.");
};

const main = async () => {
  runHelperSmoke();
  await runDbSmoke();
  console.log("Product variant smoke completed successfully.");
};

main().catch((error) => {
  console.error("Product variant smoke failed:", error.message);
  process.exit(1);
});
