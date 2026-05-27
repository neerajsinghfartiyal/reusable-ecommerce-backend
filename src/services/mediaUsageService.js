/**
 * Read-only media usage detection (Media-5B, Media-5E-E).
 * V1 scope: products only — featuredMediaId, galleryMediaIds, featuredImage, galleryImages.
 * Detection: media ID references first, normalized URL/path fallback second.
 */

const mongoose = require("mongoose");
const Product = require("../models/Product");
const { normalizeMediaUrlPath } = require("../utils/normalizeMediaUrl");

const isValidMediaId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return false;
  }
  return String(new mongoose.Types.ObjectId(id)) === String(id);
};

const PRODUCT_USAGE_FIELDS = [
  "featuredMediaId",
  "galleryMediaIds",
  "featuredImage",
  "galleryImages",
];

const buildUsageEntry = (product, field, { matchedBy, position = null }) => {
  const entityId = String(product._id);
  const entityLabel =
    String(product.name || product.title || "").trim() || "Unnamed product";

  return {
    entityType: "product",
    entityId,
    entityLabel,
    field,
    editUrl: `/products/edit/${entityId}`,
    matchedBy,
    position: position === null || position === undefined ? null : position,
  };
};

const getUsageDedupeKey = (entry) =>
  `${entry.entityType}:${entry.entityId}:${entry.field}:${entry.position ?? ""}`;

const addUsageToIndex = (index, key, entry) => {
  if (!key) return;
  if (!index.has(key)) {
    index.set(key, []);
  }
  index.get(key).push(entry);
};

const toMediaIdKey = (value) => {
  if (value == null || value === "") {
    return "";
  }
  const id = String(value._id || value).trim();
  return isValidMediaId(id) ? id : "";
};

/**
 * Scan all products once; index usages by media ID and normalized image path.
 * @returns {{ byId: Map<string, object[]>, byPath: Map<string, object[]> }}
 */
const buildProductUsageIndex = async () => {
  const products = await Product.find(
    {},
    {
      name: 1,
      title: 1,
      featuredMediaId: 1,
      galleryMediaIds: 1,
      featuredImage: 1,
      galleryImages: 1,
    },
  ).lean();

  const byId = new Map();
  const byPath = new Map();

  for (const product of products) {
    const featuredMediaId = toMediaIdKey(product.featuredMediaId);
    if (featuredMediaId) {
      addUsageToIndex(
        byId,
        featuredMediaId,
        buildUsageEntry(product, "featuredImage", { matchedBy: "id", position: null }),
      );
    }

    const galleryMediaIds = Array.isArray(product.galleryMediaIds)
      ? product.galleryMediaIds
      : [];

    galleryMediaIds.forEach((rawId, index) => {
      const mediaId = toMediaIdKey(rawId);
      if (!mediaId) return;

      addUsageToIndex(
        byId,
        mediaId,
        buildUsageEntry(product, "galleryImages", {
          matchedBy: "id",
          position: index,
        }),
      );
    });

    const featuredPath = normalizeMediaUrlPath(product.featuredImage);
    if (featuredPath) {
      addUsageToIndex(
        byPath,
        featuredPath,
        buildUsageEntry(product, "featuredImage", { matchedBy: "url", position: null }),
      );
    }

    const gallery = Array.isArray(product.galleryImages) ? product.galleryImages : [];

    gallery.forEach((galleryUrl, index) => {
      const galleryPath = normalizeMediaUrlPath(galleryUrl);
      if (!galleryPath) return;

      addUsageToIndex(
        byPath,
        galleryPath,
        buildUsageEntry(product, "galleryImages", {
          matchedBy: "url",
          position: index,
        }),
      );
    });
  }

  return { byId, byPath };
};

/**
 * Collect normalized path keys that may refer to this media record.
 */
const getMediaMatchPaths = (media) => {
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
 * Find product usages for a media item using a prebuilt index (ID-first, URL fallback).
 */
const findUsagesForMedia = (media, usageIndex) => {
  const byId = usageIndex?.byId || usageIndex;
  const byPath = usageIndex?.byPath || new Map();

  const mediaId = String(media?._id || "");
  const matchPaths = getMediaMatchPaths(media);
  const merged = new Map();

  const idEntries = byId.get(mediaId) || [];
  for (const entry of idEntries) {
    merged.set(getUsageDedupeKey(entry), entry);
  }

  for (const path of matchPaths) {
    const pathEntries = byPath.get(path) || [];
    for (const entry of pathEntries) {
      const key = getUsageDedupeKey(entry);
      if (merged.has(key)) {
        continue;
      }
      merged.set(key, entry);
    }
  }

  const usages = Array.from(merged.values());
  usages.sort((a, b) =>
    String(a.entityLabel).localeCompare(String(b.entityLabel)),
  );

  return usages;
};

const getMediaUsageSummary = async (media) => {
  const usageIndex = await buildProductUsageIndex();
  const usages = findUsagesForMedia(media, usageIndex);

  return {
    mediaId: String(media._id),
    usageCount: usages.length,
    isUsed: usages.length > 0,
    usages,
  };
};

const getProductUsagesForMedia = async (media) => {
  const usageIndex = await buildProductUsageIndex();
  return findUsagesForMedia(media, usageIndex);
};

module.exports = {
  PRODUCT_USAGE_FIELDS,
  isValidMediaId,
  buildProductUsageIndex,
  getMediaMatchPaths,
  getUsageDedupeKey,
  findUsagesForMedia,
  getMediaUsageSummary,
  getProductUsagesForMedia,
  normalizeMediaUrlPath,
};
