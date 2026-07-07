const mongoose = require("mongoose");
const Category = require("../models/Category");

const normalizeName = (value = "") => String(value || "").trim().replace(/\s+/g, " ");

const normalizeCompareKey = (value = "") => normalizeName(value).toLowerCase();

const toIdString = (value) => {
  if (!value) return "";
  if (typeof value === "object") {
    return String(value._id || value.id || "");
  }
  return String(value);
};

const parseCategoryPathInput = (raw = "") => {
  const text = String(raw || "").trim();
  if (!text) return [];

  if (text.includes(">")) {
    return text
      .split(">")
      .map((part) => normalizeName(part))
      .filter(Boolean);
  }

  if (text.includes("/")) {
    return text
      .split("/")
      .map((part) => normalizeName(part))
      .filter(Boolean);
  }

  return [normalizeName(text)].filter(Boolean);
};

const KNOWN_ROOT_PREFIXES = ["fashion", "electronics", "footwear", "fitness"];

const parseLegacyCategoryName = (raw = "") => {
  const text = normalizeName(raw);
  if (!text) return [];

  const pathParts = parseCategoryPathInput(text);
  if (pathParts.length > 1) return pathParts;

  const lower = text.toLowerCase();

  for (const root of KNOWN_ROOT_PREFIXES) {
    if (lower.startsWith(`${root} `) && lower !== root) {
      const child = normalizeName(text.slice(root.length));
      if (child) {
        return [normalizeName(text.slice(0, root.length)), child];
      }
    }
  }

  if (lower.endsWith(" accessories") && lower !== "accessories") {
    const splitAt = lower.lastIndexOf(" accessories");
    const root = normalizeName(text.slice(0, splitAt));
    if (root) return [root, "Accessories"];
  }

  return [text];
};

const isLegacyFlatCategoryRecord = (category = {}) => {
  const parentId = toIdString(category.parent);
  if (parentId) return false;
  return parseLegacyCategoryName(category.name).length > 1;
};

const getCategoryRole = (category = {}, byId = new Map()) => {
  if (isLegacyFlatCategoryRecord(category)) return "legacy-flat";
  const parentId = toIdString(category.parent);
  if (!parentId) return "root";
  const parent = byId.get(parentId);
  if (!parent || !toIdString(parent.parent)) return "subcategory";
  return "child";
};

const getImportCategoryParts = (normalizedRow = {}) => {
  const hierarchyParts = [
    normalizedRow.main_category,
    normalizedRow.sub_category,
    normalizedRow.child_category,
  ]
    .map((part) => normalizeName(part))
    .filter(Boolean);

  if (hierarchyParts.length > 0) {
    return hierarchyParts;
  }

  return parseCategoryPathInput(normalizedRow.category);
};

const getImportCategoryInput = (normalizedRow = {}) => {
  const parts = getImportCategoryParts(normalizedRow);
  if (parts.length > 0) {
    return parts.join(" > ");
  }
  return normalizeName(normalizedRow.category);
};

const indexCategories = (categories = []) => {
  const byId = new Map();
  const byParentAndName = new Map();

  categories.forEach((category) => {
    const id = toIdString(category);
    byId.set(id, category);

    const parentId = toIdString(category.parent) || "root";
    const nameKey = normalizeCompareKey(category.name);
    byParentAndName.set(`${parentId}::${nameKey}`, category);
  });

  return { byId, byParentAndName };
};

const findChildByName = (parentId, name, byParentAndName) => {
  const parentKey = parentId ? toIdString(parentId) : "root";
  return byParentAndName.get(`${parentKey}::${normalizeCompareKey(name)}`) || null;
};

const wouldCreateParentCycle = async (categoryId, parentId) => {
  if (!categoryId || !parentId) return false;
  if (toIdString(categoryId) === toIdString(parentId)) return true;

  let currentParentId = parentId;
  const visited = new Set([toIdString(categoryId)]);

  while (currentParentId) {
    const key = toIdString(currentParentId);
    if (visited.has(key)) return true;
    visited.add(key);

    const parentDoc = await Category.findById(currentParentId).select("parent").lean();
    if (!parentDoc) break;
    currentParentId = parentDoc.parent || null;
  }

  return false;
};

const getCategoryPath = async (categoryId, { includeSelf = true } = {}) => {
  if (!categoryId) return [];

  const path = [];
  let current = await Category.findById(categoryId).select("name parent slug _id").lean();

  while (current) {
    if (includeSelf || path.length > 0) {
      path.unshift({
        id: String(current._id),
        name: current.name,
        slug: current.slug,
        parent: current.parent ? String(current.parent) : null,
      });
    }
    if (!current.parent) break;
    current = await Category.findById(current.parent).select("name parent slug _id").lean();
  }

  return path;
};

const getCategoryPathLabel = async (categoryId) => {
  const path = await getCategoryPath(categoryId);
  return path.map((item) => item.name).join(" > ");
};

