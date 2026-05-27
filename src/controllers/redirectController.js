const Redirect = require("../models/Redirect");
const sendResponse = require("../utils/response");
const { logActivity } = require("../utils/activityLogger");

const normalizeSourcePath = (pathValue) => {
  const value = String(pathValue || "").trim();
  if (!value) return "";
  return value.startsWith("/") ? value : `/${value}`;
};

const isExternalUrl = (pathValue) => /^https?:\/\//i.test(pathValue);

const normalizeTargetPath = (pathValue) => {
  const value = String(pathValue || "").trim();
  if (!value) return "";
  if (isExternalUrl(value)) return value;
  return value.startsWith("/") ? value : `/${value}`;
};

const createRedirect = async (req, res) => {
  try {
    const { sourcePath, targetPath, redirectType, isActive, notes } = req.body;

    if (!sourcePath || !targetPath) {
      return sendResponse(res, 400, false, "Source path and target path are required");
    }

    const normalizedSourcePath = normalizeSourcePath(sourcePath);
    const normalizedTargetPath = normalizeTargetPath(targetPath);

    if (normalizedSourcePath === normalizedTargetPath) {
      return sendResponse(res, 400, false, "Source path and target path cannot be the same");
    }

    const existingRedirect = await Redirect.findOne({ sourcePath: normalizedSourcePath });
    if (existingRedirect) {
      return sendResponse(res, 400, false, "Redirect for this source path already exists");
    }

    const redirect = await Redirect.create({
      sourcePath: normalizedSourcePath,
      targetPath: normalizedTargetPath,
      redirectType: redirectType || 301,
      isActive: isActive !== undefined ? isActive : true,
      notes: notes || "",
      createdBy: req.admin._id,
      updatedBy: req.admin._id
    });

    await logActivity({
      admin: req.admin._id,
      action: "REDIRECT_CREATED",
      module: "REDIRECT",
      description: `Redirect created: ${redirect.sourcePath} -> ${redirect.targetPath}`,
      entityId: redirect._id.toString(),
      entityType: "Redirect",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const createdRedirect = await Redirect.findById(redirect._id)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role");

    return sendResponse(res, 201, true, "Redirect created successfully", createdRedirect);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getAllRedirects = async (req, res) => {
  try {
    const {
      search,
      redirectType,
      isActive,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { sourcePath: { $regex: search, $options: "i" } },
        { targetPath: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } }
      ];
    }

    if (redirectType) {
      query.redirectType = Number(redirectType);
    }

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    const currentPage = Number(page) > 0 ? Number(page) : 1;
    const pageLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (currentPage - 1) * pageLimit;
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const redirects = await Redirect.find(query)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role")
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(pageLimit);

    const totalRedirects = await Redirect.countDocuments(query);

    return sendResponse(res, 200, true, "Redirect list fetched successfully", {
      redirects,
      pagination: {
        totalRedirects,
        currentPage,
        totalPages: Math.ceil(totalRedirects / pageLimit),
        pageLimit
      }
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getRedirectById = async (req, res) => {
  try {
    const redirect = await Redirect.findById(req.params.id)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role");

    if (!redirect) {
      return sendResponse(res, 404, false, "Redirect not found");
    }

    return sendResponse(res, 200, true, "Redirect fetched successfully", redirect);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateRedirect = async (req, res) => {
  try {
    const redirect = await Redirect.findById(req.params.id);
    if (!redirect) {
      return sendResponse(res, 404, false, "Redirect not found");
    }

    const { sourcePath, targetPath, redirectType, isActive, notes } = req.body;

    let normalizedSourcePath = redirect.sourcePath;
    let normalizedTargetPath = redirect.targetPath;

    if (sourcePath !== undefined) {
      normalizedSourcePath = normalizeSourcePath(sourcePath);
      if (normalizedSourcePath !== redirect.sourcePath) {
        const existingRedirect = await Redirect.findOne({ sourcePath: normalizedSourcePath });
        if (existingRedirect) {
          return sendResponse(res, 400, false, "Redirect for this source path already exists");
        }
      }
    }

    if (targetPath !== undefined) {
      normalizedTargetPath = normalizeTargetPath(targetPath);
    }

    if (normalizedSourcePath === normalizedTargetPath) {
      return sendResponse(res, 400, false, "Source path and target path cannot be the same");
    }

    redirect.sourcePath = normalizedSourcePath;
    redirect.targetPath = normalizedTargetPath;

    if (redirectType !== undefined) redirect.redirectType = Number(redirectType);
    if (isActive !== undefined) redirect.isActive = isActive;
    if (notes !== undefined) redirect.notes = notes;

    redirect.updatedBy = req.admin._id;
    await redirect.save();

    await logActivity({
      admin: req.admin._id,
      action: "REDIRECT_UPDATED",
      module: "REDIRECT",
      description: `Redirect updated: ${redirect.sourcePath} -> ${redirect.targetPath}`,
      entityId: redirect._id.toString(),
      entityType: "Redirect",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const updatedRedirect = await Redirect.findById(redirect._id)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role");

    return sendResponse(res, 200, true, "Redirect updated successfully", updatedRedirect);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const deleteRedirect = async (req, res) => {
  try {
    const redirect = await Redirect.findById(req.params.id);
    if (!redirect) {
      return sendResponse(res, 404, false, "Redirect not found");
    }

    redirect.isActive = false;
    redirect.updatedBy = req.admin._id;
    await redirect.save();

    await logActivity({
      admin: req.admin._id,
      action: "REDIRECT_DELETED",
      module: "REDIRECT",
      description: `Redirect deactivated: ${redirect.sourcePath}`,
      entityId: redirect._id.toString(),
      entityType: "Redirect",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    return sendResponse(res, 200, true, "Redirect deleted successfully", redirect);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const lookupRedirect = async (req, res) => {
  try {
    const requestedPath = normalizeSourcePath(req.query.path);

    if (!requestedPath) {
      return sendResponse(res, 400, false, "Path query parameter is required");
    }

    const redirect = await Redirect.findOne({
      sourcePath: requestedPath,
      isActive: true
    });

    if (!redirect) {
      return sendResponse(res, 404, false, "Redirect not found");
    }

    redirect.hitCount += 1;
    redirect.lastHitAt = new Date();
    await redirect.save();

    return sendResponse(res, 200, true, "Redirect found", {
      sourcePath: redirect.sourcePath,
      targetPath: redirect.targetPath,
      redirectType: redirect.redirectType
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createRedirect,
  getAllRedirects,
  getRedirectById,
  updateRedirect,
  deleteRedirect,
  lookupRedirect
};
