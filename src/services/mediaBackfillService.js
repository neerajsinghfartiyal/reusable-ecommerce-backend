/**
 * Product media ID backfill analysis and apply (Media-5E-C).
 * Dry-run: read-only. Apply: writes featuredMediaId / galleryMediaIds for matchable slots only.
 */

const mongoose = require("mongoose");
const Product = require("../models/Product");
const Media = require("../models/Media");
const { normalizeMediaUrlPath } = require("../utils/normalizeMediaUrl");
const { resolveProductMediaIdFields } = require("../utils/productMediaFields");

const PRODUCT_PROJECTION = {
  name: 1,
  title: 1,
  featuredImage: 1,
  featuredMediaId: 1,
  galleryImages: 1,
  galleryMediaIds: 1,
};

const isValidObjectId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return false;
  }
  return String(new mongoose.Types.ObjectId(id)) === String(id);
};

const toMediaIdString = (value) => {
  if (value == null || value === "") {
    return null;
  }
  const id = String(value._id || value).trim();
  return isValidObjectId(id) ? id : null;
};

const getMediaPathsForRecord = (media) => {
  const paths = new Set();
  const candidates = [
    media?.fileUrl,
    media?.filePath,
    media?.fileName ? `/uploads/media/${media.fileName}` : "",
  ];

  candidates.forEach((value) => {
    const normalized = normalizeMediaUrlPath(value);
    if (normalized) {
      paths.add(normalized);
    }
  });

  return paths;
};

/**
 * @returns {Map<string, object[]>} normalized path -> media rows
 * @param {{ includeInactiveMedia?: boolean }} options
 */
const buildMediaPathIndex = async (options = {}) => {
  const includeInactiveMedia = options.includeInactiveMedia === true;
  const mediaFilter = includeInactiveMedia ? {} : { isActive: true };

  const mediaList = await Media.find(mediaFilter, {
    fileUrl: 1,
    filePath: 1,
    fileName: 1,
    isActive: 1,
  }).lean();

  const byPath = new Map();

  for (const media of mediaList) {
    const paths = getMediaPathsForRecord(media);
    for (const path of paths) {
      if (!byPath.has(path)) {
        byPath.set(path, []);
      }
      const bucket = byPath.get(path);
      const id = String(media._id);
      if (!bucket.some((row) => String(row._id) === id)) {
        bucket.push(media);
      }
    }
  }

  return byPath;
};

const resolvePathMatch = (path, mediaByPath) => {
  if (!path) {
    return { status: "empty", matches: [] };
  }

  const matches = mediaByPath.get(path) || [];
  if (matches.length === 0) {
    return { status: "unmatched", matches: [] };
  }
  if (matches.length > 1) {
    return { status: "conflict", matches };
  }
  return { status: "matchable", matches };
};

const mediaIdMatchesPath = (mediaId, path, mediaByPath) => {
  if (!mediaId || !path) {
    return false;
  }
  const matches = mediaByPath.get(path) || [];
  return matches.some((row) => String(row._id) === String(mediaId));
};

const analyzeFeatured = (product, mediaByPath) => {
  const featuredImage = String(product.featuredImage || "").trim();
  const path = normalizeMediaUrlPath(featuredImage);
  const currentFeaturedMediaId = toMediaIdString(product.featuredMediaId);
  const pathMatch = resolvePathMatch(path, mediaByPath);
  const singleMatchId =
    pathMatch.matches.length === 1 ? String(pathMatch.matches[0]._id) : null;

  if (!path) {
    const status = currentFeaturedMediaId ? "conflict" : "empty";
    return {
      featuredImage,
      currentFeaturedMediaId,
      proposedFeaturedMediaId: null,
      featuredStatus: status,
    };
  }

  if (currentFeaturedMediaId) {
    if (
      pathMatch.status === "matchable" &&
      mediaIdMatchesPath(currentFeaturedMediaId, path, mediaByPath)
    ) {
      return {
        featuredImage,
        currentFeaturedMediaId,
        proposedFeaturedMediaId: currentFeaturedMediaId,
        featuredStatus: "already_set",
      };
    }

    return {
      featuredImage,
      currentFeaturedMediaId,
      proposedFeaturedMediaId: null,
      featuredStatus: "conflict",
    };
  }

  if (pathMatch.status === "matchable") {
    return {
      featuredImage,
      currentFeaturedMediaId: null,
      proposedFeaturedMediaId: singleMatchId,
      featuredStatus: "matchable",
    };
  }

  return {
    featuredImage,
    currentFeaturedMediaId: null,
    proposedFeaturedMediaId: null,
    featuredStatus: pathMatch.status,
  };
};

