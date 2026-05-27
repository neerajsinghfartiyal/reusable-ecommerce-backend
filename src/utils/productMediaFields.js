/**
 * Optional product media ID fields (Media-5E-B).
 * featuredMediaId / galleryMediaIds — URLs remain compatibility fields.
 */

const mongoose = require("mongoose");
const Media = require("../models/Media");

const GALLERY_MEDIA_IDS_MAX = 20;

const isValidObjectId = (value) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return false;
  }
  return String(new mongoose.Types.ObjectId(value)) === String(value);
};

const parseArrayField = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return [];
    }

    try {
      const parsedValue = JSON.parse(trimmedValue);
      return Array.isArray(parsedValue) ? parsedValue : [];
    } catch {
      return [];
    }
  }

  return [];
};

const getExistingFeaturedMediaId = (product) => {
  if (!product?.featuredMediaId) {
    return "";
  }
  return String(product.featuredMediaId);
};

const getExistingGalleryMediaIdSet = (product) => {
  const ids = Array.isArray(product?.galleryMediaIds) ? product.galleryMediaIds : [];
  return new Set(
    ids
      .filter((id) => id != null && id !== "")
      .map((id) => String(id)),
  );
};

const assertMediaAssignable = (media, mediaId, existingIdSet) => {
  if (!media) {
    return `Media not found: ${mediaId}`;
  }

  const isExistingReference = existingIdSet.has(String(media._id));

  if (media.isActive === false && !isExistingReference) {
    return `Media is inactive and cannot be assigned: ${mediaId}`;
  }

  return null;
};

/**
 * Resolve optional featuredMediaId / galleryMediaIds from request body.
 * Only fields present on body are returned (undefined = omit / leave unchanged on update).
 *
 * @returns {{ featuredMediaId?: null|ObjectId, galleryMediaIds?: (ObjectId|null)[], error?: string }}
 */
const resolveProductMediaIdFields = async (body = {}, existingProduct = null) => {
  const result = {};
  const existingFeaturedId = getExistingFeaturedMediaId(existingProduct);
  const existingGalleryIdSet = getExistingGalleryMediaIdSet(existingProduct);

  if (Object.prototype.hasOwnProperty.call(body, "featuredMediaId")) {
    const raw = body.featuredMediaId;

    if (raw === null || raw === "") {
      result.featuredMediaId = null;
    } else {
      const id = String(raw).trim();

      if (!isValidObjectId(id)) {
        return { error: "Invalid featuredMediaId." };
      }

      const media = await Media.findById(id).select("_id isActive").lean();

      const assignError = assertMediaAssignable(media, id, new Set(
        existingFeaturedId ? [existingFeaturedId] : [],
      ));

      if (assignError) {
        return { error: assignError };
      }

      result.featuredMediaId = media._id;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "galleryMediaIds")) {
    const parsed = parseArrayField(body.galleryMediaIds);
    const normalizedSlots = [];
    const assignableIdStrings = [];

    for (let index = 0; index < parsed.length; index += 1) {
      const entry = parsed[index];

      if (entry === null || entry === undefined || entry === "") {
        normalizedSlots.push(null);
        continue;
      }

      const id = String(entry).trim();

      if (!id) {
        normalizedSlots.push(null);
        continue;
      }

      if (!isValidObjectId(id)) {
        return { error: `Invalid galleryMediaIds[${index}].` };
      }

      normalizedSlots.push(id);
      assignableIdStrings.push(id);
    }

    if (normalizedSlots.length > GALLERY_MEDIA_IDS_MAX) {
      return {
        error: `galleryMediaIds cannot exceed ${GALLERY_MEDIA_IDS_MAX} items.`,
      };
    }

    const seen = new Set();
    for (const id of assignableIdStrings) {
      if (seen.has(id)) {
        return { error: "galleryMediaIds cannot contain duplicate media IDs." };
      }
      seen.add(id);
    }

    if (normalizedSlots.length === 0) {
      result.galleryMediaIds = [];
    } else if (assignableIdStrings.length === 0) {
      result.galleryMediaIds = normalizedSlots;
    } else {
      const mediaRows = await Media.find({ _id: { $in: assignableIdStrings } })
        .select("_id isActive")
        .lean();

      const mediaById = new Map(mediaRows.map((row) => [String(row._id), row]));

      const objectIds = [];

      for (const slot of normalizedSlots) {
        if (slot === null) {
          objectIds.push(null);
          continue;
        }

        const media = mediaById.get(slot);

        const assignError = assertMediaAssignable(media, slot, existingGalleryIdSet);

        if (assignError) {
          return { error: assignError };
        }

        objectIds.push(media._id);
      }

      result.galleryMediaIds = objectIds;
    }
  }

  return result;
};

module.exports = {
  GALLERY_MEDIA_IDS_MAX,
  resolveProductMediaIdFields,
};
