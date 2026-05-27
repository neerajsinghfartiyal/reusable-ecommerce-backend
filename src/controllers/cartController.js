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
    .populate("coupon", "code discountType discountValue");
};

const calculateCartTotals = (cart) => {
  cart.subtotal = cart.items.reduce((sum, item) => sum + (item.total || 0), 0);

  cart.taxAmount = 0;
  cart.shippingAmount = 0;

  let calculatedDiscount = 0;

  if (cart.couponDiscountType === "percentage") {
    calculatedDiscount = (cart.subtotal * cart.couponDiscountValue) / 100;
  } else if (cart.couponDiscountType === "fixed") {
    calculatedDiscount = cart.couponDiscountValue;
  }

  cart.discountAmount = Math.min(calculatedDiscount, cart.subtotal);

  cart.totalAmount = cart.subtotal + cart.taxAmount + cart.shippingAmount - cart.discountAmount;
};

const clearCouponFields = (cart) => {
  cart.coupon = null;
  cart.couponCode = "";
  cart.couponDiscountType = "";
  cart.couponDiscountValue = 0;
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

    calculateCartTotals(cart);
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
      calculateCartTotals(cart);
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

    calculateCartTotals(cart);
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

    calculateCartTotals(cart);
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

    calculateCartTotals(cart);
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
    calculateCartTotals(cart);

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
    const { customer, notes } = req.body;

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

    calculateCartTotals(cart);

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
      shippingAmount: cart.shippingAmount,
      discountAmount: cart.discountAmount,
      coupon: cart.coupon || null,
      couponCode: cart.couponCode || "",
      couponDiscountType: cart.couponDiscountType || "",
      couponDiscountValue: cart.couponDiscountValue || 0,
      totalAmount: cart.totalAmount,
      paymentStatus: "pending",
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
      .populate("items.product", "name sku featuredImage");

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

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  applyCouponToCart,
  removeCouponFromCart,
  checkoutCart
};
