/**
 * Database-aware resolvers for product import (Import-4).
 */

const slugify = require("slugify");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const UnitType = require("../models/UnitType");
const Attribute = require("../models/Attribute");
const Product = require("../models/Product");

const toSlug = (value) =>
  slugify(String(value || "").trim(), { lower: true, strict: true });

const normalizeKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const categoryPathCandidates = (raw) => {
  const text = String(raw || "").trim();
  if (!text) return [];
  if (text.includes(">")) {
    const parts = text.split(">").map((part) => part.trim()).filter(Boolean);
    return [text, parts[parts.length - 1], parts.join(" / ")];
  }
  return [text];
};

const getCategoryCreateName = (raw) => {
  const candidates = categoryPathCandidates(raw);
  return candidates[candidates.length - 1] || String(raw || "").trim();
};

const findInCatalog = (
  catalogList,
  rawValue,
  { slugField = "slug", nameField = "name", extraKeyFields = [] } = {},
) => {
  const candidates = categoryPathCandidates(rawValue);
  const keys = new Set();
  candidates.forEach((candidate) => {
    keys.add(normalizeKey(candidate));
    keys.add(toSlug(candidate));
  });

  for (const item of catalogList) {
    const nameKey = normalizeKey(item[nameField]);
    const slugKey = toSlug(item[slugField] || item[nameField]);
    const extraMatch = extraKeyFields.some((field) => {
      const value = item?.[field];
      if (!value) return false;
      return keys.has(normalizeKey(value)) || keys.has(toSlug(value));
    });
    if (keys.has(nameKey) || keys.has(slugKey) || extraMatch) {
      return { item, matchType: keys.has(slugKey) ? "slug" : "exact" };
    }
  }

  for (const item of catalogList) {
    const nameKey = normalizeKey(item[nameField]);
    for (const key of keys) {
      if (key && nameKey === key) {
        return { item, matchType: "name_insensitive" };
      }
    }
  }

  return null;
};

const findAttributeValue = (attributeDoc, rawValue) => {
  const valueText = String(rawValue || "").trim();
  if (!attributeDoc || !valueText) return null;

  const valueKey = normalizeKey(valueText);
  const valueSlug = toSlug(valueText);

  for (const entry of attributeDoc.values || []) {
    const labelKey = normalizeKey(entry.label);
    const entryValueKey = normalizeKey(entry.value);
    const entrySlug = toSlug(entry.value || entry.label);
    if (
      labelKey === valueKey ||
      entryValueKey === valueKey ||
      entrySlug === valueSlug
    ) {
      return entry;
    }
  }

  return null;
};

const buildResolverField = (input, resolved, entityType) => {
  const text = String(input || "").trim();
  if (!text) {
    return {
      entityType,
      input: "",
      status: "empty",
      entityId: null,
      entityName: "",
      matchType: null,
    };
  }

  if (resolved?.item) {
    return {
      entityType,
      input: text,
      status: "resolved",
      entityId: resolved.item._id?.toString() || resolved.item.id || null,
      entityName: resolved.item.name || resolved.item.label || text,
      matchType: resolved.matchType,
    };
  }

  return {
    entityType,
    input: text,
    status: "unresolved",
    entityId: null,
    entityName: "",
    matchType: null,
  };
};

const loadResolverCatalogs = async () => {
  const [categories, brands, unitTypes, attributes, products] = await Promise.all([
    Category.find({}).select("name slug status").lean(),
    Brand.find({}).select("name slug status").lean(),
    UnitType.find({}).select("name slug shortCode status").lean(),
    Attribute.find({}).select("name code values status").lean(),
    Product.find({}).select("name sku variations.sku").lean(),
  ]);

  const skuIndex = new Map();
  const nameIndex = new Map();

  products.forEach((product) => {
    const rootSku = String(product.sku || "").trim();
    if (rootSku) {
      skuIndex.set(rootSku, {
        productId: product._id.toString(),
        sku: rootSku,
        name: product.name,
        isVariation: false,
      });
    }
    const productNameKey = normalizeKey(product.name);
    if (productNameKey && !nameIndex.has(productNameKey)) {
      nameIndex.set(productNameKey, {
        productId: product._id.toString(),
        sku: rootSku,
        name: product.name,
      });
    }

    (product.variations || []).forEach((variation) => {
      const variationSku = String(variation.sku || "").trim();
      if (!variationSku) return;
      skuIndex.set(variationSku, {
        productId: product._id.toString(),
        sku: variationSku,
        name: product.name,
        isVariation: true,
        parentSku: rootSku,
      });
    });
  });

  return {
    categories,
    brands,
    unitTypes,
    attributes,
    skuIndex,
    nameIndex,
    options: {
      categories: categories.map((item) => ({ id: item._id.toString(), name: item.name })),
      brands: brands.map((item) => ({ id: item._id.toString(), name: item.name })),
      unitTypes: unitTypes.map((item) => ({
        id: item._id.toString(),
        name: item.name,
        shortCode: item.shortCode || "",
      })),
      attributes: attributes.map((item) => ({
        id: item._id.toString(),
        name: item.name,
        code: item.code,
      })),
    },
  };
};

