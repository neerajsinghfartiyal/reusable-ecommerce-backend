/**
 * Product import execution (Import-4) — safe row processing with partial success.
 */

const Product = require("../models/Product");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const UnitType = require("../models/UnitType");
const ProductImportHistory = require("../models/ProductImportHistory");
const { buildImportPreviewFromFile } = require("./productImportParseService");
const { enrichPreviewRows } = require("./productImportEnhancedPreviewService");
const {
  loadResolverCatalogs,
  ensureEntityFromResolver,
  ensureCategoryFromImport,
  ensureAttributeWithValue,
  applyRowMappings,
  resolveRowResolvers,
  getCategoryCreateName,
  getImportCategoryInput,
  getRowResolverState,
  markResolversForAutoCreate,
} = require("./productImportResolverService");
const { logActivity } = require("../utils/activityLogger");
const { toStoredImageUrl } = require("../utils/normalizeMediaUrl");
const {
  createImportMediaContext,
  resolveImportProductMedia,
  backfillProductMediaIds,
  summarizeImportMediaContext,
} = require("./productImportMediaService");

const parseGallery = (value) =>
  String(value || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

const mapImportStatus = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "published" || normalized === "inactive" || normalized === "draft") {
    return normalized;
  }
  return "draft";
};

const mapVariationStatus = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "inactive" || normalized === "draft") return normalized;
  return "active";
};

const resolveEntityIdsForRow = async (
  row,
  catalogs,
  rowMappings,
  adminId,
  { autoCreateCatalog = true } = {},
) => {
  const normalizedData = row.normalizedData || {};
  const resolved = resolveRowResolvers(normalizedData, catalogs);
  const mergedBase = applyRowMappings(resolved.resolvers, rowMappings, normalizedData);
  const merged = autoCreateCatalog
    ? markResolversForAutoCreate(mergedBase, normalizedData, true)
    : mergedBase;

  const categoryId = await ensureCategoryFromImport(
    merged.category,
    normalizedData,
    adminId,
    { autoCreate: autoCreateCatalog },
  );
  const brandId = await ensureEntityFromResolver(merged.brand, Brand, adminId, {}, {
    autoCreate: autoCreateCatalog,
    createName: merged.brand?.entityName || merged.brand?.input,
  });
  const unitTypeId = await ensureEntityFromResolver(merged.unitType, UnitType, adminId, {}, {
    autoCreate: autoCreateCatalog,
    createName: merged.unitType?.entityName || merged.unitType?.input,
  });

  const issues = [];
  const productType = String(row.productType || normalizedData.product_type || "").toLowerCase();
  const categoryText = String(
    getImportCategoryInput(normalizedData) || normalizedData.category || "",
  ).trim();
  if ((productType === "simple" || productType === "variable") && categoryText && !categoryId) {
    issues.push(`Unresolved category "${categoryText}".`);
  }

  const resolverState = getRowResolverState(normalizedData, merged, merged.attributes || []);
  if (resolverState === "needs_mapping") {
    issues.push("Row has unresolved catalog mappings.");
  }

  return {
    categoryId,
    brandId,
    unitTypeId,
    resolvers: merged,
    issues,
  };
};

const resolveVariationAttributes = async (row, catalogs, adminId, autoCreateCatalog) => {
  const data = row.normalizedData || {};
  const attributes = [];
  const resolvedAttributes =
    row.resolvers?.attributes && row.resolvers.attributes.length > 0
      ? row.resolvers.attributes
      : resolveRowResolvers(data, catalogs).resolvers.attributes;

  for (const slot of [1, 2]) {
    const name = String(data[`attribute_${slot}_name`] || "").trim();
    const value = String(data[`attribute_${slot}_value`] || "").trim();
    if (!name && !value) continue;

    if (autoCreateCatalog) {
      const ensured = await ensureAttributeWithValue(catalogs, name, value, adminId);
      if (ensured.attributeId) {
        attributes.push({
          attribute: ensured.attributeId,
          name,
          code: ensured.attributeCode || "",
          value: ensured.valueCode || "",
          label: ensured.valueLabel || value,
        });
      }
      continue;
    }

    const attr = resolvedAttributes.find((item) => item.slot === slot);
    if (attr?.attributeId && (attr?.value || attr?.valueCode || attr?.valueLabel)) {
      attributes.push({
        attribute: attr.attributeId,
        name: attr.name || name,
        code: attr.attributeCode || "",
        value: attr.valueCode || attr.value || "",
        label: attr.valueLabel || attr.value || value,
      });
    }
  }

  return attributes;
};

