const Order = require("../models/Order");
const Product = require("../models/Product");
const ReturnRequest = require("../models/ReturnRequest");
const { buildInitialFulfillment } = require("../utils/orderFulfillment");

const REPLACEMENT_ELIGIBLE_STATUSES = ["approved", "received", "exchanged"];

const cloneAddressSnapshot = (snapshot = {}) => ({
  firstName: snapshot.firstName || "",
  lastName: snapshot.lastName || "",
  email: snapshot.email || "",
  phone: snapshot.phone || "",
  street: snapshot.street || "",
  city: snapshot.city || "",
  state: snapshot.state || "",
  postalCode: snapshot.postalCode || "",
  country: snapshot.country || ""
});

const buildReplacementOrderItems = (returnRequest, sourceOrder) => {
  const orderItemsByProduct = new Map();

  for (const orderItem of sourceOrder.items || []) {
    const productId = String(orderItem.product?._id || orderItem.product);
    orderItemsByProduct.set(productId, orderItem);
  }

  const replacementItems = [];

  for (const requestItem of returnRequest.items || []) {
    const productId = String(requestItem.product?._id || requestItem.product);
    const sourceItem = orderItemsByProduct.get(productId);

    if (!sourceItem) {
      throw new Error(
        `Return item ${requestItem.sku || productId} is not present on the source order.`
      );
    }

    const quantity = Number(requestItem.quantity || 0);
    const price = Number(sourceItem.price || 0);

    replacementItems.push({
      product: sourceItem.product?._id || sourceItem.product,
      productName: requestItem.productName || sourceItem.productName || "",
      sku: requestItem.sku || sourceItem.sku || "",
      quantity,
      price,
      total: price * quantity
    });
  }

  return replacementItems;
};

const reduceStockForReplacementItems = async (items) => {
  for (const item of items) {
    const updatedProduct = await Product.findOneAndUpdate(
      {
        _id: item.product,
        quantity: { $gte: item.quantity }
      },
      {
        $inc: { quantity: -item.quantity }
      },
      { new: true }
    );

    if (!updatedProduct) {
      throw new Error(
        `Insufficient stock for ${item.productName || item.sku}. Please refresh and try again.`
      );
    }
  }
};

const assertExchangeReturnRequest = (returnRequest) => {
  if (!returnRequest) {
    throw new Error("Return request not found.");
  }

  if (returnRequest.type !== "exchange") {
    throw new Error("Replacement orders can only be created for exchange requests.");
  }

  if (returnRequest.status === "closed" || returnRequest.status === "rejected") {
    throw new Error("Closed or rejected exchange requests cannot receive replacement orders.");
  }
};

const assertNoExistingReplacement = (returnRequest) => {
  if (returnRequest.replacementOrder) {
    throw new Error("This exchange request already has a linked replacement order.");
  }
};

const createReplacementOrderForReturn = async (returnRequestId, adminId) => {
  const returnRequest = await ReturnRequest.findById(returnRequestId);

  assertExchangeReturnRequest(returnRequest);
  assertNoExistingReplacement(returnRequest);

  if (!REPLACEMENT_ELIGIBLE_STATUSES.includes(returnRequest.status)) {
    throw new Error(
      "Replacement orders can be created only after the exchange is approved or received."
    );
  }

  const sourceOrder = await Order.findById(returnRequest.order).populate(
    "items.product",
    "name sku quantity"
  );

  if (!sourceOrder) {
    throw new Error("Source order not found for this exchange request.");
  }

  const replacementItems = buildReplacementOrderItems(returnRequest, sourceOrder);
  const subtotal = replacementItems.reduce((sum, item) => sum + item.total, 0);

  await reduceStockForReplacementItems(replacementItems);

  const replacementOrder = await Order.create({
    customer: sourceOrder.customer,
    items: replacementItems,
    subtotal,
    taxAmount: 0,
    shippingAmount: 0,
    discountAmount: subtotal,
    totalAmount: 0,
    paymentStatus: "paid",
    paymentMethod: "Replacement exchange",
    paidAt: new Date(),
    shippingAddressSnapshot: cloneAddressSnapshot(sourceOrder.shippingAddressSnapshot),
    fulfillment: buildInitialFulfillment({ orderStatus: "pending" }),
    orderStatus: "pending",
    orderKind: "replacement",
    sourceOrder: sourceOrder._id,
    returnRequest: returnRequest._id,
    notes: `Replacement order for exchange request ${returnRequest._id}`,
    createdBy: adminId || null
  });

  returnRequest.replacementOrder = replacementOrder._id;
  returnRequest.updatedBy = adminId || null;
  await returnRequest.save();

  return {
    returnRequest,
    replacementOrder
  };
};

const linkReplacementOrderToReturn = async (returnRequestId, replacementOrderId, adminId) => {
  const returnRequest = await ReturnRequest.findById(returnRequestId);

  assertExchangeReturnRequest(returnRequest);
  assertNoExistingReplacement(returnRequest);

  const replacementOrder = await Order.findById(replacementOrderId);

  if (!replacementOrder) {
    throw new Error("Replacement order not found.");
  }

  if (
    returnRequest.customer &&
    replacementOrder.customer &&
    String(returnRequest.customer) !== String(replacementOrder.customer)
  ) {
    throw new Error("Replacement order must belong to the same customer as the exchange request.");
  }

  if (
    replacementOrder.returnRequest &&
    String(replacementOrder.returnRequest) !== String(returnRequest._id)
  ) {
    throw new Error("This order is already linked to another exchange request.");
  }

  returnRequest.replacementOrder = replacementOrder._id;
  returnRequest.updatedBy = adminId || null;

  replacementOrder.orderKind = replacementOrder.orderKind || "replacement";
  replacementOrder.sourceOrder = replacementOrder.sourceOrder || returnRequest.order;
  replacementOrder.returnRequest = returnRequest._id;

  if (!replacementOrder.notes) {
    replacementOrder.notes = `Linked as replacement for exchange request ${returnRequest._id}`;
  }

  await Promise.all([returnRequest.save(), replacementOrder.save()]);

  return {
    returnRequest,
    replacementOrder
  };
};

module.exports = {
  REPLACEMENT_ELIGIBLE_STATUSES,
  createReplacementOrderForReturn,
  linkReplacementOrderToReturn
};
