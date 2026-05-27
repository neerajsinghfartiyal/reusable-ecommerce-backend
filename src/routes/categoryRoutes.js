const express = require("express");
const Category = require("../models/Category");
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

router.post("/", createMaster(Category));
router.get("/", getAllMasters(Category));
router.get("/:id", getMasterById(Category));
router.put("/:id", updateMaster(Category));
router.delete("/:id", deleteMaster(Category));

module.exports = router;