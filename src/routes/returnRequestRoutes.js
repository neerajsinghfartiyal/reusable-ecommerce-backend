const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createReturnRequest,
  getAllReturnRequests,
  getReturnRequestById,
  updateReturnRequestStatus,
  deleteReturnRequest
} = require("../controllers/returnRequestController");

const router = express.Router();

router.use(protect);

router.post("/", createReturnRequest);
router.get("/", getAllReturnRequests);
router.get("/:id", getReturnRequestById);
router.put("/:id/status", updateReturnRequestStatus);
router.delete("/:id", deleteReturnRequest);

module.exports = router;
