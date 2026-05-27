const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createShippingMethod,
  getAllShippingMethods,
  getShippingMethodById,
  updateShippingMethod,
  deleteShippingMethod
} = require("../controllers/shippingMethodController");

const router = express.Router();

router.use(protect);

router.post("/", createShippingMethod);
router.get("/", getAllShippingMethods);
router.get("/:id", getShippingMethodById);
router.put("/:id", updateShippingMethod);
router.delete("/:id", deleteShippingMethod);

module.exports = router;
