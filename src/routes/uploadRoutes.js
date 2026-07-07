const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { runProductUpload } = require("../middleware/uploadMiddleware");
const {
  uploadProductImages: uploadProductImagesController
} = require("../controllers/uploadController");

const router = express.Router();

router.use(protect);

router.post(
  "/products",
  runProductUpload,
  uploadProductImagesController
);

module.exports = router;