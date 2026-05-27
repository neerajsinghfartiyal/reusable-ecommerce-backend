const Attribute = require("../models/Attribute");
const sendResponse = require("../utils/response");
const { logActivity } = require("../utils/activityLogger");

const normalizeSlug = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const normalizeValues = (values) => {
  if (!Array.isArray(values)) return [];

  return values.map((item) => {
    const label = String(item?.label || "").trim();
    const value = normalizeSlug(item?.value || label);

    return {
      label,
      value,
      colorCode: String(item?.colorCode || ""),
      image: String(item?.image || ""),
      sortOrder: Number(item?.sortOrder || 0),
      isActive: item?.isActive !== undefined ? Boolean(item.isActive) : true
    };
  });
};

const hasDuplicateValues = (values) => {
  const seen = new Set();
  for (const item of values) {
    const key = String(item?.value || "");
    if (!key) return true;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
};

const createAttribute = async (req, res) => {
  try {
    const {
      name,
      code,
      type,
      description,
      values,
      isVariationAttribute,
      isFilterable,
      isActive,
      sortOrder
    } = req.body;

    if (!name || !String(name).trim()) {
      return sendResponse(res, 400, false, "Attribute name is required");
    }

    const normalizedCode = normalizeSlug(code || name);
    if (!normalizedCode) {
      return sendResponse(res, 400, false, "Attribute code is required");
    }

    const normalizedValues = normalizeValues(values);
    if (hasDuplicateValues(normalizedValues)) {
      return sendResponse(res, 400, false, "Duplicate attribute values are not allowed");
    }

    const existingAttribute = await Attribute.findOne({ code: normalizedCode });
    if (existingAttribute) {
      return sendResponse(res, 400, false, "Attribute code already exists");
    }

    const attribute = await Attribute.create({
      name: String(name).trim(),
      code: normalizedCode,
      type: type || "dropdown",
      description: description || "",
      values: normalizedValues,
      isVariationAttribute:
        isVariationAttribute !== undefined ? Boolean(isVariationAttribute) : true,
      isFilterable: isFilterable !== undefined ? Boolean(isFilterable) : true,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
      createdBy: req.admin._id,
      updatedBy: req.admin._id
    });

    await logActivity({
      admin: req.admin._id,
      action: "ATTRIBUTE_CREATED",
      module: "ATTRIBUTE",
      description: `Attribute created: ${attribute.name}`,
      entityId: attribute._id.toString(),
      entityType: "Attribute",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const createdAttribute = await Attribute.findById(attribute._id)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role");

    return sendResponse(res, 201, true, "Attribute created successfully", createdAttribute);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getAllAttributes = async (req, res) => {
  try {
    const {
      search,
      type,
      isActive,
      isVariationAttribute,
      isFilterable,
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
        { description: { $regex: search, $options: "i" } },
        { "values.label": { $regex: search, $options: "i" } },
        { "values.value": { $regex: search, $options: "i" } }
      ];
    }

    if (type) {
      query.type = type;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    if (isVariationAttribute !== undefined) {
      query.isVariationAttribute = isVariationAttribute === "true";
    }

    if (isFilterable !== undefined) {
      query.isFilterable = isFilterable === "true";
    }

    const currentPage = Number(page) > 0 ? Number(page) : 1;
    const pageLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (currentPage - 1) * pageLimit;
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const attributes = await Attribute.find(query)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role")
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(pageLimit);

    const totalItems = await Attribute.countDocuments(query);

    return sendResponse(res, 200, true, "Attributes fetched successfully", {
      attributes,
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

const getAttributeById = async (req, res) => {
  try {
    const attribute = await Attribute.findById(req.params.id)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role");

    if (!attribute) {
      return sendResponse(res, 404, false, "Attribute not found");
    }

    return sendResponse(res, 200, true, "Attribute fetched successfully", attribute);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateAttribute = async (req, res) => {
  try {
    const attribute = await Attribute.findById(req.params.id);
    if (!attribute) {
      return sendResponse(res, 404, false, "Attribute not found");
    }

    const {
      name,
      code,
      type,
      description,
      values,
      isVariationAttribute,
      isFilterable,
      isActive,
      sortOrder
    } = req.body;

    if (name !== undefined) {
      if (!String(name).trim()) {
        return sendResponse(res, 400, false, "Attribute name cannot be empty");
      }
      attribute.name = String(name).trim();
    }

    if (code !== undefined) {
      const normalizedCode = normalizeSlug(code);
      if (!normalizedCode) {
        return sendResponse(res, 400, false, "Attribute code cannot be empty");
      }
      if (normalizedCode !== attribute.code) {
        const existingAttribute = await Attribute.findOne({ code: normalizedCode });
        if (existingAttribute) {
          return sendResponse(res, 400, false, "Attribute code already exists");
        }
        attribute.code = normalizedCode;
      }
    }

    if (values !== undefined) {
      const normalizedValues = normalizeValues(values);
      if (hasDuplicateValues(normalizedValues)) {
        return sendResponse(res, 400, false, "Duplicate attribute values are not allowed");
      }
      attribute.values = normalizedValues;
    }

    if (type !== undefined) attribute.type = type;
    if (description !== undefined) attribute.description = description;
    if (isVariationAttribute !== undefined) {
      attribute.isVariationAttribute = Boolean(isVariationAttribute);
    }
    if (isFilterable !== undefined) attribute.isFilterable = Boolean(isFilterable);
    if (isActive !== undefined) attribute.isActive = Boolean(isActive);
    if (sortOrder !== undefined) attribute.sortOrder = Number(sortOrder);

    attribute.updatedBy = req.admin._id;
    await attribute.save();

    await logActivity({
      admin: req.admin._id,
      action: "ATTRIBUTE_UPDATED",
      module: "ATTRIBUTE",
      description: `Attribute updated: ${attribute.name}`,
      entityId: attribute._id.toString(),
      entityType: "Attribute",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const updatedAttribute = await Attribute.findById(attribute._id)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role");

    return sendResponse(res, 200, true, "Attribute updated successfully", updatedAttribute);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const deleteAttribute = async (req, res) => {
  try {
    const attribute = await Attribute.findById(req.params.id);
    if (!attribute) {
      return sendResponse(res, 404, false, "Attribute not found");
    }

    attribute.isActive = false;
    attribute.updatedBy = req.admin._id;
    await attribute.save();

    await logActivity({
      admin: req.admin._id,
      action: "ATTRIBUTE_DEACTIVATED",
      module: "ATTRIBUTE",
      description: `Attribute deactivated: ${attribute.name}`,
      entityId: attribute._id.toString(),
      entityType: "Attribute",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    return sendResponse(res, 200, true, "Attribute deactivated successfully");
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createAttribute,
  getAllAttributes,
  getAttributeById,
  updateAttribute,
  deleteAttribute
};