const resolveRowResolvers = (normalizedRow, catalogs) => {
  const categoryMatch = findInCatalog(catalogs.categories, normalizedRow.category);
  const brandMatch = findInCatalog(catalogs.brands, normalizedRow.brand);
  const unitTypeMatch = findInCatalog(catalogs.unitTypes, normalizedRow.unit_type, {
    nameField: "name",
    slugField: "slug",
    extraKeyFields: ["shortCode"],
  });

  const attributeResolvers = [];
  [1, 2].forEach((slot) => {
    const nameKey = `attribute_${slot}_name`;
    const valueKey = `attribute_${slot}_value`;
    const attributeName = String(normalizedRow[nameKey] ?? "").trim();
    const attributeValue = String(normalizedRow[valueKey] ?? "").trim();

    if (!attributeName && !attributeValue) {
      attributeResolvers.push({
        slot,
        name: "",
        value: "",
        status: "empty",
        attributeId: null,
        valueLabel: "",
        valueCode: "",
        matchType: null,
      });
      return;
    }

    const attributeMatch = findInCatalog(catalogs.attributes, attributeName, {
      nameField: "name",
      slugField: "code",
    });

    if (!attributeMatch?.item) {
      attributeResolvers.push({
        slot,
        name: attributeName,
        value: attributeValue,
        status: "unresolved",
        attributeId: null,
        valueLabel: "",
        valueCode: "",
        matchType: null,
      });
      return;
    }

    const valueEntry = findAttributeValue(attributeMatch.item, attributeValue);
    attributeResolvers.push({
      slot,
      name: attributeName,
      value: attributeValue,
      status: valueEntry ? "resolved" : attributeValue ? "unresolved" : "partial",
      attributeId: attributeMatch.item._id.toString(),
      attributeCode: attributeMatch.item.code,
      valueLabel: valueEntry?.label || "",
      valueCode: valueEntry?.value || "",
      matchType: valueEntry ? attributeMatch.matchType : null,
    });
  });

  const resolvers = {
    category: buildResolverField(normalizedRow.category, categoryMatch, "category"),
    brand: buildResolverField(normalizedRow.brand, brandMatch, "brand"),
    unitType: buildResolverField(normalizedRow.unit_type, unitTypeMatch, "unitType"),
    attributes: attributeResolvers,
  };

  const resolverState = getRowResolverState(
    normalizedRow,
    resolvers,
    attributeResolvers,
  );

  return { resolvers, resolverState };
};

const getRowResolverState = (normalizedRow, resolvers, attributeResolvers = []) => {
  const productType = String(normalizedRow.product_type || "").toLowerCase();

  const categoryNeeds =
    (productType === "simple" || productType === "variable") &&
    resolvers.category?.status === "unresolved" &&
    String(resolvers.category?.input || "").trim();

  const variationAttributeNeeds = attributeResolvers.some(
    (attr) =>
      String(attr.value || "").trim() &&
      attr.status === "unresolved",
  );

  const variableAttributeNameNeeds =
    productType === "variable" &&
    attributeResolvers.some(
      (attr) =>
        String(attr.name || "").trim() &&
        !String(attr.value || "").trim() &&
        attr.status === "unresolved",
    );

  if (categoryNeeds || variationAttributeNeeds || variableAttributeNameNeeds) {
    return "needs_mapping";
  }

  return "resolved";
};

const applyRowMappings = (resolvers, rowMappings = {}, normalizedRow = {}) => {
  const next = JSON.parse(JSON.stringify(resolvers));

  const applyField = (fieldKey, entityType) => {
    const mapping = rowMappings[fieldKey];
    if (!mapping || !next[fieldKey]) return;

    if (mapping.action === "use_existing" && mapping.entityId) {
      next[fieldKey] = {
        ...next[fieldKey],
        status: "mapped",
        entityId: String(mapping.entityId),
        entityName: mapping.entityName || next[fieldKey].input,
        matchType: "manual",
      };
      return;
    }

    if (mapping.action === "create" && mapping.name) {
      next[fieldKey] = {
        ...next[fieldKey],
        status: "create",
        entityId: null,
        entityName: String(mapping.name).trim(),
        matchType: "create_on_import",
      };
    }
  };

  applyField("category", "category");
  applyField("brand", "brand");
  applyField("unitType", "unitType");

  if (Array.isArray(rowMappings.attributes)) {
    rowMappings.attributes.forEach((mapping) => {
      const slot = Number(mapping.slot);
      const target = next.attributes.find((item) => item.slot === slot);
      if (!target) return;

      if (mapping.action === "use_existing" && mapping.attributeId) {
        target.status = mapping.valueCode || mapping.valueLabel ? "mapped" : "partial";
        target.attributeId = String(mapping.attributeId);
        target.valueLabel = mapping.valueLabel || target.value;
        target.valueCode = mapping.valueCode || toSlug(target.value);
        target.matchType = "manual";
      }
    });
  }

  const resolverState = getRowResolverState(normalizedRow, next, next.attributes || []);

  return {
    ...next,
    resolverState,
  };
};