const buildVariationPayload = (row, catalogs, variationAttributes = []) => {
  const data = row.normalizedData || {};

  return {
    sku: row.sku,
    price: Number(data.price || 0),
    salePrice: data.sale_price ? Number(data.sale_price) : null,
    quantity: data.stock ? Number(data.stock) : 0,
    image: toStoredImageUrl(data.featured_image || ""),
    status: mapVariationStatus(data.status),
    attributes: variationAttributes,
  };
};

const buildVariableAttributes = (variableRow, variationRows, catalogs) => {
  const names = String(variableRow.normalizedData?.variation_options || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  const attributes = [];
  names.forEach((name, index) => {
    const attributeDoc = catalogs.attributes.find(
      (item) => item.name.toLowerCase() === name.toLowerCase() || item.code === name,
    );
    if (!attributeDoc) return;

    const values = new Map();
    variationRows.forEach((variationRow) => {
      const attr = variationRow.resolvers?.attributes?.find((item) => item.slot === index + 1);
      if (!attr?.value) return;
      const key = attr.valueCode || attr.value;
      if (!values.has(key)) {
        values.set(key, {
          label: attr.valueLabel || attr.value,
          value: attr.valueCode || attr.value,
        });
      }
    });

    attributes.push({
      attribute: attributeDoc._id.toString(),
      name: attributeDoc.name,
      code: attributeDoc.code,
      values: Array.from(values.values()),
      isVariationAttribute: true,
      isVisible: true,
    });
  });

  return attributes;
};

const shouldSkipRow = (row, strategy) => {
  if (row.errors?.length) return { skip: true, reason: "validation_error" };
  if (row.duplicateState === "duplicate" || row.duplicateState === "skip") {
    return { skip: true, reason: "duplicate" };
  }
  if (strategy === "create_only" && row.duplicateState === "update") {
    return { skip: true, reason: "duplicate" };
  }
  if (row.resolverState === "needs_mapping") {
    return { skip: true, reason: "unresolved" };
  }
  return { skip: false };
};

const buildRowFailure = (row, message) => ({
  rowNumber: row.rowNumber,
  sku: row.sku,
  productName: row.productName,
  errors: message ? [message] : row.errors || [],
  errorDetails: row.errorDetails || [],
  warningDetails: row.warningDetails || [],
  normalizedData: row.normalizedData,
});

const buildResolverFailure = (row) => {
  const issues = [];
  const resolverFields = [
    ["category", "Category"],
    ["brand", "Brand"],
    ["unitType", "Unit type"],
  ];

  resolverFields.forEach(([key, label]) => {
    const resolver = row.resolvers?.[key];
    if (resolver?.status === "unresolved") {
      issues.push(`${label} "${resolver.input}" could not be resolved.`);
    }
  });

  (row.resolvers?.attributes || []).forEach((attribute) => {
    if (attribute?.status === "unresolved") {
      const attributeName = attribute.name || `slot ${attribute.slot}`;
      const valueText = attribute.value ? ` value "${attribute.value}"` : "";
      issues.push(`Attribute "${attributeName}"${valueText} could not be resolved.`);
    }
  });

  return buildRowFailure(
    row,
    issues.length > 0 ? issues.join(" ") : "Row has unresolved catalog mappings.",
  );
};

const registerBlockedRow = (result, row, skip) => {
  if (skip.reason === "duplicate") {
    result.skippedCount += 1;
    return;
  }

  result.failedCount += 1;
  result.failedRows.push(
    skip.reason === "unresolved" ? buildResolverFailure(row) : buildRowFailure(row),
  );
};

const groupImportRows = (rows) => {
  const groups = [];
  let index = 0;

  while (index < rows.length) {
    const row = rows[index];
    const type = String(row.productType || "").toLowerCase();

    if (type === "variable") {
      const variableRow = row;
      const variationRows = [];
      let cursor = index + 1;
      while (cursor < rows.length) {
        const nextType = String(rows[cursor].productType || "").toLowerCase();
        if (nextType === "variation") {
          variationRows.push(rows[cursor]);
          cursor += 1;
          continue;
        }
        break;
      }
      groups.push({ type: "variable", variableRow, variationRows });
      index = cursor;
      continue;
    }

    if (type === "simple") {
      groups.push({ type: "simple", row });
    } else if (type === "variation") {
      groups.push({ type: "orphan_variation", row });
    }

    index += 1;
  }

  return groups;
};

const upsertSimpleProduct = async ({
  row,
  entityIds,
  strategy,
  catalogs,
  adminId,
  importMediaContext,
}) => {
  const data = row.normalizedData || {};
  const existing = catalogs.skuIndex.get(row.sku);
  const mediaFields = await resolveImportProductMedia({
    featuredImageUrl: data.featured_image || "",
    galleryImageUrls: parseGallery(data.gallery_images),
    adminId,
    productName: row.productName,
    sku: row.sku,
    importContext: importMediaContext,
  });

  const payload = {
    name: row.productName,
    sku: row.sku,
    price: Number(data.price || 0),
    salePrice: data.sale_price ? Number(data.sale_price) : null,
    quantity: data.stock ? Number(data.stock) : 0,
    category: entityIds.categoryId,
    brand: entityIds.brandId || null,
    unitType: entityIds.unitTypeId || null,
    shortDescription: data.short_description || "",
    description: data.description || "",
    featuredImage: mediaFields.featuredImage,
    featuredMediaId: mediaFields.featuredMediaId,
    galleryImages: mediaFields.galleryImages,
    galleryMediaIds: mediaFields.galleryMediaIds,
    status: mapImportStatus(data.status),
    attributes: [],
    variations: [],
    createdBy: adminId,
  };

  if (!entityIds.categoryId) {
    throw new Error("Category is required for simple products.");
  }

  if (existing && !existing.isVariation && strategy === "update_existing") {
    const product = await Product.findById(existing.productId);
    if (!product) throw new Error("Existing product not found for update.");
    Object.assign(product, payload);
    await product.save();
    await backfillProductMediaIds(product, importMediaContext);
    return { action: "updated", productId: product._id.toString() };
  }

  if (existing && !existing.isVariation) {
    throw new Error(`SKU "${row.sku}" already exists.`);
  }

  const product = await Product.create(payload);
  return { action: "imported", productId: product._id.toString() };
};

const upsertVariableProductWithVariations = async ({
  variableRow,
  variations = [],
  variationRows = [],
  entityIds,
  strategy,
  catalogs,
  adminId,
  importMediaContext,
}) => {
  const data = variableRow.normalizedData || {};
  const existing = catalogs.skuIndex.get(variableRow.sku);

  const categoryId = entityIds.categoryId;

  if (!categoryId) {
    throw new Error("Category is required for variable products.");
  }

  const attributes = buildVariableAttributes(variableRow, variationRows, catalogs);
  const mediaFields = await resolveImportProductMedia({
    featuredImageUrl: data.featured_image || "",
    galleryImageUrls: parseGallery(data.gallery_images),
    adminId,
    productName: variableRow.productName,
    sku: variableRow.sku,
    importContext: importMediaContext,
  });

  const payload = {
    name: variableRow.productName,
    sku: variableRow.sku,
    price: Number(data.price || 0) || variations[0]?.price || 0,
    salePrice: data.sale_price ? Number(data.sale_price) : null,
    quantity: data.stock ? Number(data.stock) : 0,
    category: categoryId,
    brand: entityIds.brandId || null,
    unitType: entityIds.unitTypeId || null,
    shortDescription: data.short_description || "",
    description: data.description || "",
    featuredImage: mediaFields.featuredImage,
    featuredMediaId: mediaFields.featuredMediaId,
    galleryImages: mediaFields.galleryImages,
    galleryMediaIds: mediaFields.galleryMediaIds,
    status: mapImportStatus(data.status),
    attributes,
    variations,
    createdBy: adminId,
  };

  if (existing && !existing.isVariation && strategy === "update_existing") {
    const product = await Product.findById(existing.productId);
    if (!product) throw new Error("Existing variable product not found for update.");
    Object.assign(product, payload);
    await product.save();
    await backfillProductMediaIds(product, importMediaContext);
    return { action: "updated", productId: product._id.toString() };
  }

  if (existing && !existing.isVariation) {
    throw new Error(`SKU "${variableRow.sku}" already exists.`);
  }

  const product = await Product.create(payload);
  return { action: "imported", productId: product._id.toString() };
};

const refreshCatalogIndexes = async (catalogs) => {
  const fresh = await loadResolverCatalogs();
  catalogs.categories = fresh.categories;
  catalogs.brands = fresh.brands;
  catalogs.unitTypes = fresh.unitTypes;
  catalogs.attributes = fresh.attributes;
  catalogs.skuIndex = fresh.skuIndex;
  catalogs.nameIndex = fresh.nameIndex;
  catalogs.options = fresh.options;
};

const runProductImport = async ({
  buffer,
  originalName,
  strategy = "skip_duplicates",
  rowMappings = {},
  checkNameDuplicates = false,
  autoCreateCatalog = true,
  adminId,
  adminMeta = {},
}) => {
  const basePreview = buildImportPreviewFromFile(buffer, originalName);
  const catalogs = await loadResolverCatalogs();
  const preview = enrichPreviewRows(basePreview, catalogs, {
    duplicateStrategy: strategy,
    rowMappings,
    checkNameDuplicates,
    autoCreateCatalog,
  });

  const importMediaContext = await createImportMediaContext();

  const result = {
    importedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    failedRows: [],
    processedRows: [],
  };

  const groups = groupImportRows(preview.rows);

  for (const group of groups) {
    if (group.type === "orphan_variation") {
      const row = group.row;
      result.failedCount += 1;
      result.failedRows.push({
        rowNumber: row.rowNumber,
        sku: row.sku,
        productName: row.productName,
        errors: ["Variation row is not grouped under a variable parent."],
        normalizedData: row.normalizedData,
      });
      continue;
    }

    if (group.type === "simple") {
      const row = group.row;
      const skip = shouldSkipRow(row, strategy);
      if (skip.skip) {
        registerBlockedRow(result, row, skip);
        continue;
      }

      try {
        const entityIds = await resolveEntityIdsForRow(
          row,
          catalogs,
          rowMappings[row.rowNumber] || {},
          adminId,
          { autoCreateCatalog },
        );
        if (entityIds.issues.length) {
          throw new Error(entityIds.issues.join(" "));
        }
        row.resolvers = entityIds.resolvers;
        const outcome = await upsertSimpleProduct({
          row,
          entityIds,
          strategy,
          catalogs,
          adminId,
          importMediaContext,
        });
        if (outcome.action === "updated") result.updatedCount += 1;
        else result.importedCount += 1;
        await refreshCatalogIndexes(catalogs);
      } catch (error) {
        result.failedCount += 1;
        result.failedRows.push({
          rowNumber: row.rowNumber,
          sku: row.sku,
          productName: row.productName,
          errors: [error.message],
          normalizedData: row.normalizedData,
        });
      }
      continue;
    }

    if (group.type === "variable") {
      const { variableRow, variationRows } = group;
      const skip = shouldSkipRow(variableRow, strategy);
      if (skip.skip) {
        registerBlockedRow(result, variableRow, skip);
        result.skippedCount += variationRows.length;
        continue;
      }

      const invalidVariationRows = variationRows
        .map((variationRow) => ({
          row: variationRow,
          skip: shouldSkipRow(variationRow, strategy),
        }))
        .filter(({ skip }) => skip.skip && skip.reason !== "duplicate");

      if (invalidVariationRows.length > 0) {
        invalidVariationRows.forEach(({ row, skip: blocked }) =>
          registerBlockedRow(result, row, blocked),
        );
        result.skippedCount += 1 + (variationRows.length - invalidVariationRows.length);
        continue;
      }

      try {
        const entityIds = await resolveEntityIdsForRow(
          variableRow,
          catalogs,
          rowMappings[variableRow.rowNumber] || {},
          adminId,
          { autoCreateCatalog },
        );
        if (entityIds.issues.length) {
          throw new Error(entityIds.issues.join(" "));
        }

        for (const variationRow of variationRows) {
          const variationResolved = resolveRowResolvers(
            variationRow.normalizedData || {},
            catalogs,
          );
          variationRow.resolvers = applyRowMappings(
            variationResolved.resolvers,
            rowMappings[variationRow.rowNumber] || {},
            variationRow.normalizedData || {},
          );
          if (autoCreateCatalog) {
            for (const slot of [1, 2]) {
              const attr = variationRow.resolvers.attributes?.find((item) => item.slot === slot);
              const name = attr?.name || "";
              const value = attr?.value || "";
              if (name && value) {
                await ensureAttributeWithValue(catalogs, name, value, adminId);
              }
            }
          }
        }

        variableRow.resolvers = entityIds.resolvers;
        const variations = await Promise.all(
          variationRows.map(async (variationRow) => {
            const variationAttributes = await resolveVariationAttributes(
              variationRow,
              catalogs,
              adminId,
              autoCreateCatalog,
            );
            return buildVariationPayload(variationRow, catalogs, variationAttributes);
          }),
        );

        const outcome = await upsertVariableProductWithVariations({
          variableRow,
          variations,
          variationRows,
          entityIds,
          strategy,
          catalogs,
          adminId,
          importMediaContext,
        });
        if (outcome.action === "updated") result.updatedCount += 1;
        else result.importedCount += 1;
        await refreshCatalogIndexes(catalogs);
      } catch (error) {
        result.failedCount += 1;
        result.failedRows.push({
          rowNumber: variableRow.rowNumber,
          sku: variableRow.sku,
          productName: variableRow.productName,
          errors: [error.message],
          normalizedData: variableRow.normalizedData,
          variationCount: variationRows.length,
        });
      }
    }
  }

  const status =
    result.failedCount > 0
      ? result.importedCount + result.updatedCount > 0
        ? "partial"
        : "failed"
      : "completed";

  const history = await ProductImportHistory.create({
    filename: originalName || "import",
    fileFormat: preview.fileFormat || "",
    strategy,
    status,
    importedCount: result.importedCount,
    updatedCount: result.updatedCount,
    skippedCount: result.skippedCount,
    failedCount: result.failedCount,
    totalRows: preview.totalRows,
    importedBy: adminId,
    summary: preview.duplicateSummary,
    failedRows: result.failedRows,
  });

  await logActivity({
    admin: adminId,
    action: "PRODUCT_IMPORT_RUN",
    module: "PRODUCT",
    description: `Product import ${status}: ${result.importedCount} created, ${result.updatedCount} updated, ${result.failedCount} failed`,
    entityId: history._id.toString(),
    entityType: "ProductImportHistory",
    ipAddress: adminMeta.ipAddress,
    userAgent: adminMeta.userAgent,
  });

  const mediaSummary = summarizeImportMediaContext(importMediaContext);

  return {
    ...result,
    status,
    historyId: history._id.toString(),
    duplicateSummary: preview.duplicateSummary,
    schemaVersion: preview.schemaVersion,
    mediaSummary,
  };
};

const buildFailedRowsCsv = (failedRows = []) => {
  const headers = [
    "row_number",
    "sku",
    "product_name",
    "errors",
    "resolver_issues",
    "product_type",
    "category",
    "brand",
    "unit_type",
  ];

  const escapeCsv = (value) => {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [headers.join(",")];
  failedRows.forEach((row) => {
    const data = row.normalizedData || {};
    lines.push(
      [
        row.rowNumber,
        row.sku,
        row.productName,
        (row.errors || []).join(" | "),
        row.resolverIssues || "",
        data.product_type,
        data.category,
        data.brand,
        data.unit_type,
      ]
        .map(escapeCsv)
        .join(","),
    );
  });

  return `${lines.join("\n")}\n`;
};

module.exports = {
  runProductImport,
  buildFailedRowsCsv,
};
