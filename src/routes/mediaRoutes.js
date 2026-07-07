const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { runMediaUpload } = require("../middleware/uploadMiddleware");
const {
  uploadMedia,
  getAllMedia,
  getProductMediaIdsBackfillDryRun,
  applyProductMediaIdsBackfill,
  getMediaUsage,
  getMediaById,
  updateMedia,
  deleteMedia
} = require("../controllers/mediaController");

const router = express.Router();

router.use(protect);

router.post("/upload", runMediaUpload, uploadMedia);
router.get("/", getAllMedia);
router.get("/backfill/product-media-ids/dry-run", getProductMediaIdsBackfillDryRun);
router.post("/backfill/product-media-ids/apply", applyProductMediaIdsBackfill);
router.get("/:id/usage", getMediaUsage);
router.get("/:id", getMediaById);
router.put("/:id", updateMedia);
router.delete("/:id", deleteMedia);

module.exports = router;