const getCategoryDescendantIds = async (categoryId) => {
  const rootId = toIdString(categoryId);
  if (!rootId) return [];

  const categories = await Category.find({ status: "active" })
    .select("_id parent name")
    .lean();

  const categoryById = new Map(
    categories.map((category) => [String(category._id), category]),
  );
  const selected = categoryById.get(rootId);

  const childrenByParent = new Map();

  categories.forEach((category) => {
    const parentKey = toIdString(category.parent) || "root";
    if (!childrenByParent.has(parentKey)) {
      childrenByParent.set(parentKey, []);
    }
    childrenByParent.get(parentKey).push(String(category._id));
  });

  const result = new Set([rootId]);
  const queue = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const children = childrenByParent.get(currentId) || [];
    children.forEach((childId) => {
      if (!result.has(childId)) {
        result.add(childId);
        queue.push(childId);
      }
    });
  }

  if (selected) {
    const selectedName = normalizeName(selected.name).toLowerCase();

    categories.forEach((category) => {
      if (toIdString(category.parent)) return;
      if (!isLegacyFlatCategoryRecord(category)) return;

      const parts = parseLegacyCategoryName(category.name);
      if (parts.length < 2) return;

      if (normalizeName(parts[0]).toLowerCase() === selectedName) {
        result.add(String(category._id));
      }
    });
  }

  return Array.from(result);
};

const buildCategoryTree = (categories = [], { parentId = null } = {}) => {
  const parentKey = parentId ? toIdString(parentId) : "root";

  return categories
    .filter((category) => {
      const categoryParent = toIdString(category.parent) || "root";
      return categoryParent === parentKey;
    })
    .sort((left, right) => {
      const sortDiff = Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
      if (sortDiff !== 0) return sortDiff;
      return String(left.name || "").localeCompare(String(right.name || ""));
    })
    .map((category) => {
      const id = toIdString(category);
      return {
        ...category,
        id,
        parentId: toIdString(category.parent) || null,
        children: buildCategoryTree(categories, { parentId: id }),
      };
    });
};

const formatCategoryForPublic = (category = {}, { byId } = {}) => {
  const id = toIdString(category);
  const parentId = toIdString(category.parent) || null;
  const path = [];
  let current = category;

  while (current) {
    path.unshift({
      id: toIdString(current),
      name: current.name,
      slug: current.slug,
    });
    const currentParentId = toIdString(current.parent);
    current = currentParentId && byId ? byId.get(currentParentId) : null;
  }

  return {
    id,
    _id: id,
    name: category.name,
    slug: category.slug,
    description: category.description || "",
    image: category.image || "",
    status: category.status || "active",
    sortOrder: Number(category.sortOrder || 0),
    parent: parentId,
    parentId,
    path: path.map((item) => item.name).join(" > "),
    ancestors: path.slice(0, -1),
  };
};

const findCategoryByPathParts = async (parts = [], { activeOnly = false } = {}) => {
  const names = parts.map((part) => normalizeName(part)).filter(Boolean);
  if (!names.length) return null;

  const query = activeOnly ? { status: "active" } : {};
  const categories = await Category.find(query).select("name parent slug status").lean();
  const { byParentAndName } = indexCategories(categories);

  let parentId = null;
  let current = null;

  for (const name of names) {
    current = findChildByName(parentId, name, byParentAndName);
    if (!current) return null;
    parentId = String(current._id);
  }

  return current;
};

const findOrCreateCategoryPath = async (parts = [], adminId = null, { activeOnly = false } = {}) => {
  const names = parts.map((part) => normalizeName(part)).filter(Boolean);
  if (!names.length) return null;

  let parentId = null;
  let current = null;

  for (const name of names) {
    const query = {
      name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      parent: parentId || null,
    };

    let categoryDoc = await Category.findOne(query);
    if (!categoryDoc) {
      categoryDoc = await Category.create({
        name,
        parent: parentId || null,
        status: "active",
        createdBy: adminId || undefined,
      });
    } else if (activeOnly && categoryDoc.status !== "active") {
      categoryDoc.status = "active";
      await categoryDoc.save();
    }

    current = categoryDoc;
    parentId = categoryDoc._id;
  }

  return current;
};

const findCategoryInCatalog = (catalogCategories = [], rawValue = "") => {
  const parts = parseCategoryPathInput(rawValue);
  if (!parts.length) return null;

  const { byParentAndName } = indexCategories(catalogCategories);
  let parentId = null;
  let current = null;

  for (const name of parts) {
    current = findChildByName(parentId, name, byParentAndName);
    if (!current) return null;
    parentId = String(current._id);
  }

  return current ? { item: current, matchType: "path" } : null;
};

const attachCategoryMeta = async (categories = []) => {
  const plain = categories.map((category) =>
    category.toObject ? category.toObject() : { ...category },
  );
  const { byId } = indexCategories(plain);

  return plain.map((category) => {
    const parentId = toIdString(category.parent);
    const parent = parentId ? byId.get(parentId) : null;
    const formatted = formatCategoryForPublic(category, { byId });
    return {
      ...formatted,
      parentName: parent?.name || "",
      isLegacyFlat: isLegacyFlatCategoryRecord(category),
      categoryRole: getCategoryRole(category, byId),
    };
  });
};

module.exports = {
  normalizeName,
  parseCategoryPathInput,
  parseLegacyCategoryName,
  isLegacyFlatCategoryRecord,
  getCategoryRole,
  getImportCategoryParts,
  getImportCategoryInput,
  wouldCreateParentCycle,
  getCategoryPath,
  getCategoryPathLabel,
  getCategoryDescendantIds,
  buildCategoryTree,
  formatCategoryForPublic,
  findCategoryByPathParts,
  findOrCreateCategoryPath,
  findCategoryInCatalog,
  attachCategoryMeta,
  indexCategories,
};
