const PaymentMethod = require("../models/PaymentMethod");
const sendResponse = require("../utils/response");
const { logActivity } = require("../utils/activityLogger");

const normalizeCode = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const normalizeCountries = (countries) => {
  if (!Array.isArray(countries)) return [];
  return countries
    .map((country) => String(country || "").trim())
    .filter(Boolean);
};

const createPaymentMethod = async (req, res) => {
  try {
    const {
      name,
      code,
      type,
      provider,
      displayName,
      description,
      instructions,
      isActive,
      sortOrder,
      testMode,
      allowedCountries,
      minOrderAmount,
      maxOrderAmount,
      config
    } = req.body;

    if (!name || !String(name).trim()) {
      return sendResponse(res, 400, false, "Payment method name is required");
    }

    const normalizedCode = normalizeCode(code || name);
    if (!normalizedCode) {
      return sendResponse(res, 400, false, "Payment method code is required");
    }

    const existingPaymentMethod = await PaymentMethod.findOne({ code: normalizedCode });
    if (existingPaymentMethod) {
      return sendResponse(res, 400, false, "Payment method code already exists");
    }

    const paymentMethod = await PaymentMethod.create({
      name: String(name).trim(),
      code: normalizedCode,
      type: type || "manual",
      provider: provider || "custom",
      displayName: displayName || "",
      description: description || "",
      instructions: instructions || "",
      isActive: isActive !== undefined ? isActive : true,
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
      testMode: testMode !== undefined ? testMode : true,
      allowedCountries: normalizeCountries(allowedCountries),
      minOrderAmount: minOrderAmount !== undefined ? Number(minOrderAmount) : 0,
      maxOrderAmount: maxOrderAmount !== undefined ? Number(maxOrderAmount) : 0,
      config: config && typeof config === "object" ? config : {},
      createdBy: req.admin._id,
      updatedBy: req.admin._id
    });

    await logActivity({
      admin: req.admin._id,
      action: "PAYMENT_METHOD_CREATED",
      module: "PAYMENT",
      description: `Payment method created: ${paymentMethod.name}`,
      entityId: paymentMethod._id.toString(),
      entityType: "PaymentMethod",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const createdPaymentMethod = await PaymentMethod.findById(paymentMethod._id)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role");

    return sendResponse(
      res,
      201,
      true,
      "Payment method created successfully",
      createdPaymentMethod
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getAllPaymentMethods = async (req, res) => {
  try {
    const {
      search,
      type,
      provider,
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
        { provider: { $regex: search, $options: "i" } }
      ];
    }

    if (type) {
      query.type = type;
    }

    if (provider) {
      query.provider = provider;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    const currentPage = Number(page) > 0 ? Number(page) : 1;
    const pageLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (currentPage - 1) * pageLimit;
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const paymentMethods = await PaymentMethod.find(query)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role")
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(pageLimit);

    const totalItems = await PaymentMethod.countDocuments(query);

    return sendResponse(res, 200, true, "Payment methods fetched successfully", {
      paymentMethods,
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

const getPaymentMethodById = async (req, res) => {
  try {
    const paymentMethod = await PaymentMethod.findById(req.params.id)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role");

    if (!paymentMethod) {
      return sendResponse(res, 404, false, "Payment method not found");
    }

    return sendResponse(
      res,
      200,
      true,
      "Payment method fetched successfully",
      paymentMethod
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updatePaymentMethod = async (req, res) => {
  try {
    const paymentMethod = await PaymentMethod.findById(req.params.id);
    if (!paymentMethod) {
      return sendResponse(res, 404, false, "Payment method not found");
    }

    const {
      name,
      code,
      type,
      provider,
      displayName,
      description,
      instructions,
      isActive,
      sortOrder,
      testMode,
      allowedCountries,
      minOrderAmount,
      maxOrderAmount,
      config
    } = req.body;

    if (name !== undefined) {
      if (!String(name).trim()) {
        return sendResponse(res, 400, false, "Payment method name cannot be empty");
      }
      paymentMethod.name = String(name).trim();
    }

    if (code !== undefined) {
      const normalizedCode = normalizeCode(code);
      if (!normalizedCode) {
        return sendResponse(res, 400, false, "Payment method code cannot be empty");
      }
      if (normalizedCode !== paymentMethod.code) {
        const existingPaymentMethod = await PaymentMethod.findOne({ code: normalizedCode });
        if (existingPaymentMethod) {
          return sendResponse(res, 400, false, "Payment method code already exists");
        }
        paymentMethod.code = normalizedCode;
      }
    }

    if (type !== undefined) paymentMethod.type = type;
    if (provider !== undefined) paymentMethod.provider = provider;
    if (displayName !== undefined) paymentMethod.displayName = displayName;
    if (description !== undefined) paymentMethod.description = description;
    if (instructions !== undefined) paymentMethod.instructions = instructions;
    if (isActive !== undefined) paymentMethod.isActive = isActive;
    if (sortOrder !== undefined) paymentMethod.sortOrder = Number(sortOrder);
    if (testMode !== undefined) paymentMethod.testMode = testMode;
    if (allowedCountries !== undefined) {
      paymentMethod.allowedCountries = normalizeCountries(allowedCountries);
    }
    if (minOrderAmount !== undefined) paymentMethod.minOrderAmount = Number(minOrderAmount);
    if (maxOrderAmount !== undefined) paymentMethod.maxOrderAmount = Number(maxOrderAmount);
    if (config !== undefined && config && typeof config === "object") paymentMethod.config = config;

    paymentMethod.updatedBy = req.admin._id;
    await paymentMethod.save();

    await logActivity({
      admin: req.admin._id,
      action: "PAYMENT_METHOD_UPDATED",
      module: "PAYMENT",
      description: `Payment method updated: ${paymentMethod.name}`,
      entityId: paymentMethod._id.toString(),
      entityType: "PaymentMethod",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const updatedPaymentMethod = await PaymentMethod.findById(paymentMethod._id)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role");

    return sendResponse(
      res,
      200,
      true,
      "Payment method updated successfully",
      updatedPaymentMethod
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const deletePaymentMethod = async (req, res) => {
  try {
    const paymentMethod = await PaymentMethod.findById(req.params.id);
    if (!paymentMethod) {
      return sendResponse(res, 404, false, "Payment method not found");
    }

    paymentMethod.isActive = false;
    paymentMethod.updatedBy = req.admin._id;
    await paymentMethod.save();

    await logActivity({
      admin: req.admin._id,
      action: "PAYMENT_METHOD_DEACTIVATED",
      module: "PAYMENT",
      description: `Payment method deactivated: ${paymentMethod.name}`,
      entityId: paymentMethod._id.toString(),
      entityType: "PaymentMethod",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    return sendResponse(res, 200, true, "Payment method deactivated successfully");
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createPaymentMethod,
  getAllPaymentMethods,
  getPaymentMethodById,
  updatePaymentMethod,
  deletePaymentMethod
};