const analyzeGallerySlot = (index, imageUrl, currentMediaId, mediaByPath) => {
  const path = normalizeMediaUrlPath(imageUrl);
  const pathMatch = resolvePathMatch(path, mediaByPath);
  const singleMatchId =
    pathMatch.matches.length === 1 ? String(pathMatch.matches[0]._id) : null;

  if (!path) {
    return {
      index,
      imageUrl: imageUrl || "",
      currentMediaId,
      proposedMediaId: null,
      status: currentMediaId ? "conflict" : "empty",
    };
  }

  if (currentMediaId) {
    if (
      pathMatch.status === "matchable" &&
      mediaIdMatchesPath(currentMediaId, path, mediaByPath)
    ) {
      return {
        index,
        imageUrl,
        currentMediaId,
        proposedMediaId: currentMediaId,
        status: "already_set",
      };
    }

    return {
      index,
      imageUrl,
      currentMediaId,
      proposedMediaId: null,
      status: "conflict",
    };
  }

  if (pathMatch.status === "matchable") {
    return {
      index,
      imageUrl,
      currentMediaId: null,
      proposedMediaId: singleMatchId,
      status: "matchable",
    };
  }

  return {
    index,
    imageUrl,
    currentMediaId: null,
    proposedMediaId: null,
    status: pathMatch.status,
  };
};

const getGalleryAlignmentWarnings = (galleryImages, galleryMediaIds) => {
  const warnings = [];
  const urlCount = galleryImages.length;
  const idCount = Array.isArray(galleryMediaIds) ? galleryMediaIds.length : 0;
  const nonNullIds = (galleryMediaIds || []).filter(
    (id) => toMediaIdString(id) != null,
  ).length;

  if (idCount > urlCount) {
    warnings.push(
      `galleryMediaIds length (${idCount}) is longer than galleryImages (${urlCount}).`,
    );
  } else if (idCount > 0 && idCount < urlCount && nonNullIds > 0) {
    warnings.push(
      `Legacy compact galleryMediaIds (${idCount}) is shorter than galleryImages (${urlCount}); index alignment may be incorrect until backfill.`,
    );
  }

  return warnings;
};

const alignedCurrentGalleryIds = (galleryImages, galleryMediaIds) =>
  galleryImages.map((_, index) => {
    const raw = Array.isArray(galleryMediaIds) ? galleryMediaIds[index] : null;
    return toMediaIdString(raw);
  });

const galleryArraysWouldChange = (currentAligned, proposedAligned) => {
  if (currentAligned.length !== proposedAligned.length) {
    return true;
  }

  for (let index = 0; index < proposedAligned.length; index += 1) {
    const current = currentAligned[index] ?? null;
    const proposed = proposedAligned[index] ?? null;
    if (String(current || "") !== String(proposed || "")) {
      return true;
    }
  }

  return false;
};

