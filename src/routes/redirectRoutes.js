const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createRedirect,
  getAllRedirects,
  getRedirectById,
  updateRedirect,
  deleteRedirect,
  lookupRedirect
} = require("../controllers/redirectController");

const router = express.Router();

// Public lookup route (no auth)
router.get("/lookup", lookupRedirect);

// Admin routes
router.use(protect);
router.post("/", createRedirect);
router.get("/", getAllRedirects);
router.get("/:id", getRedirectById);
router.put("/:id", updateRedirect);
router.delete("/:id", deleteRedirect);

module.exports = router;
