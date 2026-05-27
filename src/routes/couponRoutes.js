const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createCoupon,
  getAllCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon
} = require("../controllers/couponController");

const router = express.Router();

router.use(protect);

router.post("/", createCoupon);
router.get("/", getAllCoupons);
router.get("/:id", getCouponById);
router.put("/:id", updateCoupon);
router.delete("/:id", deleteCoupon);

module.exports = router;