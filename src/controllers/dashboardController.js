const Product = require("../models/Product");
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const sendResponse = require("../utils/response");

const getDashboardStats = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const totalCustomers = await Customer.countDocuments();
    const totalOrders = await Order.countDocuments();

    const pendingOrders = await Order.countDocuments({
      orderStatus: "pending"
    });

    const processingOrders = await Order.countDocuments({
      orderStatus: "processing"
    });

    const shippedOrders = await Order.countDocuments({
      orderStatus: "shipped"
    });

    const paidRevenueResult = await Order.aggregate([
      {
        $match: {
          paymentStatus: "paid"
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: "$totalAmount"
          }
        }
      }
    ]);

    const totalRevenue =
      paidRevenueResult.length > 0 ? paidRevenueResult[0].totalRevenue : 0;

    const recentOrders = await Order.find()
      .populate("customer", "firstName lastName email")
      .sort({ createdAt: -1 })
      .limit(5);

    return sendResponse(res, 200, true, "Dashboard stats fetched successfully", {
      totalProducts,
      totalCustomers,
      totalOrders,
      totalRevenue,
      pendingOrders,
      processingOrders,
      shippedOrders,
      recentOrders
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  getDashboardStats
};