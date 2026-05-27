const express = require("express");
const UnitType = require("../models/UnitType");
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

router.post("/", createMaster(UnitType));
router.get("/", getAllMasters(UnitType));
router.get("/:id", getMasterById(UnitType));
router.put("/:id", updateMaster(UnitType));
router.delete("/:id", deleteMaster(UnitType));

module.exports = router;