/**
 * XLSX parser for product import preview/run.
 * Production uses the official `xlsx` package from package.json.
 */

const loadXlsxModule = () => {
  try {
    return require("xlsx");
  } catch (_) {
    return null;
  }
};

const isXlsxParserAvailable = () => Boolean(loadXlsxModule());

const parseXlsxToRecords = (buffer) => {
  const XLSX = loadXlsxModule();
  if (!XLSX) {
    const error = new Error(
      "XLSX parsing is not available on the server. Upload a CSV file or reinstall backend dependencies (xlsx package).",
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
