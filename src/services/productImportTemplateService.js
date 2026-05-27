/**
 * Product import sample templates (Import-1 / Import-1A) — read-only, no DB writes.
 * Headers and examples come from src/config/productImportSchema.js.
 */

const fs = require("fs");
const path = require("path");
const {
  TEMPLATE_VERSION,
  IMPORT_HEADERS,
  EXAMPLE_ROWS,
  PRODUCT_IMPORT_COLUMNS,
} = require("../config/productImportSchema");

const escapeCsvCell = (value) => {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const rowToCsvLine = (rowObject) => {
  const cells = IMPORT_HEADERS.map((header) => escapeCsvCell(rowObject[header] ?? ""));
  return cells.join(",");
};

const buildCsvContent = () => {
  const lines = [IMPORT_HEADERS.join(","), ...EXAMPLE_ROWS.map(rowToCsvLine)];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
};

const getCsvBuffer = () => Buffer.from(buildCsvContent(), "utf8");

const XLSX_TEMPLATE_PATH = path.join(
  __dirname,
  "..",
  "templates",
  "product-import-template.xlsx",
);

const getXlsxBuffer = () => {
  if (!fs.existsSync(XLSX_TEMPLATE_PATH)) {
    const error = new Error(
      "XLSX template file is missing. Run: node scripts/generateProductImportTemplateXlsx.js",
    );
    error.code = "XLSX_TEMPLATE_MISSING";
    throw error;
  }
  return fs.readFileSync(XLSX_TEMPLATE_PATH);
};

const hasXlsxTemplate = () => fs.existsSync(XLSX_TEMPLATE_PATH);

module.exports = {
  TEMPLATE_VERSION,
  IMPORT_HEADERS,
  EXAMPLE_ROWS,
  PRODUCT_IMPORT_COLUMNS,
  buildCsvContent,
  getCsvBuffer,
  getXlsxBuffer,
  hasXlsxTemplate,
  XLSX_TEMPLATE_PATH,
};
