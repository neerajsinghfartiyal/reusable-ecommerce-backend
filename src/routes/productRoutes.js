const express = require("express");
const sendResponse = require("../utils/response");
const { protect } = require("../middleware/authMiddleware");
const {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  bulkUpdateProducts,
} = require("../controllers/productController");
const { uploadImportFile } = require("../middleware/uploadMiddleware");
const {
  downloadProductImportTemplateCsv,
  downloadProductImportTemplateXlsx,
  previewProductImport,
  runProductImportHandler,
  getProductImportHistory,
  downloadProductImportErrorsCsv,
} = require("../controllers/productImportController");

const router = express.Router();

router.use(protect);

router.get("/import/template/csv", downloadProductImportTemplateCsv);
router.get("/import/template/xlsx", downloadProductImportTemplateXlsx);
const importUploadMiddleware = (req, res, next) => {
  uploadImportFile.single("file")(req, res, (error) => {
    if (error) {
      return sendResponse(res, 400, false, error.message || "Invalid import file upload.");
    }
    return next();
  });
};

router.post("/import/preview", importUploadMiddleware, previewProductImport);
router.post("/import/run", importUploadMiddleware, runProductImportHandler);
router.get("/import/history", getProductImportHistory);
router.post("/import/errors-csv", downloadProductImportErrorsCsv);
router.get("/import/history/:historyId/errors-csv", downloadProductImportErrorsCsv);

router.patch("/bulk", bulkUpdateProducts);

router.post("/", createProduct);
router.get("/", getAllProducts);
router.get("/:id", getProductById);
router.put("/:id", updateProduct);
router.delete("/:id", deleteProduct);

module.exports = router;