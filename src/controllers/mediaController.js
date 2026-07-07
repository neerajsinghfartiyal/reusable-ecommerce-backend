const Media = require("../models/Media");
const sendResponse = require("../utils/response");
const { logActivity } = require("../utils/activityLogger");
const {
  buildProductUsageIndex,
  findUsagesForMedia,
  getProductUsagesForMedia,
  isValidMediaId,
} = require("../services/mediaUsageService");
const {
  runProductMediaIdsBackfillDryRun,
  runProductMediaIdsBackfillApply,
} = require("../services/mediaBackfillService");

const getMediaTypeFromMime = (mimeType) => {
  if (!mimeType) {
    return "other";
  }

  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (
    mimeType.includes("pdf") ||
    mimeType.includes("word") ||
    mimeType.includes("excel") ||
    mimeType.includes("text")
  ) {
    return "document";
  }

  return "other";
};

const uploadMedia = async (req, res) => {
  try {
    if (!req.file) {
      return sendResponse(res, 400, false, "File is required. Choose an image to upload.");
    }

    const folder =
      typeof req.body?.folder === "string" && req.body.folder.trim()
        ? req.body.folder.trim()
        : "general";
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const altText = typeof req.body?.altText === "string" ? req.body.altText.trim() : "";

    const media = await Media.create({
      fileName: req.file.filename,
      originalName: req.file.originalname || "",
      filePath: req.file.path || "",
      fileUrl: `/uploads/media/${req.file.filename}`,
      mimeType: req.file.mimetype || "",
      size: req.file.size || 0,
      type: getMediaTypeFromMime(req.file.mimetype),
      folder,
      title,
      altText,
      uploadedBy: req.admin?._id || null,
    });

    await logActivity({
      admin: req.admin?._id,
      action: "MEDIA_UPLOADED",
      module: "MEDIA",
      description: `Media uploaded: ${media.fileName}`,
      entityId: media._id.toString(),
      entityType: "Media",
      metadata: {
        fileUrl: media.fileUrl,
        mimeType: media.mimeType,
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    const createdMedia = await Media.findById(media._id).populate(
      "uploadedBy",
      "name email role",
    );

    return sendResponse(res, 201, true, "Media uploaded successfully", createdMedia);
  } catch (error) {
    console.error("Media upload failed:", {
      message: error.message,
      stack: error.stack,
      adminId: req.admin?._id?.toString?.() || "",
    });
    return sendResponse(
      res,
      500,
      false,
      "Upload failed. Please check file type, size, or backend upload configuration.",
    );
  }
};

const getAllMedia = async (req, res) => {
  try {
    const {
      search,
      type,
      folder,
      isActive,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { fileName: { $regex: search, $options: "i" } },
        { originalName: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { altText: { $regex: search, $options: "i" } }
      ];
    }

    if (type) {
      query.type = type;
    }

    if (folder) {
      query.folder = folder;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    const currentPage = Number(page) > 0 ? Number(page) : 1;
    const pageLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (currentPage - 1) * pageLimit;
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const mediaList = await Media.find(query)
      .populate("uploadedBy", "name email role")
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(pageLimit);

    const totalMedia = await Media.countDocuments(query);

    let enrichedMedia = mediaList;

    if (req.query.includeUsage === "true") {
      const usageIndex = await buildProductUsageIndex();
      enrichedMedia = mediaList.map((item) => {
        const usages = findUsagesForMedia(item, usageIndex);
        const usageCount = usages.length;
        const plain = typeof item.toObject === "function" ? item.toObject() : item;
        return {
          ...plain,
          usageCount,
          isUsed: usageCount > 0,
        };
      });
    }

    return sendResponse(res, 200, true, "Media list fetched successfully", {
      media: enrichedMedia,
      pagination: {
        totalMedia,
        currentPage,
        totalPages: Math.ceil(totalMedia / pageLimit),
        pageLimit
      }
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getMediaUsage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidMediaId(id)) {
      return sendResponse(res, 404, false, "Media not found");
    }

    const media = await Media.findById(id);

    if (!media) {
      return sendResponse(res, 404, false, "Media not found");
    }

    const usages = await getProductUsagesForMedia(media);

    return sendResponse(res, 200, true, "Media usage fetched successfully", {
      mediaId: media._id.toString(),
      usageCount: usages.length,
      usages,
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getMediaById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidMediaId(id)) {
      return sendResponse(res, 404, false, "Media not found");
    }

    const media = await Media.findById(id).populate(
      "uploadedBy",
      "name email role"
    );

    if (!media) {
      return sendResponse(res, 404, false, "Media not found");
    }

    return sendResponse(res, 200, true, "Media fetched successfully", media);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateMedia = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidMediaId(id)) {
      return sendResponse(res, 404, false, "Media not found");
    }

    const media = await Media.findById(id);

    if (!media) {
      return sendResponse(res, 404, false, "Media not found");
    }

    const { title, altText, folder, isActive } = req.body;

    const isDeactivating =
      isActive !== undefined &&
      (isActive === false || isActive === "false") &&
      media.isActive !== false;

    if (isDeactivating) {
      const usages = await getProductUsagesForMedia(media);

      if (usages.length > 0) {
        return sendResponse(
          res,
          409,
          false,
          "Media is currently used and cannot be deactivated.",
          {
            usageCount: usages.length,
            usages,
          },
        );
      }
    }

    if (title !== undefined) media.title = title;
    if (altText !== undefined) media.altText = altText;
    if (folder !== undefined) media.folder = folder;
    if (isActive !== undefined) media.isActive = isActive !== false && isActive !== "false";

    await media.save();

    await logActivity({
      admin: req.admin._id,
      action: "MEDIA_UPDATED",
      module: "MEDIA",
      description: `Media updated: ${media.fileName}`,
      entityId: media._id.toString(),
      entityType: "Media",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const updatedMedia = await Media.findById(media._id).populate(
      "uploadedBy",
      "name email role"
    );

    return sendResponse(res, 200, true, "Media updated successfully", updatedMedia);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getProductMediaIdsBackfillDryRun = async (req, res) => {
  try {
    const page = Number(req.query.page);
    const limit = Number(req.query.limit);
    const includeProducts = req.query.includeProducts !== "false";

    const report = await runProductMediaIdsBackfillDryRun({
      page: Number.isFinite(page) && page > 0 ? page : 1,
      limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
      includeProducts,
    });

    return sendResponse(
      res,
      200,
      true,
      "Product media ID backfill dry-run report generated",
      report,
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const applyProductMediaIdsBackfill = async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const productIds = Array.isArray(body.productIds) ? body.productIds : undefined;
    const limit = Number(body.limit);
    const dryRun = body.dryRun === true;
    const includeInactiveMedia = body.includeInactiveMedia === true;

    const report = await runProductMediaIdsBackfillApply({
      productIds,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      dryRun,
      includeInactiveMedia,
    });

    const message = dryRun
      ? "Product media ID backfill apply dry-run completed"
      : "Product media ID backfill applied successfully";

    return sendResponse(res, 200, true, message, report);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const deleteMedia = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidMediaId(id)) {
      return sendResponse(res, 404, false, "Media not found");
    }

    const media = await Media.findById(id);

    if (!media) {
      return sendResponse(res, 404, false, "Media not found");
    }

    const usages = await getProductUsagesForMedia(media);

    if (usages.length > 0) {
      return sendResponse(
        res,
        409,
        false,
        "Media is currently used and cannot be deleted.",
        {
          usageCount: usages.length,
          usages,
        },
      );
    }

    media.isActive = false;
    await media.save();

    await logActivity({
      admin: req.admin._id,
      action: "MEDIA_DELETED",
      module: "MEDIA",
      description: `Media deactivated: ${media.fileName}`,
      entityId: media._id.toString(),
      entityType: "Media",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    return sendResponse(res, 200, true, "Media deleted successfully", media);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  uploadMedia,
  getAllMedia,
  getProductMediaIdsBackfillDryRun,
  applyProductMediaIdsBackfill,
  getMediaUsage,
  getMediaById,
  updateMedia,
  deleteMedia
};
