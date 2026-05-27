const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createPaymentMethod,
  getAllPaymentMethods,
  getPaymentMethodById,
  updatePaymentMethod,
  deletePaymentMethod
} = require("../controllers/paymentMethodController");

const router = express.Router();

router.use(protect);

router.post("/", createPaymentMethod);
router.get("/", getAllPaymentMethods);
router.get("/:id", getPaymentMethodById);
router.put("/:id", updatePaymentMethod);
router.delete("/:id", deletePaymentMethod);

module.exports = router;
