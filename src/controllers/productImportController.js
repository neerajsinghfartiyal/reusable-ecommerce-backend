const sendResponse = require("../utils/response");
const {
  getCsvBuffer,
  getXlsxBuffer,
  hasXlsxTemplate,
} = require("../services/productImportTemplateService");
const {
  buildEnhancedImportPreviewFromFile,
} = require("../services/productImportEnhancedPreviewService");
const {
  runProductImport,
  buildFailedRowsCsv,
} = require("../services/productImportCommitService");
const ProductImportHistory = require("../models/ProductImportHistory");

const parseJsonField = (value, fallback = {}) => {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const downloadProductImportTemplateCsv = (req, res) => {
  try {
    const buffer = getCsvBuffer();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="product-import-template.csv"',
    );
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate CSV template.",
    });
  }
};

const downloadProductImportTemplateXlsx = (req, res) => {
  try {
    if (!hasXlsxTemplate()) {
      return res.status(503).json({
        success: false,
        message:
          "XLSX template is not available on the server. Use CSV template or run scripts/generateProductImportTemplateXlsx.js.",
        placeholder: true,
      });
    }

    const buffer = getXlsxBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="product-import-template.xlsx"',
    );
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load XLSX template.",
    });
  }
};

const previewProductImport = async (req, res) => {
  try {
    if (!req.file) {
      return sendResponse(res, 400, false, "No import file uploaded. Use field name: file.");
    }

    const duplicateStrategy = req.body?.duplicateStrategy || req.query?.duplicateStrategy;
    const rowMappings = parseJsonField(req.body?.rowMappings, {});
    const checkNameDuplicates =
      req.body?.checkNameDuplicates === "true" || req.body?.checkNameDuplicates === true;
    const autoCreateCatalog = req.body?.autoCreateCatalog !== "false";

    const preview = await buildEnhancedImportPreviewFromFile(
      req.file.buffer,
      req.file.originalname,
      {
        duplicateStrategy,
        rowMappings,
        checkNameDuplicates,
        autoCreateCatalog,
      },
    );

    return sendResponse(
      res,
      200,
      true,
      "Import preview generated. No products were created.",
      {
        ...preview,
        filename: req.file.originalname,
      },
    );
  } catch (error) {
    const statusCode = error.code === "XLSX_PARSER_UNAVAILABLE" ? 501 : 400;
    return sendResponse(
      res,
      statusCode,
      false,
      error.message || "Failed to parse import file.",
    );
  }
};

const runProductImportHandler = async (req, res) => {
  try {
    if (!req.file) {
      return sendResponse(res, 400, false, "No import file uploaded. Use field name: file.");
    }

    const strategy = req.body?.strategy || "skip_duplicates";
    const rowMappings = parseJsonField(req.body?.rowMappings, {});
    const checkNameDuplicates =
      req.body?.checkNameDuplicates === "true" || req.body?.checkNameDuplicates === true;
    const autoCreateCatalog = req.body?.autoCreateCatalog !== "false";

    const result = await runProductImport({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      strategy,
      rowMappings,
      checkNameDuplicates,
      autoCreateCatalog,
      adminId: req.admin._id,
      adminMeta: {
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      },
    });

    return sendResponse(res, 200, true, "Product import completed.", result);
  } catch (error) {
    return sendResponse(res, 500, false, error.message || "Product import failed.");
  }
};

const getProductImportHistory = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const history = await ProductImportHistory.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("importedBy", "name email")
      .lean();

    return sendResponse(res, 200, true, "Import history loaded.", { history });
  } catch (error) {
    return sendResponse(res, 500, false, error.message || "Failed to load import history.");
  }
};

const downloadProductImportErrorsCsv = async (req, res) => {
  try {
    let failedRows = parseJsonField(req.body?.failedRows, null);

    if (!failedRows && req.params?.historyId) {
      const record = await ProductImportHistory.findById(req.params.historyId).lean();
      if (!record) {
        return sendResponse(res, 404, false, "Import history record not found.");
      }
      failedRows = record.failedRows || [];
    }

    if (!Array.isArray(failedRows) || failedRows.length === 0) {
      return sendResponse(res, 400, false, "No failed rows available for export.");
    }

    const csv = buildFailedRowsCsv(failedRows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="product-import-errors.csv"',
    );
    return res.status(200).send(csv);
  } catch (error) {
    return sendResponse(res, 500, false, error.message || "Failed to export error CSV.");
  }
};

module.exports = {
  downloadProductImportTemplateCsv,
  downloadProductImportTemplateXlsx,
  previewProductImport,
  runProductImportHandler,
  getProductImportHistory,
  downloadProductImportErrorsCsv,
};