const analyzeProduct = (product, mediaByPath) => {
  const galleryImages = Array.isArray(product.galleryImages)
    ? product.galleryImages
    : [];
  const galleryMediaIds = Array.isArray(product.galleryMediaIds)
    ? product.galleryMediaIds
    : [];

  const featured = analyzeFeatured(product, mediaByPath);
  const gallery = galleryImages.map((imageUrl, index) =>
    analyzeGallerySlot(
      index,
      imageUrl,
      toMediaIdString(galleryMediaIds[index]),
      mediaByPath,
    ),
  );

  const warnings = getGalleryAlignmentWarnings(galleryImages, galleryMediaIds);
  const proposedGalleryIds = gallery.map((slot) => slot.proposedMediaId);
  const currentAlignedIds = alignedCurrentGalleryIds(
    galleryImages,
    galleryMediaIds,
  );

  const featuredWouldUpdate =
    featured.featuredStatus === "matchable" &&
    String(featured.proposedFeaturedMediaId || "") !==
      String(featured.currentFeaturedMediaId || "");

  const galleryWouldUpdate = galleryArraysWouldChange(
    currentAlignedIds,
    proposedGalleryIds,
  );

  const wouldUpdate = featuredWouldUpdate || galleryWouldUpdate;

  return {
    productId: String(product._id),
    productName:
      String(product.name || product.title || "").trim() || "Unnamed product",
    featuredImage: featured.featuredImage,
    currentFeaturedMediaId: featured.currentFeaturedMediaId,
    proposedFeaturedMediaId: featured.proposedFeaturedMediaId,
    featuredStatus: featured.featuredStatus,
    gallery,
    wouldUpdate,
    warnings,
  };
};

const emptyFeaturedSummary = () => ({
  alreadySet: 0,
  matchable: 0,
  unmatched: 0,
  conflict: 0,
  wouldUpdate: 0,
});

const emptyGallerySummary = () => ({
  alreadySetSlots: 0,
  matchableSlots: 0,
  unmatchedSlots: 0,
  conflictSlots: 0,
  wouldUpdateProducts: 0,
});

const buildSummary = (reports) => {
  const featured = emptyFeaturedSummary();
  const gallery = emptyGallerySummary();

  let productsNeedingFeaturedBackfill = 0;
  let productsNeedingGalleryBackfill = 0;
  let totalMatchableReferences = 0;
  let totalUnmatchedReferences = 0;
  let totalConflicts = 0;
  let totalWouldUpdateProducts = 0;

  for (const report of reports) {
    switch (report.featuredStatus) {
      case "already_set":
        featured.alreadySet += 1;
        break;
      case "matchable":
        featured.matchable += 1;
        totalMatchableReferences += 1;
        if (!report.currentFeaturedMediaId) {
          productsNeedingFeaturedBackfill += 1;
        }
        break;
      case "unmatched":
        featured.unmatched += 1;
        totalUnmatchedReferences += 1;
        break;
      case "conflict":
        featured.conflict += 1;
        totalConflicts += 1;
        break;
      default:
        break;
    }

    if (
      report.featuredStatus === "matchable" &&
      String(report.proposedFeaturedMediaId || "") !==
        String(report.currentFeaturedMediaId || "")
    ) {
      featured.wouldUpdate += 1;
    }

    let productHasGalleryBackfill = false;

    for (const slot of report.gallery) {
      switch (slot.status) {
        case "already_set":
          gallery.alreadySetSlots += 1;
          break;
        case "matchable":
          gallery.matchableSlots += 1;
          totalMatchableReferences += 1;
          if (!slot.currentMediaId) {
            productHasGalleryBackfill = true;
          }
          break;
        case "unmatched":
          gallery.unmatchedSlots += 1;
          totalUnmatchedReferences += 1;
          break;
        case "conflict":
          gallery.conflictSlots += 1;
          totalConflicts += 1;
          break;
        default:
          break;
      }
    }

    if (productHasGalleryBackfill) {
      productsNeedingGalleryBackfill += 1;
    }

    if (report.wouldUpdate) {
      totalWouldUpdateProducts += 1;
      gallery.wouldUpdateProducts += 1;
    }
  }

  return {
    featured,
    gallery,
    productsNeedingFeaturedBackfill,
    productsNeedingGalleryBackfill,
    totalMatchableReferences,
    totalUnmatchedReferences,
    totalConflicts,
    totalWouldUpdateProducts,
  };
};

/**
 * Dry-run report for product media ID backfill (read-only).
 * @param {{ page?: number, limit?: number, includeProducts?: boolean }} options
 */
