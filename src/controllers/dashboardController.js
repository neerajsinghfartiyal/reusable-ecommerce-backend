const Product = require("../models/Product");
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const ReturnRequest = require("../models/ReturnRequest");
const ActivityLog = require("../models/ActivityLog");
const sendResponse = require("../utils/response");

const LOW_STOCK_THRESHOLD = 10;
const DASHBOARD_LIST_LIMIT = 5;
const OPEN_RETURN_STATUSES = ["requested", "approved", "received"];

const getProductStockQuantity = (product) => {
  const variations = Array.isArray(product?.variations) ? product.variations : [];

  if (variations.length > 0) {
    const quantities = variations
      .filter((variation) => String(variation?.status || "active").toLowerCase() !== "inactive")
      .map((variation) => Number(variation?.quantity) || 0);

    if (quantities.length === 0) {
      return 0;
    }

    return Math.min(...quantities);
  }

  return Number(product?.quantity) || 0;
};

const mapLowStockProduct = (product) => {
  const stock = getProductStockQuantity(product);

  return {
    _id: product._id,
    name: product.name,
    sku: product.sku,
    quantity: stock,
    stock,
  };
};

const getLowStockSnapshot = async () => {
  const catalogProducts = await Product.find({
    status: { $in: ["published", "draft"] },
  })
    .select("name sku quantity variations status")
    .lean();

  const lowStockProducts = catalogProducts
    .map((product) => ({
      product,
      stock: getProductStockQuantity(product),
    }))
    .filter((entry) => entry.stock <= LOW_STOCK_THRESHOLD)
    .sort((left, right) => left.stock - right.stock)
    .map((entry) => mapLowStockProduct(entry.product));

  return {
    lowStockCount: lowStockProducts.length,
    lowStockProducts: lowStockProducts.slice(0, DASHBOARD_LIST_LIMIT),
    lowStockThreshold: LOW_STOCK_THRESHOLD,
  };
};

const mapRecentOrder = (order) => {
  const customer = order?.customer || {};
  const customerName =
    `${customer.firstName || ""} ${customer.lastName || ""}`.trim() ||
    customer.email ||
    "";

  return {
    ...order,
    customerName,
  };
};

const getDashboardStats = async (req, res) => {
  try {
    const [
      totalProducts,
      totalCustomers,
      totalOrders,
      pendingOrders,
      processingOrders,
      shippedOrders,
      returnRequests,
      paidRevenueResult,
      recentOrders,
      recentActivity,
      lowStockSnapshot,
    ] = await Promise.all([
      Product.countDocuments(),
      Customer.countDocuments(),
      Order.countDocuments(),
      Order.countDocuments({ orderStatus: "pending" }),
      Order.countDocuments({ orderStatus: "processing" }),
      Order.countDocuments({ orderStatus: "shipped" }),
      ReturnRequest.countDocuments({ status: { $in: OPEN_RETURN_STATUSES } }),
      Order.aggregate([
        {
          $match: {
            paymentStatus: "paid",
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: "$totalAmount",
            },
          },
        },
      ]),
      Order.find()
        .populate("customer", "firstName lastName email")
        .sort({ createdAt: -1 })
        .limit(DASHBOARD_LIST_LIMIT)
        .lean(),
      ActivityLog.find()
        .sort({ createdAt: -1 })
        .limit(DASHBOARD_LIST_LIMIT)
        .select("action module description entityId entityType createdAt updatedAt")
        .lean(),
      getLowStockSnapshot(),
    ]);

    const totalRevenue =
      paidRevenueResult.length > 0 ? paidRevenueResult[0].totalRevenue : 0;

    return sendResponse(res, 200, true, "Dashboard stats fetched successfully", {
      totalProducts,
      totalCustomers,
      totalOrders,
      totalRevenue,
      revenue: totalRevenue,
      pendingOrders,
      processingOrders,
      shippedOrders,
      returnRequests,
      returnRequestsCount: returnRequests,
      recentOrders: recentOrders.map(mapRecentOrder),
      recentActivity,
      lowStockCount: lowStockSnapshot.lowStockCount,
      lowStockProducts: lowStockSnapshot.lowStockProducts,
      lowStockThreshold: lowStockSnapshot.lowStockThreshold,
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  getDashboardStats,
  LOW_STOCK_THRESHOLD,
};
