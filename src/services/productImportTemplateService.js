/**
 * Product import sample templates (Import-1 / Import-1A) — read-only, no DB writes.
 * Headers and examples come from src/config/productImportSchema.js.
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const {
  TEMPLATE_VERSION,
  IMPORT_HEADERS,
  EXAMPLE_ROWS,
  PRODUCT_IMPORT_COLUMNS,
  rowToOrderedValues,
  buildFieldReferenceRows,
  buildInstructionsRows,
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

const buildXlsxBuffer = () => {
  const exampleValueRows = EXAMPLE_ROWS.map(rowToOrderedValues);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([IMPORT_HEADERS, ...exampleValueRows]),
    "Products",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(buildInstructionsRows()),
    "Instructions",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(buildFieldReferenceRows()),
    "Field Reference",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([IMPORT_HEADERS, exampleValueRows[0]]),
    "Examples",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      IMPORT_HEADERS,
      exampleValueRows[1],
      exampleValueRows[2],
      exampleValueRows[3],
    ]),
    "Variation Examples",
  );

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
};

const getXlsxBuffer = () => buildXlsxBuffer();

const hasXlsxTemplate = () => true;

const writeXlsxTemplateFile = (filePath = XLSX_TEMPLATE_PATH) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buildXlsxBuffer());
  return filePath;
};

module.exports = {
  TEMPLATE_VERSION,
  IMPORT_HEADERS,
  EXAMPLE_ROWS,
  PRODUCT_IMPORT_COLUMNS,
  buildCsvContent,
  getCsvBuffer,
  buildXlsxBuffer,
  getXlsxBuffer,
  hasXlsxTemplate,
  writeXlsxTemplateFile,
  XLSX_TEMPLATE_PATH,
};
