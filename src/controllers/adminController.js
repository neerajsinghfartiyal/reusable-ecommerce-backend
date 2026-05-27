const Admin = require("../models/Admin");
const sendResponse = require("../utils/response");
const { logActivity } = require("../utils/activityLogger");

const createAdmin = async (req, res) => {
  try {
    const { name, email, password, role, isActive } = req.body;

    if (!name || !email || !password) {
      return sendResponse(res, 400, false, "Name, email, and password are required");
    }

    const existingAdmin = await Admin.findOne({ email: email.trim().toLowerCase() });
    if (existingAdmin) {
      return sendResponse(res, 400, false, "Admin with this email already exists");
    }

    const admin = await Admin.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: role || "admin",
      isActive: isActive !== undefined ? isActive : true
    });

    await logActivity({
      admin: req.admin._id,
      action: "ADMIN_CREATED",
      module: "ADMIN",
      description: `Admin created: ${admin.email}`,
      entityId: admin._id.toString(),
      entityType: "Admin",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const createdAdmin = await Admin.findById(admin._id).select("-password");

    return sendResponse(res, 201, true, "Admin created successfully", createdAdmin);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getAllAdmins = async (req, res) => {
  try {
    const {
      search,
      role,
      isActive,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { role: { $regex: search, $options: "i" } }
      ];
    }

    if (role) {
      query.role = role;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    const currentPage = Number(page) > 0 ? Number(page) : 1;
    const pageLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (currentPage - 1) * pageLimit;
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const admins = await Admin.find(query)
      .select("-password")
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(pageLimit);

    const totalAdmins = await Admin.countDocuments(query);

    return sendResponse(res, 200, true, "Admin list fetched successfully", {
      admins,
      pagination: {
        totalAdmins,
        currentPage,
        totalPages: Math.ceil(totalAdmins / pageLimit),
        pageLimit
      }
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getAdminById = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id).select("-password");

    if (!admin) {
      return sendResponse(res, 404, false, "Admin not found");
    }

    return sendResponse(res, 200, true, "Admin fetched successfully", admin);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return sendResponse(res, 404, false, "Admin not found");
    }

    const { name, role, isActive } = req.body;

    if (name !== undefined) admin.name = name;
    if (role !== undefined) admin.role = role;
    if (isActive !== undefined) admin.isActive = isActive;

    await admin.save();

    await logActivity({
      admin: req.admin._id,
      action: "ADMIN_UPDATED",
      module: "ADMIN",
      description: `Admin updated: ${admin.email}`,
      entityId: admin._id.toString(),
      entityType: "Admin",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const updatedAdmin = await Admin.findById(admin._id).select("-password");

    return sendResponse(res, 200, true, "Admin updated successfully", updatedAdmin);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateAdminPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return sendResponse(res, 400, false, "Password is required");
    }

    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return sendResponse(res, 404, false, "Admin not found");
    }

    admin.password = password;
    await admin.save();

    await logActivity({
      admin: req.admin._id,
      action: "ADMIN_PASSWORD_UPDATED",
      module: "ADMIN",
      description: `Admin password updated: ${admin.email}`,
      entityId: admin._id.toString(),
      entityType: "Admin",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const updatedAdmin = await Admin.findById(admin._id).select("-password");

    return sendResponse(res, 200, true, "Admin password updated successfully", updatedAdmin);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const deleteAdmin = async (req, res) => {
  try {
    if (String(req.admin._id) === req.params.id) {
      return sendResponse(res, 400, false, "You cannot delete your own admin account");
    }

    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return sendResponse(res, 404, false, "Admin not found");
    }

    await admin.deleteOne();

    await logActivity({
      admin: req.admin._id,
      action: "ADMIN_DELETED",
      module: "ADMIN",
      description: `Admin deleted: ${admin.email}`,
      entityId: admin._id.toString(),
      entityType: "Admin",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    return sendResponse(res, 200, true, "Admin deleted successfully");
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createAdmin,
  getAllAdmins,
  getAdminById,
  updateAdmin,
  updateAdminPassword,
  deleteAdmin
};
