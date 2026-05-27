/**
 * Lightweight CSV parser for import preview (RFC 4180-style, quoted fields).
 */

const parseCsvRows = (text) => {
  const content = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inQuotes) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      cell = "";
      const hasContent = row.some((value) => String(value).trim() !== "");
      if (hasContent || rows.length === 0) {
        rows.push(row);
      }
      row = [];
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    const hasContent = row.some((value) => String(value).trim() !== "");
    if (hasContent || rows.length === 0) {
      rows.push(row);
    }
  }

  return rows;
};

const rowsToObjects = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { headers: [], records: [] };
  }

  const headers = rows[0].map((header) => String(header ?? "").trim());
  const records = rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = cells[index] ?? "";
    });
    return record;
  });

  return { headers, records };
};

const parseCsvToRecords = (text) => {
  const rows = parseCsvRows(text);
  return rowsToObjects(rows);
};

module.exports = {
  parseCsvRows,
  rowsToObjects,
  parseCsvToRecords,
};
