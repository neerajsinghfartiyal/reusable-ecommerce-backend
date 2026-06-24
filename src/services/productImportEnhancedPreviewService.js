/**
 * Extends Import-2 preview with DB resolvers + duplicate detection (Import-4).
 * Preserves buildImportPreview output shape; adds enrichment fields.
 */

const { buildImportPreviewFromFile } = require("./productImportParseService");
const {
  loadResolverCatalogs,
  resolveRowResolvers,
  applyRowMappings,
  markResolversForAutoCreate,
  getRowResolverState,
  normalizeKey,
} = require("./productImportResolverService");

const DUPLICATE_STRATEGIES = ["skip_duplicates", "update_existing", "create_only"];

const parseGalleryUrls = (value) =>
  String(value || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

const buildMediaImportSummary = (normalizedData = {}) => {
  const featured = Boolean(String(normalizedData.featured_image || "").trim());
  const galleryCount = parseGalleryUrls(normalizedData.gallery_images).length;

  if (!featured && galleryCount === 0) {
    return null;
  }

  return {
    featuredImage: featured,
    galleryCount,
    note: "Image URLs will be linked to Media Library records when this row is imported.",
  };
};

const getValidationState = (row) => {
  if (row.errors?.length) return "error";
  if (row.warnings?.length) return "warning";
  return "valid";
};

const getDuplicateState = (row, catalogs, strategy = "skip_duplicates") => {
  const productType = String(row.productType || "").toLowerCase();
  if (productType === "variation") {
    const sku = String(row.sku || "").trim();
    const existing = sku ? catalogs.skuIndex.get(sku) : null;
    if (existing?.isVariation) {
      if (strategy === "update_existing") return "update";
      if (strategy === "create_only") return "skip";
      return "duplicate";
    }
    if (existing && !existing.isVariation) return "conflict";
    return "new";
  }

  if (productType === "simple" || productType === "variable") {
    const sku = String(row.sku || "").trim();
    const existing = sku ? catalogs.skuIndex.get(sku) : null;
    if (!existing || existing.isVariation) return "new";
    if (strategy === "update_existing") return "update";
    if (strategy === "create_only") return "skip";
    return "duplicate";
  }

  return "unknown";
};

const buildRowBadges = (row) => {
  const badges = [];
  if (row.validationState === "valid") badges.push("Valid");
  if (row.validationState === "warning") badges.push("Warning");
  if (row.validationState === "error") badges.push("Error");
  if (row.duplicateState === "duplicate" || row.duplicateState === "skip") {
    badges.push("Duplicate");
  }
  if (row.duplicateState === "update") badges.push("Update");
  if (row.duplicateState === "new") badges.push("New");
  if (row.resolverState === "needs_mapping") badges.push("Needs mapping");
  if (row.resolvers?.category?.status === "will_create") badges.push("Auto-create");
  return badges;
};

const enrichPreviewRows = (preview, catalogs, options = {}) => {
  const strategy = DUPLICATE_STRATEGIES.includes(options.duplicateStrategy)
    ? options.duplicateStrategy
    : "skip_duplicates";
  const rowMappingsByNumber = options.rowMappings || {};
  const checkNameDuplicates = Boolean(options.checkNameDuplicates);
  const autoCreateCatalog = options.autoCreateCatalog !== false;

  const duplicateSummary = {
    newProducts: 0,
    updates: 0,
    skippedDuplicates: 0,
    unresolvedRows: 0,
    errors: 0,
  };

  const enrichedRows = preview.rows.map((row) => {
    const resolved = resolveRowResolvers(row.normalizedData || {}, catalogs);
    const mappings = rowMappingsByNumber[row.rowNumber] || {};
    const mergedResolvers = applyRowMappings(
      resolved.resolvers,
      mappings,
      row.normalizedData || {},
    );
    const { resolverState: mappedState, ...resolverFields } = mergedResolvers;
    const resolversWithAuto = autoCreateCatalog
      ? markResolversForAutoCreate(resolverFields, row.normalizedData || {}, true)
      : resolverFields;
    const resolverState = getRowResolverState(
      row.normalizedData || {},
      resolversWithAuto,
      resolversWithAuto.attributes || [],
    );

    const validationState = getValidationState(row);
    const duplicateState = getDuplicateState(row, catalogs, strategy);

    if (validationState === "error") {
      duplicateSummary.errors += 1;
    } else if (resolverState === "needs_mapping") {
      duplicateSummary.unresolvedRows += 1;
    } else if (duplicateState === "new") {
      duplicateSummary.newProducts += 1;
    } else if (duplicateState === "update") {
      duplicateSummary.updates += 1;
    } else if (duplicateState === "duplicate" || duplicateState === "skip") {
      duplicateSummary.skippedDuplicates += 1;
    }

    const nameKey = normalizeKey(row.productName);
    let nameDuplicate = false;
    if (checkNameDuplicates && nameKey && row.sku) {
      const byName = catalogs.nameIndex.get(nameKey);
      if (byName && byName.sku !== row.sku) {
        nameDuplicate = true;
      }
    }

    const enriched = {
      ...row,
      validationState,
      duplicateState,
      resolverState,
      resolvers: resolversWithAuto,
      nameDuplicate,
      mediaImport: buildMediaImportSummary(row.normalizedData || {}),
      badges: [],
    };
    enriched.badges = buildRowBadges(enriched);
    return enriched;
  });

  return {
    ...preview,
    rows: enrichedRows,
    duplicateSummary,
    duplicateStrategy: strategy,
    autoCreateCatalog,
    resolverOptions: catalogs.options,
    enhanced: true,
  };
};

const buildEnhancedImportPreviewFromFile = async (buffer, originalName = "", options = {}) => {
  const basePreview = buildImportPreviewFromFile(buffer, originalName);
  const catalogs = await loadResolverCatalogs();
  return enrichPreviewRows(basePreview, catalogs, options);
};

module.exports = {
  DUPLICATE_STRATEGIES,
  buildEnhancedImportPreviewFromFile,
  enrichPreviewRows,
};
