const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const sendResponse = require("../utils/response");
const { logActivity } = require("../utils/activityLogger");
const { sendEmail } = require("../services/emailService");
const {
  orderConfirmationTemplate,
  adminNewOrderTemplate
} = require("../templates/emailTemplates");
const {
  buildAddressSnapshot,
  buildInitialFulfillment
} = require("../utils/orderFulfillment");
const {
  buildLocationFromCustomer,
  getStoreShippingSettings,
  listCheckoutShippingOptions,
  quoteShippingMethod,
  applyStoreFreeShippingOverride
} = require("../services/shippingMethodService");
const {
  buildLocationFromCustomer: buildPaymentLocationFromCustomer,
  listCheckoutPaymentOptions,
  quotePaymentMethod
} = require("../services/paymentMethodService");

const getSessionIdFromRequest = (req) => {
  const sessionId = req.params.sessionId || req.body.sessionId;
  return typeof sessionId === "string" ? sessionId.trim() : "";
};

const getOrCreateActiveCart = async (sessionId) => {
  let cart = await Cart.findOne({ sessionId, status: "active" });

  if (!cart) {
    cart = await Cart.create({
      sessionId,
      status: "active"
    });
  }

  return cart;
};

const populateCartById = async (cartId) => {
  return Cart.findById(cartId)
    .populate("items.product", "name slug featuredImage price salePrice quantity")
    .populate("coupon", "code discountType discountValue")
    .populate("shippingMethod", "name code displayName type")
    .populate("paymentMethodRef", "name code displayName type provider");
};

const calculateCartTotals = (cart) => {
  cart.subtotal = cart.items.reduce((sum, item) => sum + (item.total || 0), 0);

  cart.taxAmount = 0;

  let calculatedDiscount = 0;

  if (cart.couponDiscountType === "percentage") {
    calculatedDiscount = (cart.subtotal * cart.couponDiscountValue) / 100;
  } else if (cart.couponDiscountType === "fixed") {
    calculatedDiscount = cart.couponDiscountValue;
  }

  cart.discountAmount = Math.min(calculatedDiscount, cart.subtotal);

  cart.totalAmount =
    cart.subtotal + (cart.shippingAmount || 0) + cart.taxAmount - cart.discountAmount;
};

const getCartItemCount = (cart) =>
  (cart.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);

const recalculateCartShipping = async (cart, { customer = null, location = null } = {}) => {
  const { shippingEnabled } = await getStoreShippingSettings();

  if (!shippingEnabled) {
    cart.shippingMethod = null;
    cart.shippingMethodCode = "";
    cart.shippingAmount = 0;
    return;
  }

  if (!cart.shippingMethod && !cart.shippingMethodCode) {
    cart.shippingAmount = 0;
    return;
  }

  const resolvedLocation = location || buildLocationFromCustomer(customer || {});
  const quote = await quoteShippingMethod({
    shippingMethodId: cart.shippingMethod,
    shippingMethodCode: cart.shippingMethodCode,
    subtotal: cart.subtotal,
    itemCount: getCartItemCount(cart),
    location: resolvedLocation,
    shippingEnabled
  });

  if (quote.error || !quote.method) {
    cart.shippingMethod = null;
    cart.shippingMethodCode = "";
    cart.shippingAmount = 0;
    return;
  }

  cart.shippingMethod = quote.method._id;
  cart.shippingMethodCode = quote.method.code;
  cart.shippingAmount = await applyStoreFreeShippingOverride(quote.charge, cart.subtotal);
};

const refreshCartTotals = async (cart, shippingContext = {}) => {
  calculateCartTotals(cart);
  await recalculateCartShipping(cart, shippingContext);
  calculateCartTotals(cart);
};

const clearCouponFields = (cart) => {
  cart.coupon = null;
  cart.couponCode = "";
  cart.couponDiscountType = "";
  cart.couponDiscountValue = 0;
};

const clearShippingFields = (cart) => {
  cart.shippingMethod = null;
  cart.shippingMethodCode = "";
  cart.shippingAmount = 0;
};

const clearPaymentFields = (cart) => {
  cart.paymentMethodRef = null;
  cart.paymentMethodCode = "";
};

