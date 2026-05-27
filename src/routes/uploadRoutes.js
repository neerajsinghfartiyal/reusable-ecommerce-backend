const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { uploadProductImages } = require("../middleware/uploadMiddleware");
const {
  uploadProductImages: uploadProductImagesController
} = require("../controllers/uploadController");

const router = express.Router();

router.use(protect);

router.post(
  "/products",
  uploadProductImages.fields([
    { name: "featuredImage", maxCount: 1 },
    { name: "galleryImages", maxCount: 5 }
  ]),
  uploadProductImagesController
);

module.exports = router;