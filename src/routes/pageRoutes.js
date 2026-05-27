const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createPage,
  getAllPages,
  getPageById,
  updatePage,
  deletePage
} = require("../controllers/pageController");

const router = express.Router();

router.use(protect);

router.post("/", createPage);
router.get("/", getAllPages);
router.get("/:id", getPageById);
router.put("/:id", updatePage);
router.delete("/:id", deletePage);

module.exports = router;
