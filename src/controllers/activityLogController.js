const ActivityLog = require("../models/ActivityLog");
const sendResponse = require("../utils/response");

const getAllActivityLogs = async (req, res) => {
  try {
    const {
      search,
      module,
      action,
      admin,
      entityId,
      entityType,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { action: { $regex: search, $options: "i" } },
        { module: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { entityType: { $regex: search, $options: "i" } }
      ];
    }

    if (module) {
      query.module = module;
    }

    if (action) {
      query.action = action;
    }

    if (admin) {
      query.admin = admin;
    }

    if (entityId) {
      query.entityId = String(entityId);
    }

    if (entityType) {
      query.entityType = String(entityType);
    }

    const currentPage = Number(page) > 0 ? Number(page) : 1;
    const pageLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (currentPage - 1) * pageLimit;
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const logs = await ActivityLog.find(query)
      .populate("admin", "name email role")
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(pageLimit);

    const totalLogs = await ActivityLog.countDocuments(query);

    return sendResponse(res, 200, true, "Activity logs fetched successfully", {
      logs,
      pagination: {
        totalLogs,
        currentPage,
        totalPages: Math.ceil(totalLogs / pageLimit),
        pageLimit
      }
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getActivityLogById = async (req, res) => {
  try {
    const log = await ActivityLog.findById(req.params.id).populate(
      "admin",
      "name email role"
    );

    if (!log) {
      return sendResponse(res, 404, false, "Activity log not found");
    }

    return sendResponse(res, 200, true, "Activity log fetched successfully", log);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  getAllActivityLogs,
  getActivityLogById
};
