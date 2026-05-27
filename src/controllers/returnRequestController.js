const Order = require("../models/Order");
const ReturnRequest = require("../models/ReturnRequest");
const Customer = require("../models/Customer");
const sendResponse = require("../utils/response");
const { logActivity } = require("../utils/activityLogger");
const { getFulfillmentSnapshot } = require("../utils/orderFulfillment");

const allowedTypes = ["return", "exchange"];
const allowedStatuses = [
  "requested",
  "approved",
  "rejected",
  "received",
  "refunded",
  "exchanged",
  "closed"
];

const createReturnRequest = async (req, res) => {
  try {
    const { order, type, reason, notes, items } = req.body;

    if (!order) {
      return sendResponse(res, 400, false, "Order is required");
    }

    if (!allowedTypes.includes(type)) {
      return sendResponse(res, 400, false, "Type must be return or exchange");
    }

    if (!reason || !String(reason).trim()) {
      return sendResponse(res, 400, false, "Reason is required");
    }

    if (!Array.isArray(items) || items.length === 0) {
      return sendResponse(res, 400, false, "At least one return item is required");
    }

    const orderDoc = await Order.findById(order)
      .populate("customer", "firstName lastName email phone")
      .populate("items.product", "name sku");

    if (!orderDoc) {
      return sendResponse(res, 404, false, "Order not found");
    }

    if (orderDoc.orderStatus === "cancelled") {
      return sendResponse(
        res,
        400,
        false,
        "Cancelled orders cannot have return/exchange requests"
      );
    }

    if (orderDoc.orderStatus !== "delivered") {
      return sendResponse(
        res,
        400,
        false,
        "Only delivered orders can have return/exchange requests"
      );
    }

    const orderItemsMap = new Map();

    for (const orderItem of orderDoc.items) {
      const productId = String(orderItem.product?._id || orderItem.product);
      orderItemsMap.set(productId, orderItem);
    }

    const normalizedItems = [];

    for (const requestItem of items) {
      const productId = String(requestItem?.product || "");
      const quantity = Number(requestItem?.quantity || 0);

      if (!productId) {
        return sendResponse(res, 400, false, "Each item must include product");
      }

      if (!Number.isFinite(quantity) || quantity < 1) {
        return sendResponse(res, 400, false, "Each item quantity must be at least 1");
      }

      const orderedItem = orderItemsMap.get(productId);

      if (!orderedItem) {
        return sendResponse(
          res,
          400,
          false,
          "One or more requested items do not exist in the original order"
        );
      }

      if (quantity > Number(orderedItem.quantity || 0)) {
        return sendResponse(
          res,
          400,
          false,
          `Return quantity cannot exceed ordered quantity for product ${orderedItem.productName || orderedItem.sku || productId}`
        );
      }

      normalizedItems.push({
        product: orderedItem.product?._id || orderedItem.product,
        productName: orderedItem.productName || orderedItem.product?.name || "",
        sku: orderedItem.sku || orderedItem.product?.sku || "",
        quantity,
        reason: requestItem?.reason || "",
        condition: requestItem?.condition || "other",
        restockable: Boolean(requestItem?.restockable)
      });
    }

    const returnRequest = await ReturnRequest.create({
      order: orderDoc._id,
      customer: orderDoc.customer?._id || null,
      type,
      reason: String(reason).trim(),
      notes: notes || "",
      items: normalizedItems,
      createdBy: req.admin?._id || null,
      updatedBy: req.admin?._id || null
    });

    await logActivity({
      admin: req.admin?._id,
      action: "RETURN_REQUEST_CREATED",
      module: "RETURN",
      description: `Return request created for order ${orderDoc.orderNumber || orderDoc._id}`,
      entityId: returnRequest._id.toString(),
      entityType: "ReturnRequest",
      metadata: {
        order: String(orderDoc._id),
        type: returnRequest.type,
        status: returnRequest.status
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const populatedReturnRequest = await ReturnRequest.findById(returnRequest._id)
      .populate("order", "orderNumber orderStatus paymentStatus totalAmount fulfillment")
      .populate("customer", "firstName lastName email phone")
      .populate("items.product", "name sku featuredImage")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .populate("reviewedBy", "name email");

    return sendResponse(
      res,
      201,
      true,
      "Return request created successfully",
      populatedReturnRequest
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getAllReturnRequests = async (req, res) => {
  try {
    const {
      search,
      status,
      type,
      order,
      customer,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    if (type) {
      query.type = type;
    }

    if (order) {
      query.order = order;
    }

    if (customer) {
      query.customer = customer;
    }

    if (search) {
      const matchedOrders = await Order.find({
        orderNumber: { $regex: search, $options: "i" }
      }).select("_id");

      const matchedCustomers = await Customer.find({
        $or: [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } }
        ]
      }).select("_id");

      query.$or = [
        { reason: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
        { type: { $regex: search, $options: "i" } },
        ...(matchedOrders.length > 0
          ? [{ order: { $in: matchedOrders.map((item) => item._id) } }]
          : []),
        ...(matchedCustomers.length > 0
          ? [{ customer: { $in: matchedCustomers.map((item) => item._id) } }]
          : [])
      ];
    }

    const currentPage = Number(page) > 0 ? Number(page) : 1;
    const pageLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (currentPage - 1) * pageLimit;
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const returnRequests = await ReturnRequest.find(query)
      .populate("order", "orderNumber orderStatus paymentStatus totalAmount fulfillment")
      .populate("customer", "firstName lastName email phone")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .populate("reviewedBy", "name email")
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(pageLimit);

    const totalItems = await ReturnRequest.countDocuments(query);

    return sendResponse(res, 200, true, "Return request list fetched successfully", {
      returnRequests,
      pagination: {
        totalItems,
        currentPage,
        totalPages: Math.ceil(totalItems / pageLimit),
        pageLimit
      }
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getReturnRequestById = async (req, res) => {
  try {
    const returnRequest = await ReturnRequest.findById(req.params.id)
      .populate("order", "orderNumber orderStatus paymentStatus totalAmount items fulfillment shippingAddressSnapshot")
      .populate("customer", "firstName lastName email phone address")
      .populate("items.product", "name sku featuredImage galleryImages")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .populate("reviewedBy", "name email");

    if (!returnRequest) {
      return sendResponse(res, 404, false, "Return request not found");
    }

    return sendResponse(
      res,
      200,
      true,
      "Return request fetched successfully",
      returnRequest
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateReturnRequestStatus = async (req, res) => {
  try {
    const { status, notes, refundAmount } = req.body;

    if (!allowedStatuses.includes(status)) {
      return sendResponse(res, 400, false, "Invalid return request status");
    }

    const returnRequest = await ReturnRequest.findById(req.params.id);

    if (!returnRequest) {
      return sendResponse(res, 404, false, "Return request not found");
    }

    let parsedRefundAmount = returnRequest.refundAmount;
    if (refundAmount !== undefined) {
      parsedRefundAmount = Number(refundAmount);

      if (!Number.isFinite(parsedRefundAmount) || parsedRefundAmount < 0) {
        return sendResponse(res, 400, false, "Refund amount must be a valid number");
      }
    }

    const orderDoc = returnRequest.order ? await Order.findById(returnRequest.order) : null;

    if (
      status === "refunded" &&
      orderDoc &&
      parsedRefundAmount > Number(orderDoc.totalAmount || 0)
    ) {
      return sendResponse(
        res,
        400,
        false,
        "Refund amount cannot exceed the order total."
      );
    }

    returnRequest.status = status;

    if (notes !== undefined) {
      returnRequest.notes = notes || "";
    }

    if (refundAmount !== undefined) {
      returnRequest.refundAmount = parsedRefundAmount;
    }

    if (["approved", "rejected", "refunded", "exchanged", "closed"].includes(status)) {
      returnRequest.reviewedBy = req.admin?._id || null;
      returnRequest.reviewedAt = new Date();
    }

    returnRequest.updatedBy = req.admin?._id || null;

    await returnRequest.save();

    if (orderDoc && ["received", "refunded", "exchanged"].includes(status)) {
      const previousFulfillmentStatus = getFulfillmentSnapshot(orderDoc).status;

      if (status === "refunded") {
        const totalAmount = Number(orderDoc.totalAmount || 0);
        const nextRefundAmount = Number(returnRequest.refundAmount || 0);

        if (nextRefundAmount <= totalAmount) {
          orderDoc.paymentStatus =
            nextRefundAmount > 0 && nextRefundAmount < totalAmount
              ? "partially_refunded"
              : "refunded";
          orderDoc.refundedAt = new Date();
        }
      }

      if (status === "exchanged" && orderDoc.orderStatus !== "cancelled") {
        orderDoc.orderStatus = "delivered";
      }

      const nextFulfillment = {
        ...getFulfillmentSnapshot(orderDoc),
        status: "returned"
      };

      orderDoc.fulfillment = nextFulfillment;
      await orderDoc.save();

      if (previousFulfillmentStatus !== "returned") {
        await logActivity({
          admin: req.admin?._id,
          action: "ORDER_RETURNED",
          module: "ORDER",
          description: "Order marked as returned from fulfillment",
          entityId: orderDoc._id.toString(),
          entityType: "Order",
          metadata: {
            orderStatus: orderDoc.orderStatus,
            fulfillmentStatus: "returned",
            source: "return_request"
          },
          ipAddress: req.ip,
          userAgent: req.get("User-Agent")
        });
      }
    }

    await logActivity({
      admin: req.admin?._id,
      action: "RETURN_REQUEST_STATUS_UPDATED",
      module: "RETURN",
      description: `Return request status updated to ${returnRequest.status}`,
      entityId: returnRequest._id.toString(),
      entityType: "ReturnRequest",
      metadata: {
        status: returnRequest.status,
        refundAmount: returnRequest.refundAmount
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const populatedReturnRequest = await ReturnRequest.findById(returnRequest._id)
      .populate("order", "orderNumber orderStatus paymentStatus totalAmount fulfillment")
      .populate("customer", "firstName lastName email phone")
      .populate("items.product", "name sku featuredImage")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .populate("reviewedBy", "name email");

    return sendResponse(
      res,
      200,
      true,
      "Return request status updated successfully",
      populatedReturnRequest
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const deleteReturnRequest = async (req, res) => {
  try {
    const returnRequest = await ReturnRequest.findById(req.params.id);

    if (!returnRequest) {
      return sendResponse(res, 404, false, "Return request not found");
    }

    returnRequest.status = "closed";
    returnRequest.updatedBy = req.admin?._id || null;

    if (!returnRequest.reviewedBy) {
      returnRequest.reviewedBy = req.admin?._id || null;
    }

    if (!returnRequest.reviewedAt) {
      returnRequest.reviewedAt = new Date();
    }

    await returnRequest.save();

    await logActivity({
      admin: req.admin?._id,
      action: "RETURN_REQUEST_CLOSED",
      module: "RETURN",
      description: "Return request closed",
      entityId: returnRequest._id.toString(),
      entityType: "ReturnRequest",
      metadata: {
        status: returnRequest.status
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    return sendResponse(res, 200, true, "Return request closed successfully");
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createReturnRequest,
  getAllReturnRequests,
  getReturnRequestById,
  updateReturnRequestStatus,
  deleteReturnRequest
};
