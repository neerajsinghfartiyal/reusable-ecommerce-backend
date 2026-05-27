const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createAttribute,
  getAllAttributes,
  getAttributeById,
  updateAttribute,
  deleteAttribute
} = require("../controllers/attributeController");

const router = express.Router();

router.use(protect);

router.post("/", createAttribute);
router.get("/", getAllAttributes);
router.get("/:id", getAttributeById);
router.put("/:id", updateAttribute);
router.delete("/:id", deleteAttribute);

module.exports = router;
