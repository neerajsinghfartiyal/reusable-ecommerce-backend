const express = require("express");
const {
  getPublicProducts,
  getPublicProductBySlug,
  getPublicCategories,
  getPublicBrands,
  getPublicSettings,
  getPublicShippingOptions,
  getPublicPaymentOptions,
  upsertCheckoutCustomer
} = require("../controllers/publicController");
const { getPublicPageBySlug, getPublicHomePage, getPublicPages } = require("../controllers/pageController");

const router = express.Router();

router.get("/products", getPublicProducts);
router.get("/products/:slug", getPublicProductBySlug);
router.get("/categories", getPublicCategories);
router.get("/brands", getPublicBrands);
router.get("/settings", getPublicSettings);
router.get("/shipping-options", getPublicShippingOptions);
router.get("/payment-options", getPublicPaymentOptions);
router.post("/customers/checkout", upsertCheckoutCustomer);
router.get("/pages", getPublicPages);
router.get("/pages/home", getPublicHomePage);
router.get("/pages/:slug", getPublicPageBySlug);

module.exports = router;
