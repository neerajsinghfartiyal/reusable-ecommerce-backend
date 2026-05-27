const express = require("express");
const {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  applyCouponToCart,
  removeCouponFromCart,
  checkoutCart
} = require("../controllers/cartController");

const router = express.Router();

router.get("/:sessionId", getCart);
router.post("/:sessionId/items", addToCart);
router.put("/:sessionId/items/:productId", updateCartItem);
router.delete("/:sessionId/items/:productId", removeCartItem);
router.delete("/:sessionId", clearCart);
router.post("/:sessionId/coupon", applyCouponToCart);
router.delete("/:sessionId/coupon", removeCouponFromCart);
router.post("/:sessionId/checkout", checkoutCart);

module.exports = router;
