/**
 * Product import parse + preview validation (Import-2).
 * Read-only: no Product writes, no DB access.
 */

const path = require("path");
const { parseCsvToRecords } = require("../utils/csvParse");
const { isXlsxParserAvailable, parseXlsxToRecords } = require("../utils/importXlsxParse");
const {
  TEMPLATE_VERSION,
  PRODUCT_TYPE_VALUES,
  PREVIEW_STATUS_VALUES,
  IMPORT_HEADERS,
  normalizeImportRow,
} = require("../config/productImportSchema");

const MAX_IMPORT_ROWS = 10000;

const isBlankRow = (normalizedRow) =>
  IMPORT_HEADERS.every((key) => !String(normalizedRow[key] ?? "").trim());

const parseNumeric = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return { empty: true, valid: true, value: null };
  const parsed = Number(text);
  if (Number.isNaN(parsed)) {
    return { empty: false, valid: false, value: null };
  }
  return { empty: false, valid: true, value: parsed };
};

const parseInteger = (value) => {
  const numeric = parseNumeric(value);
  if (numeric.empty || !numeric.valid) return numeric;
  if (!Number.isInteger(numeric.value)) {
    return { empty: false, valid: false, value: numeric.value };
  }
  return numeric;
};

const validateGalleryImages = (value, warnings) => {
  const text = String(value ?? "").trim();
  if (!text) return;
  if (text.includes("|")) {
    const parts = text.split("|").map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) {
      warnings.push("gallery_images pipe list is empty.");
    }
    return;
  }
  if (text.includes(",")) {
    warnings.push(
      "gallery_images uses comma separation; pipe (|) is the canonical delimiter.",
    );
    return;
  }
  warnings.push("gallery_images should use pipe (|) between multiple URLs.");
};

const validateVariationOptions = (value, warnings) => {
  const text = String(value ?? "").trim();
  if (!text) return;
  if (!text.includes(";")) {
    warnings.push("variation_options should use semicolon (;) between attribute names.");
  }
};

const buildIssue = (severity, field, message, value = "") => ({
  severity,
  field,
  message,
  value: String(value ?? "").trim(),
});

const validateRow = (normalizedRow, rowNumber, context) => {
  const errors = [];
  const warnings = [];
  const errorDetails = [];
  const warningDetails = [];
  const productType = String(normalizedRow.product_type ?? "")
    .trim()
    .toLowerCase();
  const pushError = (field, message, value = normalizedRow[field]) => {
    errors.push(message);
    errorDetails.push(buildIssue("error", field, message, value));
  };
  const pushWarning = (field, message, value = normalizedRow[field]) => {
    warnings.push(message);
    warningDetails.push(buildIssue("warning", field, message, value));
  };

  if (!productType) {
    pushError("product_type", "product_type is required.");
  } else if (!PRODUCT_TYPE_VALUES.includes(productType)) {
    pushError(
      "product_type",
      `product_type must be one of: ${PRODUCT_TYPE_VALUES.join(", ")}.`,
    );
  }

  const productName = String(normalizedRow.product_name ?? "").trim();
  if (!productName) {
    pushError("product_name", "product_name is required.");
  }

  const sku = String(normalizedRow.sku ?? "").trim();
  if (!sku) {
    pushError("sku", "sku is required.");
  } else if (context.skuCounts[sku] > 1) {
    pushError("sku", `Duplicate sku "${sku}" in file.`, sku);
  }

  const status = String(normalizedRow.status ?? "").trim().toLowerCase();
  if (status && !PREVIEW_STATUS_VALUES.includes(status)) {
    pushError("status", `status must be one of: ${PREVIEW_STATUS_VALUES.join(", ")}.`, status);
  }

  const templateVersion = String(normalizedRow.template_version ?? "").trim();
  if (templateVersion && templateVersion !== TEMPLATE_VERSION) {
    pushWarning(
      "template_version",
      `template_version "${templateVersion}" does not match ${TEMPLATE_VERSION}.`,
      templateVersion,
    );
  }

  if (productType === "variation") {
    const parentSku = String(normalizedRow.parent_sku ?? "").trim();
    if (!parentSku) {
      pushError("parent_sku", "parent_sku is required for variation rows.");
    } else if (!context.variableSkus.has(parentSku)) {
      pushError(
        "parent_sku",
        `parent_sku "${parentSku}" must reference a variable row above in the file.`,
        parentSku,
      );
    }
  }

  if (productType === "simple" || productType === "variable") {
    const category = String(normalizedRow.category ?? "").trim();
    if (!category) {
      pushError(
        "category",
        `category is required for ${productType} products.`,
        category,
      );
    }
  }

  if (productType === "simple" || productType === "variation") {
    const price = parseNumeric(normalizedRow.price);
    if (price.empty) {
      pushError("price", "price is required for simple and variation rows.");
    } else if (!price.valid) {
      pushError("price", "price must be a valid number.");
    } else if (price.value < 0) {
      pushError("price", "price must be >= 0.");
    }
  }

  const salePrice = parseNumeric(normalizedRow.sale_price);
  if (!salePrice.empty && !salePrice.valid) {
    pushError("sale_price", "sale_price must be a valid number.");
  } else if (salePrice.valid && salePrice.value < 0) {
    pushError("sale_price", "sale_price must be >= 0.");
  } else if (salePrice.valid) {
    const price = parseNumeric(normalizedRow.price);
    if (price.valid && salePrice.value > price.value) {
      pushWarning("sale_price", "sale_price is greater than price.");
    }
  }

  const stock = parseInteger(normalizedRow.stock);
  if (!stock.empty && !stock.valid) {
    pushError("stock", "stock must be a valid integer.");
  } else if (stock.valid && stock.value < 0) {
    pushError("stock", "stock must be >= 0.");
  }

  if (productType === "variation") {
    const attr1 = String(normalizedRow.attribute_1_value ?? "").trim();
    const attr2 = String(normalizedRow.attribute_2_value ?? "").trim();
    if (!attr1 && !attr2) {
      pushError(
        "attribute_values",
        "At least one attribute value (attribute_1_value or attribute_2_value) is required for variation rows.",
      );
    }
  }

  const galleryWarnings = [];
  validateGalleryImages(normalizedRow.gallery_images, galleryWarnings);
  galleryWarnings.forEach((message) => pushWarning("gallery_images", message));
  if (productType === "variable") {
    const variationOptionWarnings = [];
    validateVariationOptions(normalizedRow.variation_options, variationOptionWarnings);
    variationOptionWarnings.forEach((message) =>
      pushWarning("variation_options", message),
    );
  }

  if (String(normalizedRow.seo_title ?? "").trim() || String(normalizedRow.seo_description ?? "").trim()) {
    pushWarning(
      "seo",
      "seo_title and seo_description are not persisted yet (future compatibility).",
    );
  }

  return {
    rowNumber,
    productType: productType || "",
    sku,
    productName,
    status: status || "",
    normalizedData: normalizedRow,
    errors,
    warnings,
    errorDetails,
    warningDetails,
  };
};

