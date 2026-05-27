const express = require("express");
const { loginAdmin, getProfile } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/login", loginAdmin);
router.get("/me", protect, getProfile);

module.exports = router;