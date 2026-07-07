const Order = require("../models/Order");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const Coupon = require("../models/Coupon");
const sendResponse = require("../utils/response");
const { logActivity } = require("../utils/activityLogger");
const { sendEmail } = require("../services/emailService");
const {
  paymentStatusUpdateTemplate,
  orderStatusUpdateTemplate
} = require("../templates/emailTemplates");
const {
  ORDER_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  FULFILLMENT_STATUS_OPTIONS,
  normalizeText,
  buildAddressSnapshot,
  buildInitialFulfillment,
  getFulfillmentSnapshot,
  canTransitionFulfillment,
  applyOrderStatusForFulfillment
} = require("../utils/orderFulfillment");
const {
  applyOrderStatusChange,
  applyTrackingUpdate,
  addAdminNote,
  applyRefundUpdate,
  initializeOrderLifecycle,
  appendTimelineEvent,
  buildTimelineEntry,
  getStatusLabel,
} = require("../services/orderLifecycleService");
const { mapOrderForAdmin, mapOrderForPublic } = require("../utils/orderResponseMapper");
const {
  buildLocationFromCustomer,
  getStoreShippingSettings,
  quoteShippingMethod,
  applyStoreFreeShippingOverride
} = require("../services/shippingMethodService");
const {
  buildLocationFromCustomer: buildPaymentLocationFromCustomer,
  listCheckoutPaymentOptions,
  quotePaymentMethod
} = require("../services/paymentMethodService");
const {
  validateVariantSelection,
  buildOrderItemSnapshot,
} = require("../services/productVariantService");
const {
  deductPurchasableStock,
} = require("../services/productInventoryService");


const mapOrdersForAdmin = (orders = []) => orders.map((order) => mapOrderForAdmin(order));

const buildFulfillmentStatusFilter = (status) => {
  if (!status) {
    return null;
  }

  const normalized = normalizeText(status).toLowerCase();

  if (!FULFILLMENT_STATUS_OPTIONS.includes(normalized)) {
    return null;
  }

  if (normalized === "packed" || normalized === "returned") {
    return { "fulfillment.status": normalized };
  }

  const legacyOrderStatuses = {
    unfulfilled: ["pending", "confirmed", "cancelled"],
    processing: ["processing", "confirmed"],
    packed: ["packed", "processing"],
    shipped: ["shipped", "out_for_delivery"],
    delivered: ["delivered"]
  };

  return {
    $or: [
      { "fulfillment.status": normalized },
      {
        $and: [
          {
            $or: [
              { "fulfillment.status": { $exists: false } },
              { "fulfillment.status": null },
              { "fulfillment.status": "" }
            ]
          },
          { orderStatus: { $in: legacyOrderStatuses[normalized] || [] } }
        ]
      }
    ]
  };
};

const getPopulatedOrder = (orderId) =>
  Order.findById(orderId)
    .populate("customer", "firstName lastName email phone address")
    .populate("items.product", "name sku featuredImage galleryImages")
    .populate("shippingMethod", "name code displayName type")
    .populate("paymentMethodRef", "name code displayName type provider")
    .populate("sourceOrder", "orderNumber orderStatus totalAmount")
    .populate("returnRequest", "type status reason");

const buildFulfillmentActivityDescription = (action, fulfillment) => {
  const trackingText = fulfillment?.trackingNumber
    ? ` (${fulfillment.trackingNumber})`
    : "";

  switch (action) {
    case "SHIPMENT_CREATED":
      return `Shipment created${trackingText}`;
    case "TRACKING_ADDED":
      return `Tracking added${trackingText}`;
    case "ORDER_PACKED":
      return "Order packed for shipment";
    case "ORDER_SHIPPED":
      return `Order marked as shipped${trackingText}`;
    case "ORDER_DELIVERED":
      return "Order marked as delivered";
    case "ORDER_RETURNED":
      return "Order marked as returned from fulfillment";
    case "FULFILLMENT_NOTE_ADDED":
      return "Fulfillment note updated";
    default:
      return "Fulfillment updated";
  }
};

