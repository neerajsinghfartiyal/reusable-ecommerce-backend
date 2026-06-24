const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createReturnRequest,
  getAllReturnRequests,
  getReturnRequestById,
  updateReturnRequestStatus,
  createReplacementOrder,
  linkReplacementOrder,
  deleteReturnRequest
} = require("../controllers/returnRequestController");

const router = express.Router();

router.use(protect);

router.post("/", createReturnRequest);
router.get("/", getAllReturnRequests);
router.get("/:id", getReturnRequestById);
router.put("/:id/status", updateReturnRequestStatus);
router.post("/:id/replacement-order", createReplacementOrder);
router.put("/:id/replacement-order", linkReplacementOrder);
router.delete("/:id", deleteReturnRequest);

module.exports = router;