const runProductMediaIdsBackfillDryRun = async (options = {}) => {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 50));
  const includeProducts = options.includeProducts !== false;

  const includeInactiveMedia = options.includeInactiveMedia === true;

  const [totalProducts, mediaByPath, products] = await Promise.all([
    Product.countDocuments(),
    buildMediaPathIndex({ includeInactiveMedia }),
    Product.find({}, PRODUCT_PROJECTION)
      .sort({ updatedAt: -1, _id: 1 })
      .lean(),
  ]);

  const reports = products.map((product) => analyzeProduct(product, mediaByPath));
  const summaryExtras = buildSummary(reports);
  const start = (page - 1) * limit;
  const end = start + limit;

  return {
    totalProducts,
    productsScanned: products.length,
    productsNeedingFeaturedBackfill: summaryExtras.productsNeedingFeaturedBackfill,
    productsNeedingGalleryBackfill: summaryExtras.productsNeedingGalleryBackfill,
    totalMatchableReferences: summaryExtras.totalMatchableReferences,
    totalUnmatchedReferences: summaryExtras.totalUnmatchedReferences,
    totalConflicts: summaryExtras.totalConflicts,
    totalWouldUpdateProducts: summaryExtras.totalWouldUpdateProducts,
    featured: summaryExtras.featured,
    gallery: summaryExtras.gallery,
    pagination: {
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(reports.length / limit)),
      totalItems: reports.length,
    },
    includeProducts,
    products: includeProducts ? reports.slice(start, end) : [],
  };
};

const serializeFeaturedMediaId = (value) => {
  if (value == null || value === "") {
    return "";
  }
  return String(value._id || value);
};

const serializeGalleryMediaIds = (ids) => {
  const list = Array.isArray(ids) ? ids : [];
  return list.map((id) => (id == null || id === "" ? "" : String(id._id || id)));
};

const buildGalleryMediaIdsForApply = (report) =>
  report.gallery.map((slot) => {
    if (slot.status === "matchable") {
      return slot.proposedMediaId;
    }
    if (
      slot.status === "already_set" ||
      slot.status === "conflict" ||
      slot.status === "unmatched" ||
      slot.status === "empty"
    ) {
      return slot.currentMediaId;
    }
    return slot.currentMediaId;
  });

const galleryIdsWouldChange = (currentIds, nextIds) => {
  const current = serializeGalleryMediaIds(currentIds);
  const next = serializeGalleryMediaIds(nextIds);

  if (current.length !== next.length) {
    return true;
  }

  for (let index = 0; index < next.length; index += 1) {
    if ((current[index] ?? "") !== (next[index] ?? "")) {
      return true;
    }
  }

  return false;
};

const parseProductIdFilter = (productIds) => {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return null;
  }

  const valid = productIds
    .map((id) => String(id || "").trim())
    .filter((id) => isValidObjectId(id));

  return valid.length ? valid : null;
};

/**
 * Apply matchable featuredMediaId / galleryMediaIds only (Media-5E-C-Apply).
 * @param {{
 *   productIds?: string[],
 *   limit?: number,
 *   dryRun?: boolean,
 *   includeInactiveMedia?: boolean,
 * }} options
 */
