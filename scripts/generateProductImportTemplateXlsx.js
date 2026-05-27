/**
 * Regenerate product-import-template.xlsx from canonical schema.
 * Run: node scripts/generateProductImportTemplateXlsx.js
 * Uses scripts/.xlsx-gen-cache (gitignored) — does not modify package.json.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const {
  IMPORT_HEADERS,
  EXAMPLE_ROWS,
  rowToOrderedValues,
  buildFieldReferenceRows,
  buildInstructionsRows,
} = require("../src/config/productImportSchema");

const cacheDir = path.join(__dirname, ".xlsx-gen-cache");
const outDir = path.join(__dirname, "..", "src", "templates");
const outFile = path.join(outDir, "product-import-template.xlsx");

const ensureXlsx = () => {
  const xlsxEntry = path.join(cacheDir, "node_modules", "xlsx", "package.json");
  if (!fs.existsSync(xlsxEntry)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    execSync("npm install xlsx@0.18.5 --no-save --no-package-lock", {
      cwd: cacheDir,
      stdio: "inherit",
      shell: true,
    });
  }

  const requireFromCache = createRequire(path.join(cacheDir, "package.json"));
  return requireFromCache("xlsx");
};

const exampleValueRows = EXAMPLE_ROWS.map(rowToOrderedValues);

fs.mkdirSync(outDir, { recursive: true });

const XLSX = ensureXlsx();
const wb = XLSX.utils.book_new();

XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([IMPORT_HEADERS, ...exampleValueRows]),
  "Products",
);

XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildInstructionsRows()), "Instructions");

XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet(buildFieldReferenceRows()),
  "Field Reference",
);

XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([IMPORT_HEADERS, exampleValueRows[0]]),
  "Examples",
);

XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    IMPORT_HEADERS,
    exampleValueRows[1],
    exampleValueRows[2],
    exampleValueRows[3],
  ]),
  "Variation Examples",
);

fs.writeFileSync(outFile, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log("Wrote", outFile);
