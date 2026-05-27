const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer
} = require("../controllers/customerController");

const router = express.Router();

router.use(protect);

router.post("/", createCustomer);
router.get("/", getAllCustomers);
router.get("/:id", getCustomerById);
router.put("/:id", updateCustomer);
router.delete("/:id", deleteCustomer);

module.exports = router;