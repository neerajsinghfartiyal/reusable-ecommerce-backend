/**
 * Optional XLSX parser for import preview.
 * Uses `xlsx` only if available (not in package.json).
 * Dev fallback: scripts/.xlsx-gen-cache from template generator.
 */

const fs = require("fs");
const path = require("path");

const loadXlsxModule = () => {
  try {
    return require("xlsx");
  } catch (_) {
    // not in package.json
  }

  const cacheModulePath = path.join(
    __dirname,
    "..",
    "..",
    "scripts",
    ".xlsx-gen-cache",
    "node_modules",
    "xlsx",
  );

  if (fs.existsSync(path.join(cacheModulePath, "package.json"))) {
    return require(cacheModulePath);
  }

  return null;
};

const isXlsxParserAvailable = () => Boolean(loadXlsxModule());

const parseXlsxToRecords = (buffer) => {
  const XLSX = loadXlsxModule();
  if (!XLSX) {
    const error = new Error(
      "XLSX parsing is not available on the server. Upload a CSV file, or approve adding the xlsx package to package.json.",
    );
    error.code = "XLSX_PARSER_UNAVAILABLE";
    throw error;
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames.includes("Products")
    ? "Products"
    : workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("XLSX workbook has no sheets.");
  }

  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
  });

  if (!Array.isArray(matrix) || matrix.length === 0) {
    return { headers: [], records: [] };
  }

  const headers = matrix[0].map((header) => String(header ?? "").trim());
  const records = matrix.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = row[index] ?? "";
    });
    return record;
  });

  return { headers, records };
};

module.exports = {
  isXlsxParserAvailable,
  parseXlsxToRecords,
};