const buildPreviewContext = (normalizedRows) => {
  const skuCounts = {};
  const variableSkus = new Set();

  normalizedRows.forEach((row) => {
    const sku = String(row.sku ?? "").trim();
    if (sku) {
      skuCounts[sku] = (skuCounts[sku] || 0) + 1;
    }
    if (String(row.product_type ?? "").trim().toLowerCase() === "variable") {
      if (sku) variableSkus.add(sku);
    }
  });

  return { skuCounts, variableSkus };
};

const buildImportPreview = (parsedRecords) => {
  const normalizedRows = parsedRecords
    .map((record) => normalizeImportRow(record))
    .filter((row) => !isBlankRow(row));

  if (normalizedRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Import file exceeds maximum of ${MAX_IMPORT_ROWS} rows.`);
  }

  const context = buildPreviewContext(normalizedRows);
  const rows = [];
  const summary = { simple: 0, variable: 0, variation: 0 };
  let validRows = 0;
  let errorRows = 0;
  let warningRows = 0;

  const variableSkusSeen = new Set();

  normalizedRows.forEach((normalizedRow, index) => {
    const rowContext = {
      skuCounts: context.skuCounts,
      variableSkus: variableSkusSeen,
    };
    const rowNumber = index + 2;
    const result = validateRow(normalizedRow, rowNumber, rowContext);

    if (result.productType && summary[result.productType] !== undefined) {
      summary[result.productType] += 1;
    }

    if (result.errors.length === 0) {
      validRows += 1;
    } else {
      errorRows += 1;
    }

    if (result.warnings.length > 0) {
      warningRows += 1;
    }

    if (result.productType === "variable" && result.sku) {
      variableSkusSeen.add(result.sku);
    }

    rows.push(result);
  });

  return {
    totalRows: rows.length,
    validRows,
    errorRows,
    warningRows,
    rows,
    summary,
    schemaVersion: TEMPLATE_VERSION,
  };
};

const parseImportFile = (buffer, originalName = "") => {
  const extension = path.extname(originalName).toLowerCase();
  const isXlsx =
    extension === ".xlsx" ||
    extension === ".xlsm" ||
    extension === ".xls";

  if (isXlsx) {
    const { records } = parseXlsxToRecords(buffer);
    return { format: "xlsx", records };
  }

  const text = buffer.toString("utf8");
  const { records } = parseCsvToRecords(text);
  return { format: "csv", records };
};

const buildImportPreviewFromFile = (buffer, originalName = "") => {
  const parsed = parseImportFile(buffer, originalName);
  const preview = buildImportPreview(parsed.records);
  return {
    ...preview,
    fileFormat: parsed.format,
    xlsxParserAvailable: isXlsxParserAvailable(),
  };
};

module.exports = {
  MAX_IMPORT_ROWS,
  buildImportPreview,
  buildImportPreviewFromFile,
  parseImportFile,
  isXlsxParserAvailable,
};