const runProductMediaIdsBackfillApply = async (options = {}) => {
  const dryRun = options.dryRun === true;
  const includeInactiveMedia = options.includeInactiveMedia === true;
  const requestedProductIds = Array.isArray(options.productIds)
    ? options.productIds
    : null;
  const idFilter = parseProductIdFilter(requestedProductIds);

  if (requestedProductIds && requestedProductIds.length > 0 && !idFilter) {
    return {
      dryRun,
      includeInactiveMedia,
      scannedProducts: 0,
      updatedProducts: 0,
      skippedProducts: 0,
      appliedFeatured: 0,
      appliedGallerySlots: 0,
      skippedConflicts: 0,
      skippedUnmatched: 0,
      errors: [{ message: "No valid productIds provided." }],
      products: [],
    };
  }

  const productQuery = idFilter ? { _id: { $in: idFilter } } : {};
  let productQueryBuilder = Product.find(productQuery, PRODUCT_PROJECTION).sort({
    updatedAt: -1,
    _id: 1,
  });

  const limit = Number(options.limit);
  if (Number.isFinite(limit) && limit > 0) {
    productQueryBuilder = productQueryBuilder.limit(Math.min(limit, 5000));
  }

  const [mediaByPath, products] = await Promise.all([
    buildMediaPathIndex({ includeInactiveMedia }),
    productQueryBuilder.lean(),
  ]);

  const result = {
    dryRun,
    includeInactiveMedia,
    scannedProducts: products.length,
    updatedProducts: 0,
    skippedProducts: 0,
    appliedFeatured: 0,
    appliedGallerySlots: 0,
    skippedConflicts: 0,
    skippedUnmatched: 0,
    errors: [],
    products: [],
  };

  for (const product of products) {
    const report = analyzeProduct(product, mediaByPath);
    const productResult = {
      productId: report.productId,
      productName: report.productName,
      updated: false,
      featuredApplied: false,
      gallerySlotsApplied: 0,
      skippedReasons: [],
    };

    for (const slot of report.gallery) {
      if (slot.status === "conflict") {
        result.skippedConflicts += 1;
      } else if (slot.status === "unmatched") {
        result.skippedUnmatched += 1;
      }
    }

    if (report.featuredStatus === "conflict") {
      result.skippedConflicts += 1;
    } else if (report.featuredStatus === "unmatched") {
      result.skippedUnmatched += 1;
    }

    const applyFeatured = report.featuredStatus === "matchable";
    const matchableGallerySlots = report.gallery.filter(
      (slot) => slot.status === "matchable",
    );

    if (!applyFeatured && matchableGallerySlots.length === 0) {
      result.skippedProducts += 1;
      productResult.skippedReasons.push("no_matchable_references");
      result.products.push(productResult);
      continue;
    }

    const body = {};

    if (applyFeatured) {
      body.featuredMediaId = report.proposedFeaturedMediaId;
    }

    if (matchableGallerySlots.length > 0) {
      body.galleryMediaIds = buildGalleryMediaIdsForApply(report);
    }

    const resolved = await resolveProductMediaIdFields(body, product);

    if (resolved.error) {
      result.errors.push({
        productId: report.productId,
        message: resolved.error,
      });
      result.skippedProducts += 1;
      productResult.skippedReasons.push(resolved.error);
      result.products.push(productResult);
      continue;
    }

    const featuredChanged =
      resolved.featuredMediaId !== undefined &&
      serializeFeaturedMediaId(product.featuredMediaId) !==
        serializeFeaturedMediaId(resolved.featuredMediaId);

    const galleryChanged =
      resolved.galleryMediaIds !== undefined &&
      galleryIdsWouldChange(product.galleryMediaIds, resolved.galleryMediaIds);

    if (!featuredChanged && !galleryChanged) {
      result.skippedProducts += 1;
      productResult.skippedReasons.push("no_id_changes");
      result.products.push(productResult);
      continue;
    }

    if (!dryRun) {
      const productDoc = await Product.findById(product._id);

      if (!productDoc) {
        result.errors.push({
          productId: report.productId,
          message: "Product not found.",
        });
        result.skippedProducts += 1;
        productResult.skippedReasons.push("product_not_found");
        result.products.push(productResult);
        continue;
      }

      if (resolved.featuredMediaId !== undefined) {
        productDoc.featuredMediaId = resolved.featuredMediaId;
      }

      if (resolved.galleryMediaIds !== undefined) {
        productDoc.galleryMediaIds = resolved.galleryMediaIds;
      }

      await productDoc.save();
    }

    result.updatedProducts += 1;
    productResult.updated = true;

    if (featuredChanged) {
      result.appliedFeatured += 1;
      productResult.featuredApplied = true;
    }

    if (galleryChanged) {
      const slotCount = matchableGallerySlots.length;
      result.appliedGallerySlots += slotCount;
      productResult.gallerySlotsApplied = slotCount;
    }

    result.products.push(productResult);
  }

  return result;
};

module.exports = {
  buildMediaPathIndex,
  analyzeProduct,
  runProductMediaIdsBackfillDryRun,
  runProductMediaIdsBackfillApply,
};