const ensureEntityFromResolver = async (
  resolverField,
  Model,
  adminId,
  extra = {},
  { autoCreate = false, createName = "" } = {},
) => {
  if (!resolverField || resolverField.status === "empty") {
    return null;
  }

  if (resolverField.status === "resolved" || resolverField.status === "mapped") {
    return resolverField.entityId;
  }

  const nameForCreate =
    createName ||
    resolverField.entityName ||
    resolverField.input ||
    "";

  if (
    (
      resolverField.status === "create" ||
      (autoCreate &&
        (resolverField.status === "unresolved" || resolverField.status === "will_create"))
    ) &&
    nameForCreate
  ) {
    const existing = await Model.findOne({
      name: { $regex: new RegExp(`^${String(nameForCreate).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    });
    if (existing) {
      return existing._id.toString();
    }

    const created = await Model.create({
      name: String(nameForCreate).trim(),
      createdBy: adminId,
      status: "active",
      ...extra,
    });
    return created._id.toString();
  }

  return null;
};

const ensureAttributeWithValue = async (catalogs, attributeName, attributeValue, adminId) => {
  const name = String(attributeName || "").trim();
  const value = String(attributeValue || "").trim();
  if (!name) {
    return { attributeId: null, valueLabel: "", valueCode: "" };
  }

  let attributeDoc =
    findInCatalog(catalogs.attributes, name, { nameField: "name", slugField: "code" })?.item ||
    null;

  if (!attributeDoc) {
    const code = toSlug(name);
    attributeDoc = await Attribute.create({
      name,
      code,
      type: "dropdown",
      values: value
        ? [{ label: value, value: toSlug(value) }]
        : [],
      isVariationAttribute: true,
      createdBy: adminId,
    });
    catalogs.attributes.push(attributeDoc.toObject ? attributeDoc.toObject() : attributeDoc);
    catalogs.options.attributes.push({
      id: attributeDoc._id.toString(),
      name: attributeDoc.name,
      code: attributeDoc.code,
    });
  } else if (value) {
    const valueEntry = findAttributeValue(attributeDoc, value);
    if (!valueEntry) {
      const attributeModel = await Attribute.findById(attributeDoc._id);
      if (attributeModel) {
        attributeModel.values.push({
          label: value,
          value: toSlug(value),
        });
        await attributeModel.save();
        attributeDoc = attributeModel.toObject();
        const index = catalogs.attributes.findIndex(
          (item) => item._id.toString() === attributeModel._id.toString(),
        );
        if (index >= 0) catalogs.attributes[index] = attributeDoc;
      }
    }
  }

  const resolvedValue = value ? findAttributeValue(attributeDoc, value) : null;
  return {
    attributeId: attributeDoc._id.toString(),
    attributeCode: attributeDoc.code,
    valueLabel: resolvedValue?.label || value,
    valueCode: resolvedValue?.value || (value ? toSlug(value) : ""),
  };
};

const markResolversForAutoCreate = (resolvers, normalizedRow, autoCreateCatalog) => {
  if (!autoCreateCatalog) return resolvers;

  const next = JSON.parse(JSON.stringify(resolvers));
  const productType = String(normalizedRow.product_type || "").toLowerCase();

  if (next.category?.status === "unresolved" && next.category.input) {
    next.category = {
      ...next.category,
      status: "will_create",
      entityName: getCategoryCreateName(next.category.input),
      matchType: "auto_create",
    };
  }

  if (next.brand?.status === "unresolved" && next.brand.input) {
    next.brand = {
      ...next.brand,
      status: "will_create",
      entityName: next.brand.input,
      matchType: "auto_create",
    };
  }

  if (next.unitType?.status === "unresolved" && next.unitType.input) {
    next.unitType = {
      ...next.unitType,
      status: "will_create",
      entityName: next.unitType.input,
      matchType: "auto_create",
    };
  }

  (next.attributes || []).forEach((attr) => {
    if (attr.status !== "unresolved") return;
    if (productType === "variation" && attr.value) {
      attr.status = "will_create";
      attr.matchType = "auto_create";
      return;
    }
    if (productType === "variable" && attr.name && !attr.value) {
      attr.status = "will_create";
      attr.matchType = "auto_create";
    }
  });

  return next;
};

module.exports = {
  loadResolverCatalogs,
  resolveRowResolvers,
  applyRowMappings,
  ensureEntityFromResolver,
  ensureAttributeWithValue,
  markResolversForAutoCreate,
  getRowResolverState,
  getCategoryCreateName,
  findInCatalog,
  toSlug,
  normalizeKey,
  categoryPathCandidates,
};
