const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  getAllActivityLogs,
  getActivityLogById
} = require("../controllers/activityLogController");

const router = express.Router();

router.use(protect);

router.get("/", getAllActivityLogs);
router.get("/:id", getActivityLogById);

module.exports = router;
