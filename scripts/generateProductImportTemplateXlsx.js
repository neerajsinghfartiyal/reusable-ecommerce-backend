/**
 * Optional: write product-import-template.xlsx to src/templates for static serving.
 * Runtime downloads generate XLSX in memory from the canonical schema.
 * Run: node scripts/generateProductImportTemplateXlsx.js
 */

const { writeXlsxTemplateFile, XLSX_TEMPLATE_PATH } = require("../src/services/productImportTemplateService");

const outFile = writeXlsxTemplateFile(XLSX_TEMPLATE_PATH);
console.log("Wrote", outFile);
