const Category = require("../models/Category");
const Product = require("../models/Product");
const sendResponse = require("../utils/response");
const {
  attachCategoryMeta,
  wouldCreateParentCycle,
} = require("../services/categoryService");

const parseParentId = (value) => {
  if (value === null || value === undefined || value === "" || value === "null") {
    return null;
  }
  return value;
};

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findSiblingDuplicate = async (name, parentId, excludeId = null) => {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) return null;

  const query = {
    name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, "i") },
    parent: parentId || null,
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return Category.findOne(query);
};

const formatCategoryWriteError = (error) => {
  if (!error || error.code !== 11000) {
    return null;
  }

  const keyPattern = error.keyPattern || {};

  if (keyPattern.name && keyPattern.parent) {
    return "A category with this name already exists under the selected parent.";
  }

  if (keyPattern.name && !keyPattern.parent) {
    return "Database still has a legacy global category name index. Run: node scripts/fixCategoryIndexes.js";
  }

  if (keyPattern.slug) {
    return "A category with this path already exists.";
  }

  return "A category with this name already exists under the selected parent.";
};

const createCategory = async (req, res) => {
  try {
    const { name, status, isActive, description, image, parent, sortOrder } = req.body;

    if (!name || !String(name).trim()) {
      return sendResponse(res, 400, false, "Name is required");
    }

    const parentId = parseParentId(parent);
    const trimmedName = String(name).trim();

    const duplicate = await findSiblingDuplicate(trimmedName, parentId);

    if (duplicate) {
      return sendResponse(
        res,
        400,
        false,
        "A category with this name already exists under the selected parent.",
      );
    }

    const item = await Category.create({
      name: trimmedName,
      description: typeof description === "string" ? description.trim() : "",
      image: typeof image === "string" ? image.trim() : "",
      parent: parentId,
      sortOrder: Number(sortOrder) || 0,
      status:
        status ||
        (typeof isActive === "boolean" ? (isActive ? "active" : "inactive") : "active"),
      createdBy: req.admin._id,
    });

    const [formatted] = await attachCategoryMeta([item]);
    return sendResponse(res, 201, true, "Category created successfully", formatted);
  } catch (error) {
    const duplicateMessage = formatCategoryWriteError(error);
    if (duplicateMessage) {
      return sendResponse(res, 400, false, duplicateMessage);
    }
    return sendResponse(res, 500, false, error.message);
  }
};

const getCategories = async (req, res) => {
  try {
    const items = await Category.find()
      .populate("parent", "name slug")
      .sort({ sortOrder: 1, name: 1 });

    const productCounts = await Product.aggregate([
      { $match: { category: { $ne: null } } },
      { $group: { _id: "$category", productCount: { $sum: 1 } } },
    ]);
    const countByCategoryId = new Map(
      productCounts.map((row) => [String(row._id), Number(row.productCount) || 0]),
    );

    const formatted = (await attachCategoryMeta(items)).map((item) => ({
      ...item,
      productCount: countByCategoryId.get(String(item.id || item._id)) || 0,
    }));

    return sendResponse(res, 200, true, "Category list fetched successfully", formatted);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getCategoryById = async (req, res) => {
  try {
    const item = await Category.findById(req.params.id).populate("parent", "name slug");

    if (!item) {
      return sendResponse(res, 404, false, "Category not found");
    }

    const [formatted] = await attachCategoryMeta([item]);
    return sendResponse(res, 200, true, "Category fetched successfully", formatted);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateCategory = async (req, res) => {
  try {
    const { name, status, isActive, description, image, parent, sortOrder } = req.body;

    const item = await Category.findById(req.params.id);

    if (!item) {
      return sendResponse(res, 404, false, "Category not found");
    }

    if (parent !== undefined) {
      const parentId = parseParentId(parent);
      if (parentId && String(parentId) === String(item._id)) {
        return sendResponse(res, 400, false, "Category cannot be its own parent");
      }

      if (await wouldCreateParentCycle(item._id, parentId)) {
        return sendResponse(res, 400, false, "Invalid parent category (circular hierarchy)");
      }

      item.parent = parentId;
    }

    const nextName = name ? String(name).trim() : String(item.name || "").trim();
    const duplicate = await findSiblingDuplicate(nextName, item.parent || null, item._id);

    if (duplicate) {
      return sendResponse(
        res,
        400,
        false,
        "A category with this name already exists under the selected parent.",
      );
    }

    if (name) {
      item.name = nextName;
    }

    if (status || typeof isActive === "boolean") {
      item.status = status || (isActive ? "active" : "inactive");
    }

    if (description !== undefined) {
      item.description = typeof description === "string" ? description.trim() : "";
    }

    if (typeof image === "string") {
      item.image = image.trim();
    }

    if (sortOrder !== undefined) {
      item.sortOrder = Number(sortOrder) || 0;
    }

    await item.save();

    const populated = await Category.findById(item._id).populate("parent", "name slug");
    const [formatted] = await attachCategoryMeta([populated]);
    return sendResponse(res, 200, true, "Category updated successfully", formatted);
  } catch (error) {
    const duplicateMessage = formatCategoryWriteError(error);
    if (duplicateMessage) {
      return sendResponse(res, 400, false, duplicateMessage);
    }
    return sendResponse(res, 500, false, error.message);
  }
};

const deleteCategory = async (req, res) => {
  try {
    const item = await Category.findById(req.params.id);

    if (!item) {
      return sendResponse(res, 404, false, "Category not found");
    }

    const childCount = await Category.countDocuments({ parent: item._id });
    if (childCount > 0) {
      return sendResponse(
        res,
        400,
        false,
        "Cannot delete a category that still has child categories",
      );
    }

    await item.deleteOne();
    return sendResponse(res, 200, true, "Category deleted successfully");
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