const getCart = async (req, res) => {
  try {
    const sessionId = getSessionIdFromRequest(req);

    if (!sessionId) {
      return sendResponse(res, 400, false, "Session ID is required");
    }

    const cart = await getOrCreateActiveCart(sessionId);
    const populatedCart = await populateCartById(cart._id);

    return sendResponse(res, 200, true, "Cart fetched successfully", populatedCart);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const addToCart = async (req, res) => {
  try {
    const sessionId = getSessionIdFromRequest(req);
    const { productId, quantity } = req.body;

    if (!sessionId) {
      return sendResponse(res, 400, false, "Session ID is required");
    }

    if (!productId || quantity === undefined) {
      return sendResponse(res, 400, false, "Product and quantity are required");
    }

    const requestedQuantity = Number(quantity);

    if (requestedQuantity <= 0) {
      return sendResponse(res, 400, false, "Quantity must be greater than 0");
    }

    const product = await Product.findById(productId);

    if (!product) {
      return sendResponse(res, 404, false, "Product not found");
    }

    if (product.status !== "published") {
      return sendResponse(res, 400, false, "Only published products can be added to cart");
    }

    const cart = await getOrCreateActiveCart(sessionId);
    const existingItem = cart.items.find(
      (item) => String(item.product) === String(product._id)
    );

    const newQuantity = existingItem ? existingItem.quantity + requestedQuantity : requestedQuantity;

    if (newQuantity > product.quantity) {
      return sendResponse(
        res,
        400,
        false,
        `Insufficient stock for ${product.name}. Available stock is ${product.quantity}`
      );
    }

    const finalPrice = product.salePrice || product.price;

    if (existingItem) {
      existingItem.quantity = newQuantity;
      existingItem.price = finalPrice;
      existingItem.productName = product.name;
      existingItem.sku = product.sku;
      existingItem.featuredImage = product.featuredImage || "";
      existingItem.total = finalPrice * newQuantity;
    } else {
      cart.items.push({
        product: product._id,
        productName: product.name,
        sku: product.sku,
        price: finalPrice,
        quantity: requestedQuantity,
        featuredImage: product.featuredImage || "",
        total: finalPrice * requestedQuantity
      });
    }

    await refreshCartTotals(cart);
    await cart.save();

    const populatedCart = await populateCartById(cart._id);

    return sendResponse(res, 200, true, "Item added to cart successfully", populatedCart);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateCartItem = async (req, res) => {
  try {
    const sessionId = getSessionIdFromRequest(req);
    const { productId } = req.params;
    const { quantity } = req.body;

    if (!sessionId) {
      return sendResponse(res, 400, false, "Session ID is required");
    }

    if (quantity === undefined) {
      return sendResponse(res, 400, false, "Quantity is required");
    }

    const updatedQuantity = Number(quantity);
    const cart = await getOrCreateActiveCart(sessionId);
    const itemIndex = cart.items.findIndex(
      (item) => String(item.product) === String(productId)
    );

    if (itemIndex === -1) {
      return sendResponse(res, 404, false, "Cart item not found");
    }

    if (updatedQuantity <= 0) {
      cart.items.splice(itemIndex, 1);
      await refreshCartTotals(cart);
      await cart.save();

      const populatedCart = await populateCartById(cart._id);
      return sendResponse(res, 200, true, "Cart item removed successfully", populatedCart);
    }

    const product = await Product.findById(productId);

    if (!product) {
      return sendResponse(res, 404, false, "Product not found");
    }

    if (updatedQuantity > product.quantity) {
      return sendResponse(
        res,
        400,
        false,
        `Insufficient stock for ${product.name}. Available stock is ${product.quantity}`
      );
    }

    const item = cart.items[itemIndex];
    const finalPrice = product.salePrice || product.price;

    item.quantity = updatedQuantity;
    item.price = finalPrice;
    item.productName = product.name;
    item.sku = product.sku;
    item.featuredImage = product.featuredImage || "";
    item.total = finalPrice * updatedQuantity;

    await refreshCartTotals(cart);
    await cart.save();

    const populatedCart = await populateCartById(cart._id);

    return sendResponse(res, 200, true, "Cart item updated successfully", populatedCart);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const removeCartItem = async (req, res) => {
  try {
    const sessionId = getSessionIdFromRequest(req);
    const { productId } = req.params;

    if (!sessionId) {
      return sendResponse(res, 400, false, "Session ID is required");
    }

    const cart = await getOrCreateActiveCart(sessionId);
    cart.items = cart.items.filter((item) => String(item.product) !== String(productId));

    await refreshCartTotals(cart);
    await cart.save();

    const populatedCart = await populateCartById(cart._id);

    return sendResponse(res, 200, true, "Cart item removed successfully", populatedCart);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const clearCart = async (req, res) => {
  try {
    const sessionId = getSessionIdFromRequest(req);

    if (!sessionId) {
      return sendResponse(res, 400, false, "Session ID is required");
    }

    const cart = await getOrCreateActiveCart(sessionId);

    cart.items = [];
    clearCouponFields(cart);
    clearShippingFields(cart);
    clearPaymentFields(cart);
    calculateCartTotals(cart);

    await cart.save();

    const populatedCart = await populateCartById(cart._id);

    return sendResponse(res, 200, true, "Cart cleared successfully", populatedCart);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const applyCouponToCart = async (req, res) => {
  try {
    const sessionId = getSessionIdFromRequest(req);
    const { couponCode } = req.body;

    if (!sessionId) {
      return sendResponse(res, 400, false, "Session ID is required");
    }

    if (!couponCode) {
      return sendResponse(res, 400, false, "Coupon code is required");
    }

    const cart = await getOrCreateActiveCart(sessionId);
    calculateCartTotals(cart);

    if (cart.subtotal <= 0) {
      return sendResponse(res, 400, false, "Add items to cart before applying coupon");
    }

    const formattedCode = String(couponCode).trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: formattedCode });

    if (!coupon) {
      return sendResponse(res, 400, false, "Invalid coupon code");
    }

    if (coupon.status !== "active") {
      return sendResponse(res, 400, false, "Coupon is not active");
    }

    const now = new Date();

    if (coupon.startDate && coupon.startDate > now) {
      return sendResponse(res, 400, false, "Coupon is not active yet");
    }

    if (coupon.expiryDate && coupon.expiryDate < now) {
      return sendResponse(res, 400, false, "Coupon has expired");
    }

    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      return sendResponse(res, 400, false, "Coupon usage limit reached");
    }

    if (cart.subtotal < coupon.minimumOrderAmount) {
      return sendResponse(
        res,
        400,
        false,
        `Minimum order amount for this coupon is ${coupon.minimumOrderAmount}`
      );
    }

    cart.coupon = coupon._id;
    cart.couponCode = coupon.code;
    cart.couponDiscountType = coupon.discountType;
    cart.couponDiscountValue = coupon.discountValue;

    await refreshCartTotals(cart);
    await cart.save();

    const populatedCart = await populateCartById(cart._id);

    return sendResponse(res, 200, true, "Coupon applied successfully", populatedCart);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const removeCouponFromCart = async (req, res) => {
  try {
    const sessionId = getSessionIdFromRequest(req);

    if (!sessionId) {
      return sendResponse(res, 400, false, "Session ID is required");
    }

    const cart = await getOrCreateActiveCart(sessionId);
    clearCouponFields(cart);
    await refreshCartTotals(cart);

    await cart.save();

    const populatedCart = await populateCartById(cart._id);

    return sendResponse(res, 200, true, "Coupon removed successfully", populatedCart);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const checkoutCart = async (req, res) => {
  try {
    const sessionId = getSessionIdFromRequest(req);
    const { customer, notes, shippingMethodId, shippingMethodCode, paymentMethodId, paymentMethodCode } =
      req.body;

    if (!sessionId) {
      return sendResponse(res, 400, false, "Session ID is required");
    }

    if (!customer) {
      return sendResponse(res, 400, false, "Customer is required");
    }

    const cart = await Cart.findOne({ sessionId, status: "active" });

    if (!cart) {
      return sendResponse(res, 404, false, "Active cart not found");
    }

    if (!Array.isArray(cart.items) || cart.items.length === 0) {
      return sendResponse(res, 400, false, "Cart is empty");
    }

    const existingCustomer = await Customer.findById(customer);
    if (!existingCustomer) {
      return sendResponse(res, 404, false, "Customer not found");
    }

    const stockUpdates = [];

    for (const item of cart.items) {
      const product = await Product.findById(item.product);

      if (!product) {
        return sendResponse(res, 404, false, `Product not found for SKU ${item.sku}`);
      }

      if (item.quantity > product.quantity) {
        return sendResponse(
          res,
          400,
          false,
          `Insufficient stock for ${product.name}. Available stock is ${product.quantity}`
        );
      }

      stockUpdates.push({
        product,
        quantity: item.quantity
      });
    }

    if (shippingMethodId || shippingMethodCode) {
      cart.shippingMethod = shippingMethodId || cart.shippingMethod;
      cart.shippingMethodCode = shippingMethodCode || cart.shippingMethodCode;
    }

    if (paymentMethodId || paymentMethodCode) {
      cart.paymentMethodRef = paymentMethodId || cart.paymentMethodRef;
      cart.paymentMethodCode = paymentMethodCode || cart.paymentMethodCode;
    }

    await refreshCartTotals(cart, { customer: existingCustomer });

    const { shippingEnabled } = await getStoreShippingSettings();
    const shippingOptions = await listCheckoutShippingOptions({
      subtotal: cart.subtotal,
      itemCount: getCartItemCount(cart),
      location: buildLocationFromCustomer(existingCustomer),
      shippingEnabled
    });

    let shippingSnapshot = null;
    let finalShippingAmount = cart.shippingAmount || 0;
    let selectedShippingMethodId = cart.shippingMethod || null;

    if (shippingEnabled && shippingOptions.length > 0) {
      const selectedMethodId = shippingMethodId || cart.shippingMethod;
      const selectedMethodCode = shippingMethodCode || cart.shippingMethodCode;

      if (!selectedMethodId && !selectedMethodCode) {
        return sendResponse(res, 400, false, "Shipping method is required for checkout");
      }

      const quote = await quoteShippingMethod({
        shippingMethodId: selectedMethodId,
        shippingMethodCode: selectedMethodCode,
        subtotal: cart.subtotal,
        itemCount: getCartItemCount(cart),
        location: buildLocationFromCustomer(existingCustomer),
        shippingEnabled
      });

      if (quote.error) {
        return sendResponse(res, 400, false, quote.error);
      }

      finalShippingAmount = await applyStoreFreeShippingOverride(quote.charge, cart.subtotal);
      shippingSnapshot = quote.snapshot
        ? { ...quote.snapshot, charge: finalShippingAmount }
        : null;
      selectedShippingMethodId = quote.method?._id || null;
      cart.shippingAmount = finalShippingAmount;
      calculateCartTotals(cart);
    }

    const paymentOptions = await listCheckoutPaymentOptions({
      subtotal: cart.subtotal,
      location: buildPaymentLocationFromCustomer(existingCustomer)
    });

    let paymentSnapshot = null;
    let selectedPaymentMethodId = cart.paymentMethodRef || null;
    let initialPaymentStatus = "pending";
    let paymentMethodLabel = "";

    if (paymentOptions.length > 0) {
      const selectedPaymentId = paymentMethodId || cart.paymentMethodRef;
      const selectedPaymentCode = paymentMethodCode || cart.paymentMethodCode;

      if (!selectedPaymentId && !selectedPaymentCode) {
        return sendResponse(res, 400, false, "Payment method is required for checkout");
      }

      const paymentQuote = await quotePaymentMethod({
        paymentMethodId: selectedPaymentId,
        paymentMethodCode: selectedPaymentCode,
        subtotal: cart.subtotal,
        location: buildPaymentLocationFromCustomer(existingCustomer)
      });

      if (paymentQuote.error) {
        return sendResponse(res, 400, false, paymentQuote.error);
      }

      paymentSnapshot = paymentQuote.snapshot;
      selectedPaymentMethodId = paymentQuote.method?._id || null;
      initialPaymentStatus = paymentQuote.initialPaymentStatus;
      paymentMethodLabel = paymentQuote.label;
    }

    const order = await Order.create({
      customer,
      items: cart.items.map((item) => ({
        product: item.product,
        productName: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        price: item.price,
        total: item.total
      })),
      subtotal: cart.subtotal,
      taxAmount: cart.taxAmount,
      shippingAmount: finalShippingAmount,
      shippingMethod: selectedShippingMethodId,
      shippingMethodSnapshot: shippingSnapshot,
      discountAmount: cart.discountAmount,
      coupon: cart.coupon || null,
      couponCode: cart.couponCode || "",
      couponDiscountType: cart.couponDiscountType || "",
      couponDiscountValue: cart.couponDiscountValue || 0,
      totalAmount: cart.totalAmount,
      paymentStatus: initialPaymentStatus,
      paymentMethodRef: selectedPaymentMethodId,
      paymentMethodSnapshot: paymentSnapshot,
      paymentMethod: paymentMethodLabel,
      shippingAddressSnapshot: buildAddressSnapshot(existingCustomer),
      fulfillment: buildInitialFulfillment({ orderStatus: "pending" }),
      orderStatus: "pending",
      notes: notes || "",
      createdBy: null
    });

    for (const stockItem of stockUpdates) {
      const updatedProduct = await Product.findOneAndUpdate(
        {
          _id: stockItem.product._id,
          quantity: { $gte: stockItem.quantity }
        },
        {
          $inc: { quantity: -stockItem.quantity }
        },
        {
          new: true
        }
      );

      if (!updatedProduct) {
        return sendResponse(
          res,
          400,
          false,
          `Insufficient stock for ${stockItem.product.name}. Available stock may have changed. Please refresh and try again.`
        );
      }
    }

    if (cart.coupon) {
      const coupon = await Coupon.findById(cart.coupon);
      if (coupon) {
        coupon.usedCount += 1;
        await coupon.save();
      }
    }

    cart.status = "converted";
    await cart.save();

    const createdOrder = await Order.findById(order._id)
      .populate("customer", "firstName lastName email phone")
      .populate("items.product", "name sku featuredImage")
      .populate("shippingMethod", "name code displayName type")
      .populate("paymentMethodRef", "name code displayName type provider");

    await logActivity({
      admin: null,
      action: "ORDER_CREATED",
      module: "ORDER",
      description: `Order created via checkout: ${order.orderNumber}`,
      entityId: order._id.toString(),
      entityType: "Order",
      metadata: {
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        totalAmount: order.totalAmount,
        shippingMethodCode: shippingSnapshot?.code || "",
        paymentMethodCode: paymentSnapshot?.code || "",
        source: "checkout"
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const convertedCart = await populateCartById(cart._id);

    if (createdOrder?.customer?.email) {
      try {
        const customerTemplate = orderConfirmationTemplate(createdOrder);
        await sendEmail({
          to: createdOrder.customer.email,
          ...customerTemplate
        });
      } catch (error) {
        // Email failures should not break checkout flow.
      }
    }

    if (process.env.ADMIN_NOTIFICATION_EMAIL) {
      try {
        const adminTemplate = adminNewOrderTemplate(createdOrder);
        await sendEmail({
          to: process.env.ADMIN_NOTIFICATION_EMAIL,
          ...adminTemplate
        });
      } catch (error) {
        // Email failures should not break checkout flow.
      }
    }

    return sendResponse(res, 201, true, "Checkout completed successfully", {
      order: createdOrder,
      cart: convertedCart
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getCartShippingOptions = async (req, res) => {
  try {
    const sessionId = getSessionIdFromRequest(req);
    const { customer: customerId } = req.query;

    if (!sessionId) {
      return sendResponse(res, 400, false, "Session ID is required");
    }

    const cart = await Cart.findOne({ sessionId, status: "active" });

    if (!cart) {
      return sendResponse(res, 404, false, "Active cart not found");
    }

    if (!Array.isArray(cart.items) || cart.items.length === 0) {
      return sendResponse(res, 400, false, "Cart is empty");
    }

    calculateCartTotals(cart);

    let customer = null;
    if (customerId) {
      customer = await Customer.findById(customerId);
      if (!customer) {
        return sendResponse(res, 404, false, "Customer not found");
      }
    }

    const { shippingEnabled } = await getStoreShippingSettings();
    const shippingOptions = await listCheckoutShippingOptions({
      subtotal: cart.subtotal,
      itemCount: getCartItemCount(cart),
      location: buildLocationFromCustomer(customer || {}),
      shippingEnabled
    });

    const optionsWithStoreOverride = await Promise.all(
      shippingOptions.map(async (option) => ({
        ...option,
        charge: await applyStoreFreeShippingOverride(option.charge, cart.subtotal)
      }))
    );

    return sendResponse(res, 200, true, "Cart shipping options fetched successfully", {
      shippingEnabled,
      subtotal: cart.subtotal,
      selectedShippingMethod: cart.shippingMethod,
      selectedShippingMethodCode: cart.shippingMethodCode,
      shippingAmount: cart.shippingAmount,
      shippingOptions: optionsWithStoreOverride
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const setCartShippingMethod = async (req, res) => {
  try {
    const sessionId = getSessionIdFromRequest(req);
    const { shippingMethodId, shippingMethodCode, customer: customerId } = req.body;

    if (!sessionId) {
      return sendResponse(res, 400, false, "Session ID is required");
    }

    if (!shippingMethodId && !shippingMethodCode) {
      return sendResponse(res, 400, false, "Shipping method ID or code is required");
    }

    const cart = await getOrCreateActiveCart(sessionId);

    if (!Array.isArray(cart.items) || cart.items.length === 0) {
      return sendResponse(res, 400, false, "Cart is empty");
    }

    let customer = null;
    if (customerId) {
      customer = await Customer.findById(customerId);
      if (!customer) {
        return sendResponse(res, 404, false, "Customer not found");
      }
    }

    calculateCartTotals(cart);

    const { shippingEnabled } = await getStoreShippingSettings();
    const quote = await quoteShippingMethod({
      shippingMethodId,
      shippingMethodCode,
      subtotal: cart.subtotal,
      itemCount: getCartItemCount(cart),
      location: buildLocationFromCustomer(customer || {}),
      shippingEnabled
    });

    if (quote.error) {
      return sendResponse(res, 400, false, quote.error);
    }

    cart.shippingMethod = quote.method._id;
    cart.shippingMethodCode = quote.method.code;
    cart.shippingAmount = await applyStoreFreeShippingOverride(quote.charge, cart.subtotal);
    calculateCartTotals(cart);

    await cart.save();

    const populatedCart = await populateCartById(cart._id);

    return sendResponse(res, 200, true, "Cart shipping method updated successfully", populatedCart);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getCartPaymentOptions = async (req, res) => {
  try {
    const sessionId = getSessionIdFromRequest(req);
    const { customer: customerId } = req.query;

    if (!sessionId) {
      return sendResponse(res, 400, false, "Session ID is required");
    }

    const cart = await Cart.findOne({ sessionId, status: "active" });

    if (!cart) {
      return sendResponse(res, 404, false, "Active cart not found");
    }

    if (!Array.isArray(cart.items) || cart.items.length === 0) {
      return sendResponse(res, 400, false, "Cart is empty");
    }

    calculateCartTotals(cart);

    let customer = null;
    if (customerId) {
      customer = await Customer.findById(customerId);
      if (!customer) {
        return sendResponse(res, 404, false, "Customer not found");
      }
    }

    const paymentOptions = await listCheckoutPaymentOptions({
      subtotal: cart.subtotal,
      location: buildPaymentLocationFromCustomer(customer || {})
    });

    return sendResponse(res, 200, true, "Cart payment options fetched successfully", {
      subtotal: cart.subtotal,
      selectedPaymentMethod: cart.paymentMethodRef,
      selectedPaymentMethodCode: cart.paymentMethodCode,
      paymentOptions
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const setCartPaymentMethod = async (req, res) => {
  try {
    const sessionId = getSessionIdFromRequest(req);
    const { paymentMethodId, paymentMethodCode, customer: customerId } = req.body;

    if (!sessionId) {
      return sendResponse(res, 400, false, "Session ID is required");
    }

    if (!paymentMethodId && !paymentMethodCode) {
      return sendResponse(res, 400, false, "Payment method ID or code is required");
    }

    const cart = await getOrCreateActiveCart(sessionId);

    if (!Array.isArray(cart.items) || cart.items.length === 0) {
      return sendResponse(res, 400, false, "Cart is empty");
    }

    let customer = null;
    if (customerId) {
      customer = await Customer.findById(customerId);
      if (!customer) {
        return sendResponse(res, 404, false, "Customer not found");
      }
    }

    calculateCartTotals(cart);

    const quote = await quotePaymentMethod({
      paymentMethodId,
      paymentMethodCode,
      subtotal: cart.subtotal,
      location: buildPaymentLocationFromCustomer(customer || {})
    });

    if (quote.error) {
      return sendResponse(res, 400, false, quote.error);
    }

    cart.paymentMethodRef = quote.method._id;
    cart.paymentMethodCode = quote.method.code;

    await cart.save();

    const populatedCart = await populateCartById(cart._id);

    return sendResponse(res, 200, true, "Cart payment method updated successfully", populatedCart);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  applyCouponToCart,
  removeCouponFromCart,
  getCartShippingOptions,
  setCartShippingMethod,
  getCartPaymentOptions,
  setCartPaymentMethod,
  checkoutCart
};