const logFulfillmentActivities = async ({
  req,
  order,
  previousFulfillment,
  nextFulfillment,
  providedNotes
}) => {
  const activities = [];
  const previousTracking = normalizeText(previousFulfillment?.trackingNumber);
  const nextTracking = normalizeText(nextFulfillment?.trackingNumber);
  const previousCarrier = normalizeText(previousFulfillment?.carrier);
  const nextCarrier = normalizeText(nextFulfillment?.carrier);
  const previousStatus = previousFulfillment?.status;
  const nextStatus = nextFulfillment?.status;
  const noteWasUpdated =
    providedNotes !== undefined &&
    normalizeText(previousFulfillment?.notes) !== normalizeText(nextFulfillment?.notes) &&
    normalizeText(nextFulfillment?.notes);

  if ((!previousTracking && nextTracking) || (!previousCarrier && nextCarrier)) {
    activities.push("SHIPMENT_CREATED");
  }

  if (previousTracking !== nextTracking && nextTracking) {
    activities.push("TRACKING_ADDED");
  }

  if (previousStatus !== nextStatus) {
    if (nextStatus === "packed") {
      activities.push("ORDER_PACKED");
    } else if (nextStatus === "shipped") {
      activities.push("ORDER_SHIPPED");
    } else if (nextStatus === "delivered") {
      activities.push("ORDER_DELIVERED");
    } else if (nextStatus === "returned") {
      activities.push("ORDER_RETURNED");
    }
  }

  if (noteWasUpdated) {
    activities.push("FULFILLMENT_NOTE_ADDED");
  }

  if (activities.length === 0) {
    activities.push("ORDER_FULFILLMENT_UPDATED");
  }

  for (const action of activities) {
    await logActivity({
      admin: req.admin?._id || null,
      action,
      module: "ORDER",
      description: buildFulfillmentActivityDescription(action, nextFulfillment),
      entityId: order._id.toString(),
      entityType: "Order",
      metadata: {
        orderStatus: order.orderStatus,
        fulfillmentStatus: nextFulfillment.status,
        carrier: nextFulfillment.carrier,
        trackingNumber: nextFulfillment.trackingNumber,
        shippedAt: nextFulfillment.shippedAt,
        deliveredAt: nextFulfillment.deliveredAt
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });
  }
};

const createOrder = async (req, res) => {
  try {
    const {
      customer,
      items,
      taxAmount = 0,
      shippingAmount = 0,
      discountAmount = 0,
      couponCode,
      paymentStatus,
      orderStatus,
      notes,
      shippingMethodId,
      shippingMethodCode,
      paymentMethodId,
      paymentMethodCode,
      paymentMethod
    } = req.body;

    if (!customer) {
      return sendResponse(res, 400, false, "Customer is required");
    }

    if (!Array.isArray(items) || items.length === 0) {
      return sendResponse(res, 400, false, "Order items are required");
    }

    const existingCustomer = await Customer.findById(customer);

    if (!existingCustomer) {
      return sendResponse(res, 404, false, "Customer not found");
    }

    const orderItems = [];
    const stockUpdates = [];
    let subtotal = 0;
    const finalOrderStatus = orderStatus || "pending";
    let finalPaymentStatus = paymentStatus || "pending";
    const shouldReduceStock = finalOrderStatus !== "cancelled";

    if (!ORDER_STATUS_OPTIONS.includes(finalOrderStatus)) {
      return sendResponse(res, 400, false, "Invalid order status");
    }

    if (!PAYMENT_STATUS_OPTIONS.includes(finalPaymentStatus)) {
      return sendResponse(res, 400, false, "Invalid payment status");
    }

    for (const item of items) {
      if (!item.product || !item.quantity) {
        return sendResponse(res, 400, false, "Product and quantity are required for each item");
      }

      const product = await Product.findById(item.product);

      if (!product) {
        return sendResponse(res, 404, false, "One or more products were not found");
      }

      const quantity = Number(item.quantity);

      if (quantity <= 0) {
        return sendResponse(res, 400, false, "Quantity must be greater than 0");
      }

      const selection = validateVariantSelection(product, item.variantId || null);
      if (!selection.valid) {
        return sendResponse(res, 400, false, selection.error);
      }

      if (shouldReduceStock && quantity > selection.purchasable.stockQuantity) {
        return sendResponse(
          res,
          400,
          false,
          `Insufficient stock for ${product.name}. Available stock is ${selection.purchasable.stockQuantity}`,
        );
      }

      const purchasable = selection.purchasable;
      const itemTotal = purchasable.price * quantity;

      orderItems.push(
        buildOrderItemSnapshot({
          product: product._id,
          variantId: purchasable.variantId || null,
          productName: product.name,
          variantTitle: purchasable.variantTitle || "",
          variantOptions: purchasable.selectedOptions || {},
          sku: purchasable.sku || product.sku,
          featuredImage: purchasable.image || product.featuredImage || "",
          quantity,
          price: purchasable.price,
          total: itemTotal,
        }),
      );

      stockUpdates.push({
        product,
        variantId: purchasable.variantId || null,
        quantity,
      });

      subtotal += itemTotal;
    }

    const finalTaxAmount = Number(taxAmount) || 0;
    let finalShippingAmount = Number(shippingAmount) || 0;
    let finalDiscountAmount = Number(discountAmount) || 0;
    let shippingSnapshot = null;
    let selectedShippingMethodId = null;

    let appliedCoupon = null;
    let appliedCouponCode = "";
    let appliedCouponDiscountType = "";
    let appliedCouponDiscountValue = 0;

    if (couponCode) {
      const formattedCouponCode = String(couponCode).trim().toUpperCase();
      const coupon = await Coupon.findOne({ code: formattedCouponCode });

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

      if (subtotal < coupon.minimumOrderAmount) {
        return sendResponse(
          res,
          400,
          false,
          `Minimum order amount for this coupon is ${coupon.minimumOrderAmount}`
        );
      }

      let couponDiscountAmount = 0;

      if (coupon.discountType === "percentage") {
        couponDiscountAmount = (subtotal * coupon.discountValue) / 100;
      } else {
        couponDiscountAmount = coupon.discountValue;
      }

      finalDiscountAmount = Math.min(couponDiscountAmount, subtotal);

      appliedCoupon = coupon;
      appliedCouponCode = coupon.code;
      appliedCouponDiscountType = coupon.discountType;
      appliedCouponDiscountValue = coupon.discountValue;
    }

    const { shippingEnabled } = await getStoreShippingSettings();
    const itemCount = orderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    if (shippingMethodId || shippingMethodCode) {
      const quote = await quoteShippingMethod({
        shippingMethodId,
        shippingMethodCode,
        subtotal,
        itemCount,
        location: buildLocationFromCustomer(existingCustomer),
        shippingEnabled
      });

      if (quote.error) {
        return sendResponse(res, 400, false, quote.error);
      }

      finalShippingAmount = await applyStoreFreeShippingOverride(quote.charge, subtotal);
      shippingSnapshot = quote.snapshot
        ? { ...quote.snapshot, charge: finalShippingAmount }
        : null;
      selectedShippingMethodId = quote.method?._id || null;
    } else if (!shippingEnabled) {
      finalShippingAmount = 0;
    }

    let paymentSnapshot = null;
    let selectedPaymentMethodId = null;
    let paymentMethodLabel = paymentMethod ? String(paymentMethod).trim() : "";

    if (paymentMethodId || paymentMethodCode) {
      const paymentQuote = await quotePaymentMethod({
        paymentMethodId,
        paymentMethodCode,
        subtotal,
        location: buildPaymentLocationFromCustomer(existingCustomer)
      });

      if (paymentQuote.error) {
        return sendResponse(res, 400, false, paymentQuote.error);
      }

      paymentSnapshot = paymentQuote.snapshot;
      selectedPaymentMethodId = paymentQuote.method?._id || null;
      paymentMethodLabel = paymentQuote.label;
      if (!paymentStatus) {
        finalPaymentStatus = paymentQuote.initialPaymentStatus;
      }
    }

    const totalAmount =
      subtotal + finalTaxAmount + finalShippingAmount - finalDiscountAmount;
    const shippingAddressSnapshot = buildAddressSnapshot(existingCustomer);
    const fulfillment = buildInitialFulfillment({
      orderStatus: finalOrderStatus,
      notes
    });

    const order = await Order.create({
      customer,
      items: orderItems,
      subtotal,
      taxAmount: finalTaxAmount,
      shippingAmount: finalShippingAmount,
      shippingMethod: selectedShippingMethodId,
      shippingMethodSnapshot: shippingSnapshot,
      discountAmount: finalDiscountAmount,
      coupon: appliedCoupon ? appliedCoupon._id : null,
      couponCode: appliedCouponCode,
      couponDiscountType: appliedCouponDiscountType,
      couponDiscountValue: appliedCouponDiscountValue,
      totalAmount,
      paymentStatus: finalPaymentStatus,
      paymentMethodRef: selectedPaymentMethodId,
      paymentMethodSnapshot: paymentSnapshot,
      paymentMethod: paymentMethodLabel,
      shippingAddressSnapshot,
      fulfillment,
      orderStatus: finalOrderStatus,
      notes: notes || "",
      createdBy: req.admin._id
    });

    initializeOrderLifecycle(order, {
      actorType: "admin",
      createdBy: req.admin._id,
      message: "Order created by admin",
      metadata: { source: "admin" },
    });
    await order.save();

    if (appliedCoupon) {
      appliedCoupon.usedCount += 1;
      await appliedCoupon.save();
    }

    if (shouldReduceStock) {
      for (const stockItem of stockUpdates) {
        const deduction = await deductPurchasableStock(
          stockItem.product,
          stockItem.variantId,
          stockItem.quantity,
        );

        if (!deduction.success) {
          return sendResponse(res, 400, false, deduction.error);
        }
      }
    }

    const populatedOrder = await Order.findById(order._id)
      .populate("customer", "firstName lastName email phone")
      .populate("items.product", "name sku featuredImage")
      .populate("shippingMethod", "name code displayName type")
    .populate("paymentMethodRef", "name code displayName type provider")
    .populate("sourceOrder", "orderNumber orderStatus totalAmount")
    .populate("returnRequest", "type status reason");

    await logActivity({
      admin: req.admin._id,
      action: "ORDER_CREATED",
      module: "ORDER",
      description: `Order created: ${order.orderNumber}`,
      entityId: order._id.toString(),
      entityType: "Order",
      metadata: {
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        totalAmount: order.totalAmount
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    return sendResponse(res, 201, true, "Order created successfully", mapOrderForAdmin(populatedOrder));
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getAllOrders = async (req, res) => {
  try {
    const {
      search,
      customer,
      paymentStatus,
      orderStatus,
      fulfillmentStatus,
      hasTracking,
      startDate,
      endDate,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const query = {};

    if (customer) {
      query.customer = customer;
    }

    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }

    if (orderStatus) {
      query.orderStatus = orderStatus;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    const fulfillmentFilter = buildFulfillmentStatusFilter(fulfillmentStatus);
    if (fulfillmentFilter) {
      query.$and = [...(query.$and || []), fulfillmentFilter];
    }

    if (hasTracking === "true") {
      query.$and = [
        ...(query.$and || []),
        { "fulfillment.trackingNumber": { $exists: true, $ne: "" } }
      ];
    }

    if (hasTracking === "false") {
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { "fulfillment.trackingNumber": { $exists: false } },
            { "fulfillment.trackingNumber": "" },
            { "fulfillment.trackingNumber": null }
          ]
        }
      ];
    }

    if (search) {
      const matchedCustomers = await Customer.find({
        $or: [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } }
        ]
      }).select("_id");

      const customerIds = matchedCustomers.map((item) => item._id);

      query.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        { "items.productName": { $regex: search, $options: "i" } },
        { "items.sku": { $regex: search, $options: "i" } },
        { "fulfillment.trackingNumber": { $regex: search, $options: "i" } },
        { "fulfillment.carrier": { $regex: search, $options: "i" } },
        ...(customerIds.length > 0 ? [{ customer: { $in: customerIds } }] : [])
      ];
    }

    const currentPage = Number(page) > 0 ? Number(page) : 1;
    const pageLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (currentPage - 1) * pageLimit;
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const orders = await Order.find(query)
      .populate("customer", "firstName lastName email phone")
      .populate("items.product", "name sku featuredImage")
      .populate("shippingMethod", "name code displayName type")
      .populate("paymentMethodRef", "name code displayName type provider")
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(pageLimit);

    const totalOrders = await Order.countDocuments(query);

    return sendResponse(res, 200, true, "Order list fetched successfully", {
      orders: mapOrdersForAdmin(orders),
      pagination: {
        totalOrders,
        currentPage,
        totalPages: Math.ceil(totalOrders / pageLimit),
        pageLimit
      }
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer", "firstName lastName email phone address")
      .populate("items.product", "name sku featuredImage galleryImages")
      .populate("shippingMethod", "name code displayName type")
      .populate("paymentMethodRef", "name code displayName type provider")
      .populate("sourceOrder", "orderNumber orderStatus totalAmount")
      .populate("returnRequest", "type status reason");

    if (!order) {
      return sendResponse(res, 404, false, "Order not found");
    }

    return sendResponse(res, 200, true, "Order fetched successfully", mapOrderForAdmin(order));
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { paymentStatus, orderStatus, notes, reason, allowAdminOverride } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return sendResponse(res, 404, false, "Order not found");
    }

    if (paymentStatus) {
      if (!PAYMENT_STATUS_OPTIONS.includes(paymentStatus)) {
        return sendResponse(res, 400, false, "Invalid payment status");
      }

      order.paymentStatus = paymentStatus;

      if (paymentStatus === "paid" && !order.paidAt) {
        order.paidAt = new Date();
      }

      if (["refunded", "partially_refunded"].includes(paymentStatus)) {
        order.refundedAt = order.refundedAt || new Date();
      }

      appendTimelineEvent(
        order,
        buildTimelineEntry({
          status: order.orderStatus,
          label: "Payment updated",
          message: `Payment status changed to ${paymentStatus.replace(/_/g, " ")}`,
          note: notes || "",
          createdBy: req.admin?._id || null,
          actorType: "admin",
          metadata: { paymentStatus },
        }),
      );
    }

    if (orderStatus !== undefined && orderStatus !== order.orderStatus) {
      const result = await applyOrderStatusChange(order, orderStatus, {
        createdBy: req.admin?._id || null,
        actorType: "admin",
        note: notes,
        reason,
        allowAdminOverride: Boolean(allowAdminOverride),
        message: reason
          ? `Order status changed to ${getStatusLabel(orderStatus)}`
          : undefined,
      });

      if (!result.success) {
        return sendResponse(res, 400, false, result.error);
      }
    }

    if (notes !== undefined && orderStatus === undefined) {
      order.notes = notes;
    }

    await order.save();

    await logActivity({
      admin: req.admin._id,
      action: "ORDER_STATUS_UPDATED",
      module: "ORDER",
      description: `Order status updated to ${order.orderStatus}`,
      entityId: order._id.toString(),
      entityType: "Order",
      metadata: {
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const updatedOrder = await getPopulatedOrder(order._id);

    if (updatedOrder?.customer?.email) {
      try {
        const orderStatusTemplate = orderStatusUpdateTemplate(updatedOrder);
        await sendEmail({
          to: updatedOrder.customer.email,
          ...orderStatusTemplate
        });
      } catch (error) {
        // Email failures should not break order update flow.
      }
    }

    return sendResponse(res, 200, true, "Order updated successfully", mapOrderForAdmin(updatedOrder));
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const { paymentStatus, paymentMethod, paymentReference, notes, paymentMethodId, paymentMethodCode } =
      req.body;

    if (!paymentStatus) {
      return sendResponse(res, 400, false, "Payment status is required");
    }

    if (!PAYMENT_STATUS_OPTIONS.includes(paymentStatus)) {
      return sendResponse(
        res,
        400,
        false,
        "Invalid payment status"
      );
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return sendResponse(res, 404, false, "Order not found");
    }

    order.paymentStatus = paymentStatus;

    if (paymentMethodId || paymentMethodCode) {
      const paymentQuote = await quotePaymentMethod({
        paymentMethodId,
        paymentMethodCode,
        subtotal: order.subtotal,
        location: buildPaymentLocationFromCustomer(
          await Customer.findById(order.customer).lean()
        )
      });

      if (paymentQuote.error) {
        return sendResponse(res, 400, false, paymentQuote.error);
      }

      order.paymentMethodRef = paymentQuote.method?._id || null;
      order.paymentMethodSnapshot = paymentQuote.snapshot;
      order.paymentMethod = paymentQuote.label;
    } else if (paymentMethod !== undefined) {
      order.paymentMethod = paymentMethod;
    }

    if (paymentReference !== undefined) {
      order.paymentReference = paymentReference;
    }

    if (notes !== undefined) {
      order.notes = notes;
    }

    if (paymentStatus === "paid" && !order.paidAt) {
      order.paidAt = new Date();
    }

    if (paymentStatus === "refunded" || paymentStatus === "partially_refunded") {
      order.refundedAt = new Date();
    }

    appendTimelineEvent(
      order,
      buildTimelineEntry({
        status: order.orderStatus,
        label: "Payment updated",
        message: `Payment status changed to ${paymentStatus.replace(/_/g, " ")}`,
        note: notes || paymentReference || "",
        createdBy: req.admin?._id || null,
        actorType: "admin",
        metadata: {
          paymentStatus,
          paymentReference: order.paymentReference,
        },
      }),
    );

    await order.save();

    await logActivity({
      admin: req.admin._id,
      action: "ORDER_PAYMENT_STATUS_UPDATED",
      module: "ORDER",
      description: `Order payment status updated to ${order.paymentStatus}`,
      entityId: order._id.toString(),
      entityType: "Order",
      metadata: {
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        paymentReference: order.paymentReference
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const updatedOrder = await getPopulatedOrder(order._id);

    if (updatedOrder?.customer?.email) {
      try {
        const paymentTemplate = paymentStatusUpdateTemplate(updatedOrder);
        await sendEmail({
          to: updatedOrder.customer.email,
          ...paymentTemplate
        });
      } catch (error) {
        // Email failures should not break payment update flow.
      }
    }

    return sendResponse(
      res,
      200,
      true,
      "Order payment status updated successfully",
      mapOrderForAdmin(updatedOrder)
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateOrderFulfillment = async (req, res) => {
  try {
    const {
      status,
      carrier,
      trackingNumber,
      trackingUrl,
      notes
    } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return sendResponse(res, 404, false, "Order not found");
    }

    if (order.orderStatus === "cancelled") {
      return sendResponse(
        res,
        400,
        false,
        "Cancelled orders cannot be moved through fulfillment."
      );
    }

    const previousFulfillment = getFulfillmentSnapshot(order);
    const nextStatus = status ? normalizeText(status).toLowerCase() : previousFulfillment.status;

    if (status && !FULFILLMENT_STATUS_OPTIONS.includes(nextStatus)) {
      return sendResponse(res, 400, false, "Invalid fulfillment status");
    }

    if (!canTransitionFulfillment(previousFulfillment.status, nextStatus)) {
      return sendResponse(
        res,
        400,
        false,
        `Cannot move fulfillment from ${previousFulfillment.status} to ${nextStatus}`
      );
    }

    const nextFulfillment = {
      ...previousFulfillment,
      status: nextStatus,
      carrier: carrier !== undefined ? normalizeText(carrier) : previousFulfillment.carrier,
      trackingNumber:
        trackingNumber !== undefined
          ? normalizeText(trackingNumber)
          : previousFulfillment.trackingNumber,
      trackingUrl:
        trackingUrl !== undefined ? normalizeText(trackingUrl) : previousFulfillment.trackingUrl,
      notes: notes !== undefined ? normalizeText(notes) : previousFulfillment.notes
    };

    if (nextStatus === "shipped" && !nextFulfillment.trackingNumber) {
      return sendResponse(
        res,
        400,
        false,
        "Tracking number is required before marking an order as shipped."
      );
    }

    if (nextStatus === "delivered" && previousFulfillment.status !== "shipped") {
      return sendResponse(
        res,
        400,
        false,
        "Only shipped orders can be marked as delivered."
      );
    }

    if (nextStatus === "shipped" && !nextFulfillment.shippedAt) {
      nextFulfillment.shippedAt = new Date();
    }

    if (nextStatus === "delivered") {
      if (!nextFulfillment.shippedAt) {
        nextFulfillment.shippedAt = new Date();
      }

      if (!nextFulfillment.deliveredAt) {
        nextFulfillment.deliveredAt = new Date();
      }
    }

    if (nextStatus !== "delivered") {
      nextFulfillment.deliveredAt =
        nextStatus === "returned" ? previousFulfillment.deliveredAt : nextFulfillment.deliveredAt;
    }

    order.fulfillment = nextFulfillment;
    applyOrderStatusForFulfillment(order, nextStatus);

    appendTimelineEvent(
      order,
      buildTimelineEntry({
        status: order.orderStatus,
        label: getStatusLabel(order.orderStatus),
        message: buildFulfillmentActivityDescription(
          nextStatus === "shipped"
            ? "ORDER_SHIPPED"
            : nextStatus === "delivered"
              ? "ORDER_DELIVERED"
              : "ORDER_FULFILLMENT_UPDATED",
          nextFulfillment,
        ),
        note: notes || nextFulfillment.notes || "",
        createdBy: req.admin?._id || null,
        actorType: "admin",
        metadata: {
          fulfillmentStatus: nextFulfillment.status,
          trackingNumber: nextFulfillment.trackingNumber,
        },
      }),
    );

    await order.save();
    await logFulfillmentActivities({
      req,
      order,
      previousFulfillment,
      nextFulfillment,
      providedNotes: notes
    });

    const updatedOrder = await getPopulatedOrder(order._id);

    return sendResponse(
      res,
      200,
      true,
      "Order fulfillment updated successfully",
      mapOrderForAdmin(updatedOrder)
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateOrderTracking = async (req, res) => {
  try {
    const { courierName, trackingNumber, trackingUrl, moveToShipped, note } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return sendResponse(res, 404, false, "Order not found");
    }

    if (order.orderStatus === "cancelled") {
      return sendResponse(res, 400, false, "Cancelled orders cannot receive tracking updates.");
    }

    const { order: updatedOrderState, shouldMoveToShipped } = applyTrackingUpdate(
      order,
      { courierName, trackingNumber, trackingUrl, moveToShipped },
      {
        createdBy: req.admin?._id || null,
        actorType: "admin",
        note,
      },
    );

    if (shouldMoveToShipped) {
      const currentStatus = updatedOrderState.orderStatus;
      if (!["shipped", "out_for_delivery", "delivered"].includes(currentStatus)) {
        const result = await applyOrderStatusChange(updatedOrderState, "shipped", {
          createdBy: req.admin?._id || null,
          actorType: "admin",
          note,
          allowAdminOverride: true,
          reason: "tracking_added",
          message: "Order marked as shipped",
        });

        if (!result.success) {
          return sendResponse(res, 400, false, result.error);
        }
      }
    }

    await updatedOrderState.save();

    await logActivity({
      admin: req.admin._id,
      action: "ORDER_TRACKING_UPDATED",
      module: "ORDER",
      description: `Tracking updated for order ${order.orderNumber}`,
      entityId: order._id.toString(),
      entityType: "Order",
      metadata: {
        trackingNumber: updatedOrderState.fulfillment?.trackingNumber,
        courierName: updatedOrderState.fulfillment?.carrier,
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    const updatedOrder = await getPopulatedOrder(order._id);
    return sendResponse(
      res,
      200,
      true,
      "Order tracking updated successfully",
      mapOrderForAdmin(updatedOrder),
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const addOrderNote = async (req, res) => {
  try {
    const { note, isPrivate = true } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return sendResponse(res, 404, false, "Order not found");
    }

    const result = addAdminNote(order, {
      note,
      isPrivate,
      createdBy: req.admin?._id || null,
    });

    if (!result.success) {
      return sendResponse(res, 400, false, result.error);
    }

    await order.save();

    await logActivity({
      admin: req.admin._id,
      action: "ORDER_NOTE_ADDED",
      module: "ORDER",
      description: `Admin note added to order ${order.orderNumber}`,
      entityId: order._id.toString(),
      entityType: "Order",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    const updatedOrder = await getPopulatedOrder(order._id);
    return sendResponse(res, 201, true, "Order note added successfully", mapOrderForAdmin(updatedOrder));
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const processOrderRefund = async (req, res) => {
  try {
    const {
      refundAmount,
      refundReference,
      paymentStatus = "refunded",
      paymentReference,
      note,
      reason,
    } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return sendResponse(res, 404, false, "Order not found");
    }

    const result = applyRefundUpdate(
      order,
      {
        refundAmount,
        refundReference,
        paymentStatus,
        paymentReference,
      },
      {
        createdBy: req.admin?._id || null,
        actorType: "admin",
        note,
        reason,
      },
    );

    if (!result.success) {
      return sendResponse(res, 400, false, result.error);
    }

    await order.save();

    await logActivity({
      admin: req.admin._id,
      action: "ORDER_REFUND_RECORDED",
      module: "ORDER",
      description: `Refund recorded for order ${order.orderNumber}`,
      entityId: order._id.toString(),
      entityType: "Order",
      metadata: {
        refundAmount: order.refundAmount,
        refundReference: order.refundReference,
        paymentStatus: order.paymentStatus,
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    const updatedOrder = await getPopulatedOrder(order._id);
    return sendResponse(res, 200, true, "Order refund recorded successfully", mapOrderForAdmin(updatedOrder));
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return sendResponse(res, 404, false, "Order not found");
    }

    return sendResponse(
      res,
      400,
      false,
      "Orders cannot be deleted directly. Please cancel the order instead to preserve order, payment, inventory, and audit history."
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  updatePaymentStatus,
  updateOrderFulfillment,
  updateOrderTracking,
  addOrderNote,
  processOrderRefund,
  deleteOrder,
  mapOrderForPublic,
};