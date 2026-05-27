const express = require("express");
const {
  getPublicProducts,
  getPublicProductBySlug,
  getPublicCategories,
  getPublicBrands,
  getPublicSettings
} = require("../controllers/publicController");
const { getPublicPageBySlug, getPublicPages } = require("../controllers/pageController");

const router = express.Router();

router.get("/products", getPublicProducts);
router.get("/products/:slug", getPublicProductBySlug);
router.get("/categories", getPublicCategories);
router.get("/brands", getPublicBrands);
router.get("/settings", getPublicSettings);
router.get("/pages", getPublicPages);
router.get("/pages/:slug", getPublicPageBySlug);

module.exports = router;
