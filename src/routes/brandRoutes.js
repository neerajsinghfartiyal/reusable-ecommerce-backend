const express = require("express");
const Brand = require("../models/Brand");
const { protect } = require("../middleware/authMiddleware");
const {
  createMaster,
  getAllMasters,
  getMasterById,
  updateMaster,
  deleteMaster
} = require("../controllers/masterController");

const router = express.Router();

router.use(protect);

router.post("/", createMaster(Brand));
router.get("/", getAllMasters(Brand));
router.get("/:id", getMasterById(Brand));
router.put("/:id", updateMaster(Brand));
router.delete("/:id", deleteMaster(Brand));

module.exports = router;