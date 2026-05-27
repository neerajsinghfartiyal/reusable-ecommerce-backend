const express = require("express");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");
const {
  createAdmin,
  getAllAdmins,
  getAdminById,
  updateAdmin,
  updateAdminPassword,
  deleteAdmin
} = require("../controllers/adminController");

const router = express.Router();

router.use(protect);

router.post("/", authorizeRoles("super_admin"), createAdmin);
router.get("/", getAllAdmins);
router.get("/:id", getAdminById);
router.put("/:id", authorizeRoles("super_admin"), updateAdmin);
router.put("/:id/password", authorizeRoles("super_admin"), updateAdminPassword);
router.delete("/:id", authorizeRoles("super_admin"), deleteAdmin);

module.exports = router;
