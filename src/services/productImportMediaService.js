/**
 * Product import media integration — links import image URLs to Media Library records.
 * URLs remain on the product for backward compatibility; media IDs power the admin picker.
 */

const Media = require("../models/Media");
const { GALLERY_MEDIA_IDS_MAX } = require("../utils/productMediaFields");
const { normalizeMediaUrlPath, toStoredImageUrl } = require("../utils/normalizeMediaUrl");
const { buildMediaPathIndex, analyzeProduct } = require("./mediaBackfillService");

const IMPORT_MEDIA_FOLDER = "product-import";

const guessMimeTypeFromUrl = (url) => {
  const lower = String(url || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "image/jpeg";
};

const fileNameFromUrl = (storedUrl) => {
  const path = normalizeMediaUrlPath(storedUrl) || String(storedUrl || "").trim();
  const base = path.split("/").filter(Boolean).pop() || "";
  if (base) return base.slice(0, 180);
  return `import-${Date.now()}`;
};

const dedupeImageUrls = (urls = []) => {
  const result = [];
  const seen = new Set();

  urls.forEach((url) => {
    const stored = toStoredImageUrl(url);
    if (!stored) return;

    const path = normalizeMediaUrlPath(stored);
    const key = path ? `path:${path}` : `url:${stored.toLowerCase()}`;
    if (seen.has(key)) return;

    seen.add(key);
    result.push(stored);
  });

  return result;
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

const createImportMediaReference = async ({
  storedUrl,
  adminId,
  productName,
  sku,
  role = "product-image",
}) => {
  const fileName = fileNameFromUrl(storedUrl);
  const label = [productName, sku, role].filter(Boolean).join(" — ").slice(0, 240);

  return Media.create({
    fileName,
    originalName: label || fileName,
    filePath: storedUrl,
    fileUrl: storedUrl,
    mimeType: guessMimeTypeFromUrl(storedUrl),
    size: 0,
    type: "image",
    folder: IMPORT_MEDIA_FOLDER,
    title: productName ? `${productName} (${role})` : role,
    altText: productName || "",
    uploadedBy: adminId || null,
    isActive: true,
  });
};

const registerMediaInIndex = (mediaByPath, storedUrl, media) => {
  const path = normalizeMediaUrlPath(storedUrl);
  if (!path || !media) return;

  const bucket = mediaByPath.get(path) || [];
  if (!bucket.some((row) => String(row._id) === String(media._id))) {
    bucket.push(media);
    mediaByPath.set(path, bucket);
  }
};

/**
 * @param {string} url
 * @param {{
 *   adminId?: string,
 *   productName?: string,
 *   sku?: string,
 *   role?: string,
 *   mediaByPath: Map,
 *   sessionCache: Map,
 * }} context
 */
const resolveImportMediaUrl = async (url, context) => {
  const storedUrl = toStoredImageUrl(url);
  if (!storedUrl) {
    return null;
  }

  const path = normalizeMediaUrlPath(storedUrl);
  const cacheKey = path || storedUrl.toLowerCase();

  if (context.sessionCache.has(cacheKey)) {
    return context.sessionCache.get(cacheKey);
  }

  const pathMatch = resolvePathMatch(path, context.mediaByPath);
  if (pathMatch.status === "matchable") {
    const media = pathMatch.matches[0];
    const resolved = {
      mediaId: media._id,
      fileUrl: storedUrl,
      source: "existing",
    };
    context.sessionCache.set(cacheKey, resolved);
    return resolved;
  }

  const media = await createImportMediaReference({
    storedUrl,
    adminId: context.adminId,
    productName: context.productName,
    sku: context.sku,
    role: context.role || "product-image",
  });

  registerMediaInIndex(context.mediaByPath, storedUrl, media);

  const resolved = {
    mediaId: media._id,
    fileUrl: storedUrl,
    source: "created",
  };
  context.sessionCache.set(cacheKey, resolved);
  return resolved;
};

const createImportMediaContext = async () => ({
  mediaByPath: await buildMediaPathIndex({ includeInactiveMedia: false }),
  sessionCache: new Map(),
  adminId: null,
  productName: "",
  sku: "",
});

const resolveImportProductMedia = async ({
  featuredImageUrl = "",
  galleryImageUrls = [],
  adminId,
  productName = "",
  sku = "",
  importContext,
}) => {
  const context = importContext || (await createImportMediaContext());
  context.adminId = adminId || context.adminId;
  context.productName = productName || context.productName;
  context.sku = sku || context.sku;

  let featuredImage = "";
  let featuredMediaId = null;

  if (featuredImageUrl) {
    const resolved = await resolveImportMediaUrl(featuredImageUrl, {
      ...context,
      role: "featured-image",
    });

    if (resolved) {
      featuredImage = resolved.fileUrl;
      featuredMediaId = resolved.mediaId;
    } else {
      featuredImage = toStoredImageUrl(featuredImageUrl);
    }
  }

  const galleryUrls = dedupeImageUrls(
    Array.isArray(galleryImageUrls) ? galleryImageUrls : [],
  ).slice(0, GALLERY_MEDIA_IDS_MAX);

  const galleryImages = [];
  const galleryMediaIds = [];

  for (let index = 0; index < galleryUrls.length; index += 1) {
    const url = galleryUrls[index];
    const resolved = await resolveImportMediaUrl(url, {
      ...context,
      role: `gallery-image-${index + 1}`,
    });

    if (resolved) {
      galleryImages.push(resolved.fileUrl);
      galleryMediaIds.push(resolved.mediaId);
    } else {
      galleryImages.push(toStoredImageUrl(url));
      galleryMediaIds.push(null);
    }
  }

  return {
    featuredImage,
    featuredMediaId,
    galleryImages,
    galleryMediaIds,
  };
};

const backfillProductMediaIds = async (product, importContext) => {
  if (!product) {
    return product;
  }

  const report = analyzeProduct(product, importContext.mediaByPath);
  const updates = {};

  if (
    report.featuredStatus === "matchable" &&
    report.proposedFeaturedMediaId &&
    String(product.featuredMediaId || "") !== String(report.proposedFeaturedMediaId)
  ) {
    updates.featuredMediaId = report.proposedFeaturedMediaId;
  }

  const proposedGalleryIds = report.gallery.map((slot) => {
    if (slot.status === "matchable") {
      return slot.proposedMediaId;
    }
    return slot.currentMediaId;
  });

  const galleryChanged = proposedGalleryIds.some((id, index) => {
    const current = product.galleryMediaIds?.[index] || null;
    return String(current || "") !== String(id || "");
  });

  if (galleryChanged) {
    updates.galleryMediaIds = proposedGalleryIds;
  }

  if (Object.keys(updates).length === 0) {
    return product;
  }

  Object.assign(product, updates);
  await product.save();
  return product;
};

const summarizeImportMediaContext = (importContext) => {
  let created = 0;
  let linked = 0;

  importContext.sessionCache.forEach((entry) => {
    if (entry.source === "created") {
      created += 1;
    } else if (entry.source === "existing") {
      linked += 1;
    }
  });

  return {
    mediaRecordsCreated: created,
    mediaRecordsLinked: linked,
    uniqueImageUrls: importContext.sessionCache.size,
  };
};

module.exports = {
  IMPORT_MEDIA_FOLDER,
  dedupeImageUrls,
  createImportMediaContext,
  resolveImportProductMedia,
  resolveImportMediaUrl,
  backfillProductMediaIds,
  summarizeImportMediaContext,
};
