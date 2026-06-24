const express = require("express");
const {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  applyCouponToCart,
  removeCouponFromCart,
  getCartShippingOptions,
  setCartShippingMethod,
  getCartPaymentOptions,
  setCartPaymentMethod,
  checkoutCart
} = require("../controllers/cartController");

const router = express.Router();

router.get("/:sessionId/shipping-options", getCartShippingOptions);
router.put("/:sessionId/shipping-method", setCartShippingMethod);
router.get("/:sessionId/payment-options", getCartPaymentOptions);
router.put("/:sessionId/payment-method", setCartPaymentMethod);
router.get("/:sessionId", getCart);
router.post("/:sessionId/items", addToCart);
router.put("/:sessionId/items/:productId", updateCartItem);
router.delete("/:sessionId/items/:productId", removeCartItem);
router.delete("/:sessionId", clearCart);
router.post("/:sessionId/coupon", applyCouponToCart);
router.delete("/:sessionId/coupon", removeCouponFromCart);
router.post("/:sessionId/checkout", checkoutCart);

module.exports = router;
