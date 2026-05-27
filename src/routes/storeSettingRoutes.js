const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  getStoreSettings,
  updateStoreSettings
} = require("../controllers/storeSettingController");

const router = express.Router();

router.use(protect);

router.get("/", getStoreSettings);
router.put("/", updateStoreSettings);

module.exports = router;