const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  updatePaymentStatus,
  updateOrderFulfillment,
  deleteOrder
} = require("../controllers/orderController");

const router = express.Router();

router.use(protect);

router.post("/", createOrder);
router.get("/", getAllOrders);
router.get("/:id", getOrderById);
router.put("/:id/status", updateOrderStatus);
router.put("/:id/payment-status", updatePaymentStatus);
router.put("/:id/fulfillment", updateOrderFulfillment);
router.delete("/:id", deleteOrder);

module.exports = router;