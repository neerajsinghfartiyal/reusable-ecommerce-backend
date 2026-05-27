const ShippingMethod = require("../models/ShippingMethod");
const sendResponse = require("../utils/response");
const { logActivity } = require("../utils/activityLogger");

const normalizeCode = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const normalizeStringArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
};

const createShippingMethod = async (req, res) => {
  try {
    const {
      name,
      code,
      type,
      displayName,
      description,
      instructions,
      isActive,
      sortOrder,
      baseRate,
      freeShippingThreshold,
      minOrderAmount,
      maxOrderAmount,
      allowedCountries,
      allowedStates,
      postalCodes,
      config
    } = req.body;

    if (!name || !String(name).trim()) {
      return sendResponse(res, 400, false, "Shipping method name is required");
    }

    const normalizedCode = normalizeCode(code || name);
    if (!normalizedCode) {
      return sendResponse(res, 400, false, "Shipping method code is required");
    }

    const existingShippingMethod = await ShippingMethod.findOne({ code: normalizedCode });
    if (existingShippingMethod) {
      return sendResponse(res, 400, false, "Shipping method code already exists");
    }

    const shippingMethod = await ShippingMethod.create({
      name: String(name).trim(),
      code: normalizedCode,
      type: type || "flat_rate",
      displayName: displayName || "",
      description: description || "",
      instructions: instructions || "",
      isActive: isActive !== undefined ? isActive : true,
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
      baseRate: baseRate !== undefined ? Number(baseRate) : 0,
      freeShippingThreshold:
        freeShippingThreshold !== undefined ? Number(freeShippingThreshold) : 0,
      minOrderAmount: minOrderAmount !== undefined ? Number(minOrderAmount) : 0,
      maxOrderAmount: maxOrderAmount !== undefined ? Number(maxOrderAmount) : 0,
      allowedCountries: normalizeStringArray(allowedCountries),
      allowedStates: normalizeStringArray(allowedStates),
      postalCodes: normalizeStringArray(postalCodes),
      config: config && typeof config === "object" ? config : {},
      createdBy: req.admin._id,
      updatedBy: req.admin._id
    });

    await logActivity({
      admin: req.admin._id,
      action: "SHIPPING_METHOD_CREATED",
      module: "SHIPPING",
      description: `Shipping method created: ${shippingMethod.name}`,
      entityId: shippingMethod._id.toString(),
      entityType: "ShippingMethod",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const createdShippingMethod = await ShippingMethod.findById(shippingMethod._id)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role");

    return sendResponse(
      res,
      201,
      true,
      "Shipping method created successfully",
      createdShippingMethod
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getAllShippingMethods = async (req, res) => {
  try {
    const {
      search,
      type,
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
        { code: { $regex: search, $options: "i" } },
        { displayName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { type: { $regex: search, $options: "i" } }
      ];
    }

    if (type) {
      query.type = type;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    const currentPage = Number(page) > 0 ? Number(page) : 1;
    const pageLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (currentPage - 1) * pageLimit;
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const shippingMethods = await ShippingMethod.find(query)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role")
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(pageLimit);

    const totalItems = await ShippingMethod.countDocuments(query);

    return sendResponse(res, 200, true, "Shipping methods fetched successfully", {
      shippingMethods,
      pagination: {
        totalItems,
        currentPage,
        totalPages: Math.ceil(totalItems / pageLimit),
        pageLimit
      }
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getShippingMethodById = async (req, res) => {
  try {
    const shippingMethod = await ShippingMethod.findById(req.params.id)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role");

    if (!shippingMethod) {
      return sendResponse(res, 404, false, "Shipping method not found");
    }

    return sendResponse(
      res,
      200,
      true,
      "Shipping method fetched successfully",
      shippingMethod
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateShippingMethod = async (req, res) => {
  try {
    const shippingMethod = await ShippingMethod.findById(req.params.id);
    if (!shippingMethod) {
      return sendResponse(res, 404, false, "Shipping method not found");
    }

    const {
      name,
      code,
      type,
      displayName,
      description,
      instructions,
      isActive,
      sortOrder,
      baseRate,
      freeShippingThreshold,
      minOrderAmount,
      maxOrderAmount,
      allowedCountries,
      allowedStates,
      postalCodes,
      config
    } = req.body;

    if (name !== undefined) {
      if (!String(name).trim()) {
        return sendResponse(res, 400, false, "Shipping method name cannot be empty");
      }
      shippingMethod.name = String(name).trim();
    }

    if (code !== undefined) {
      const normalizedCode = normalizeCode(code);
      if (!normalizedCode) {
        return sendResponse(res, 400, false, "Shipping method code cannot be empty");
      }
      if (normalizedCode !== shippingMethod.code) {
        const existingShippingMethod = await ShippingMethod.findOne({ code: normalizedCode });
        if (existingShippingMethod) {
          return sendResponse(res, 400, false, "Shipping method code already exists");
        }
        shippingMethod.code = normalizedCode;
      }
    }

    if (type !== undefined) shippingMethod.type = type;
    if (displayName !== undefined) shippingMethod.displayName = displayName;
    if (description !== undefined) shippingMethod.description = description;
    if (instructions !== undefined) shippingMethod.instructions = instructions;
    if (isActive !== undefined) shippingMethod.isActive = isActive;
    if (sortOrder !== undefined) shippingMethod.sortOrder = Number(sortOrder);
    if (baseRate !== undefined) shippingMethod.baseRate = Number(baseRate);
    if (freeShippingThreshold !== undefined) {
      shippingMethod.freeShippingThreshold = Number(freeShippingThreshold);
    }
    if (minOrderAmount !== undefined) shippingMethod.minOrderAmount = Number(minOrderAmount);
    if (maxOrderAmount !== undefined) shippingMethod.maxOrderAmount = Number(maxOrderAmount);
    if (allowedCountries !== undefined) {
      shippingMethod.allowedCountries = normalizeStringArray(allowedCountries);
    }
    if (allowedStates !== undefined) {
      shippingMethod.allowedStates = normalizeStringArray(allowedStates);
    }
    if (postalCodes !== undefined) {
      shippingMethod.postalCodes = normalizeStringArray(postalCodes);
    }
    if (config !== undefined && config && typeof config === "object") shippingMethod.config = config;

    shippingMethod.updatedBy = req.admin._id;
    await shippingMethod.save();

    await logActivity({
      admin: req.admin._id,
      action: "SHIPPING_METHOD_UPDATED",
      module: "SHIPPING",
      description: `Shipping method updated: ${shippingMethod.name}`,
      entityId: shippingMethod._id.toString(),
      entityType: "ShippingMethod",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const updatedShippingMethod = await ShippingMethod.findById(shippingMethod._id)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role");

    return sendResponse(
      res,
      200,
      true,
      "Shipping method updated successfully",
      updatedShippingMethod
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const deleteShippingMethod = async (req, res) => {
  try {
    const shippingMethod = await ShippingMethod.findById(req.params.id);
    if (!shippingMethod) {
      return sendResponse(res, 404, false, "Shipping method not found");
    }

    shippingMethod.isActive = false;
    shippingMethod.updatedBy = req.admin._id;
    await shippingMethod.save();

    await logActivity({
      admin: req.admin._id,
      action: "SHIPPING_METHOD_DEACTIVATED",
      module: "SHIPPING",
      description: `Shipping method deactivated: ${shippingMethod.name}`,
      entityId: shippingMethod._id.toString(),
      entityType: "ShippingMethod",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    return sendResponse(res, 200, true, "Shipping method deactivated successfully");
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createShippingMethod,
  getAllShippingMethods,
  getShippingMethodById,
  updateShippingMethod,
  deleteShippingMethod
};
