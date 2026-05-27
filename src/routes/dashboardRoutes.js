const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getDashboardStats } = require("../controllers/dashboardController");

const router = express.Router();

router.use(protect);

router.get("/stats", getDashboardStats);

module.exports = router;