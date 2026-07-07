const Product = require("../models/Product");
const sendResponse = require("../utils/response");
const { logActivity } = require("../utils/activityLogger");
const { resolveProductMediaIdFields } = require("../utils/productMediaFields");
const {
  normalizeProductVariants,
  validateProductVariantsPayload,
  inferHasVariants,
  mapProductForAdminResponse,
} = require("../services/productVariantService");

const parseArrayField = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return [];
    }

    try {
      const parsedValue = JSON.parse(trimmedValue);
      return Array.isArray(parsedValue) ? parsedValue : [];
    } catch (error) {
      return [];
    }
  }

  return [];
};

const normalizeGalleryImages = (value) => {
  const parsedImages = parseArrayField(value);
  return parsedImages.filter((item) => typeof item === "string" && item.trim());
};

const normalizeProductAttributes = (value) => {
  const parsedAttributes = parseArrayField(value);
  if (!Array.isArray(parsedAttributes)) return [];

  return parsedAttributes
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      attribute: item?.attribute || null,
      name: item?.name ? String(item.name).trim() : "",
      code: item?.code ? String(item.code).trim().toLowerCase() : "",
      values: Array.isArray(item?.values)
        ? item.values
            .filter((entry) => entry && typeof entry === "object")
            .map((entry) => ({
              label: entry?.label ? String(entry.label).trim() : "",
              value: entry?.value ? String(entry.value).trim().toLowerCase() : "",
              colorCode: entry?.colorCode ? String(entry.colorCode).trim() : "",
              image: entry?.image ? String(entry.image).trim() : ""
            }))
            .filter((entry) => entry.label || entry.value)
        : [],
      isVariationAttribute:
        item?.isVariationAttribute !== undefined
          ? Boolean(item.isVariationAttribute)
          : true,
      isVisible: item?.isVisible !== undefined ? Boolean(item.isVisible) : true
    }))
    .filter((item) => item.attribute || item.name || item.code || item.values.length > 0);
};

const normalizeProductVariations = (value) => {
  const parsedVariations = parseArrayField(value);
  if (!Array.isArray(parsedVariations)) return [];

  return parsedVariations
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      sku: item?.sku ? String(item.sku).trim() : "",
      price: Number(item?.price || 0),
      salePrice:
        item?.salePrice !== undefined && item?.salePrice !== null && item?.salePrice !== ""
          ? Number(item.salePrice)
          : null,
      quantity: Number(item?.quantity || 0),
      image: item?.image ? String(item.image).trim() : "",
      status: item?.status ? String(item.status).trim() : "active",
      attributes: Array.isArray(item?.attributes)
        ? item.attributes
            .filter((entry) => entry && typeof entry === "object")
            .map((entry) => ({
              attribute: entry?.attribute || null,
              name: entry?.name ? String(entry.name).trim() : "",
              code: entry?.code ? String(entry.code).trim().toLowerCase() : "",
              value: entry?.value ? String(entry.value).trim().toLowerCase() : "",
              label: entry?.label ? String(entry.label).trim() : "",
              colorCode: entry?.colorCode ? String(entry.colorCode).trim() : "",
              image: entry?.image ? String(entry.image).trim() : ""
            }))
            .filter(
              (entry) =>
                entry.attribute || entry.name || entry.code || entry.value || entry.label
            )
        : []
    }))
    .filter((item) => item.sku || item.attributes.length > 0);
};

const createProduct = async (req, res) => {
  try {
    const {
      name,
      sku,
      price,
      salePrice,
      quantity,
      category,
      brand,
      unitType,
      attributes,
      variations,
      variants,
      hasVariants,
      shortDescription,
      description,
      featuredImage,
      galleryImages,
      status
    } = req.body;

    if (!name || !sku || price === undefined || !category) {
      return sendResponse(
        res,
        400,
        false,
        "Name, SKU, price, and category are required"
      );
    }

    const existingSku = await Product.findOne({ sku: sku.trim() });

    if (existingSku) {
      return sendResponse(res, 400, false, "Product with this SKU already exists");
    }

    const mediaIdFields = await resolveProductMediaIdFields(req.body, null);

    if (mediaIdFields.error) {
      return sendResponse(res, 400, false, mediaIdFields.error);
    }

    const normalizedVariants =
      variants !== undefined ? normalizeProductVariants(variants) : null;
    if (normalizedVariants) {
      const variantErrors = validateProductVariantsPayload(normalizedVariants);
      if (variantErrors.length) {
        return sendResponse(res, 400, false, variantErrors.join("; "));
      }
    }

    const createPayload = {
      name: name.trim(),
      sku: sku.trim(),
      price,
      salePrice: salePrice || null,
      quantity: quantity || 0,
      category,
      brand: brand || null,
      unitType: unitType || null,
      attributes: normalizeProductAttributes(attributes),
      variations: normalizeProductVariations(variations),
      shortDescription: shortDescription || "",
      description: description || "",
      featuredImage: featuredImage || null,
      galleryImages: normalizeGalleryImages(galleryImages),
      status: status || "draft",
      createdBy: req.admin._id
    };

    if (mediaIdFields.featuredMediaId !== undefined) {
      createPayload.featuredMediaId = mediaIdFields.featuredMediaId;
    }

    if (mediaIdFields.galleryMediaIds !== undefined) {
      createPayload.galleryMediaIds = mediaIdFields.galleryMediaIds;
    }

    if (normalizedVariants) {
      createPayload.variants = normalizedVariants;
      createPayload.hasVariants = inferHasVariants(normalizedVariants, hasVariants);
    } else if (hasVariants !== undefined) {
      createPayload.hasVariants = Boolean(hasVariants);
    }

    const product = await Product.create(createPayload);

    await logActivity({
      admin: req.admin._id,
      action: "PRODUCT_CREATED",
      module: "PRODUCT",
      description: `Product created: ${product.name}`,
      entityId: product._id.toString(),
      entityType: "Product",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    return sendResponse(
      res,
      201,
      true,
      "Product created successfully",
      mapProductForAdminResponse(product),
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getAllProducts = async (req, res) => {
  try {
    const {
      search,
      category,
      brand,
      status,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const currentPage = Number(page) > 0 ? Number(page) : 1;
    const pageLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (currentPage - 1) * pageLimit;

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } }
      ];
    }

    if (category) {
      query.category = category;
    }

    if (brand) {
      query.brand = brand;
    }

    if (status) {
      query.status = status;
    }

    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortOptions = { [sortBy]: sortDirection };

    const totalProducts = await Product.countDocuments(query);

    const products = await Product.find(query)
      .populate("category", "name slug")
      .populate("brand", "name slug")
      .populate("unitType", "name slug")
      .populate("attributes.attribute", "name code type values isVariationAttribute")
      .populate("variations.attributes.attribute", "name code type")
      .sort(sortOptions)
      .skip(skip)
      .limit(pageLimit);

    const totalPages = Math.ceil(totalProducts / pageLimit);

    return sendResponse(res, 200, true, "Product list fetched successfully", {
      products: products.map((product) => mapProductForAdminResponse(product)),
      pagination: {
        totalProducts,
        currentPage,
        totalPages,
        pageLimit
      }
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("category", "name slug")
      .populate("brand", "name slug")
      .populate("unitType", "name slug")
      .populate("attributes.attribute", "name code type values isVariationAttribute")
      .populate("variations.attributes.attribute", "name code type");

    if (!product) {
      return sendResponse(res, 404, false, "Product not found");
    }

    return sendResponse(
      res,
      200,
      true,
      "Product fetched successfully",
      mapProductForAdminResponse(product),
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return sendResponse(res, 404, false, "Product not found");
    }

    const {
      name,
      sku,
      price,
      salePrice,
      quantity,
      category,
      brand,
      unitType,
      attributes,
      variations,
      variants,
      hasVariants,
      shortDescription,
      description,
      featuredImage,
      galleryImages,
      status
    } = req.body;

    if (sku && sku.trim() !== product.sku) {
      const existingSku = await Product.findOne({ sku: sku.trim() });

      if (existingSku) {
        return sendResponse(res, 400, false, "Product with this SKU already exists");
      }
    }

    if (name) product.name = name.trim();
    if (sku) product.sku = sku.trim();
    if (price !== undefined) product.price = price;
    if (salePrice !== undefined) product.salePrice = salePrice;
    if (quantity !== undefined) product.quantity = quantity;
    if (category) product.category = category;
    if (brand !== undefined) product.brand = brand || null;
    if (unitType !== undefined) product.unitType = unitType || null;
    if (attributes !== undefined) {
      product.attributes = normalizeProductAttributes(attributes);
    }
    if (variations !== undefined) {
      product.variations = normalizeProductVariations(variations);
    }
    if (variants !== undefined) {
      const normalizedVariants = normalizeProductVariants(variants);
      const variantErrors = validateProductVariantsPayload(normalizedVariants);
      if (variantErrors.length) {
        return sendResponse(res, 400, false, variantErrors.join("; "));
      }

      product.variants = normalizedVariants;
      product.hasVariants = inferHasVariants(normalizedVariants, hasVariants);
    } else if (hasVariants !== undefined) {
      product.hasVariants = Boolean(hasVariants);
    }
    if (shortDescription !== undefined) product.shortDescription = shortDescription;
    if (description !== undefined) product.description = description;
    if (featuredImage !== undefined) product.featuredImage = featuredImage || null;
    if (galleryImages !== undefined) {
      product.galleryImages = normalizeGalleryImages(galleryImages);
    }

    const mediaIdFields = await resolveProductMediaIdFields(req.body, product);

    if (mediaIdFields.error) {
      return sendResponse(res, 400, false, mediaIdFields.error);
    }

    if (mediaIdFields.featuredMediaId !== undefined) {
      product.featuredMediaId = mediaIdFields.featuredMediaId;
    }

    if (mediaIdFields.galleryMediaIds !== undefined) {
      product.galleryMediaIds = mediaIdFields.galleryMediaIds;
    }

    if (status) product.status = status;

    await product.save();

    return sendResponse(
      res,
      200,
      true,
      "Product updated successfully",
      mapProductForAdminResponse(product),
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return sendResponse(res, 404, false, "Product not found");
    }

    await product.deleteOne();

    return sendResponse(res, 200, true, "Product deleted successfully");
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const PRODUCT_STATUS_VALUES = ["draft", "published", "inactive"];
const BULK_PRODUCT_ACTIONS = ["delete", "status"];

const bulkUpdateProducts = async (req, res) => {
  try {
    const { ids, action, status } = req.body || {};

    if (!Array.isArray(ids) || ids.length === 0) {
      return sendResponse(res, 400, false, "ids must be a non-empty array");
    }

    const uniqueIds = [
      ...new Set(
        ids.map((id) => String(id ?? "").trim()).filter((id) => id.length > 0),
      ),
    ];

    if (uniqueIds.length === 0) {
      return sendResponse(res, 400, false, "ids must be a non-empty array");
    }

    if (!BULK_PRODUCT_ACTIONS.includes(action)) {
      return sendResponse(
        res,
        400,
        false,
        'action must be "delete" or "status"',
      );
    }

    if (action === "delete") {
      const failedIds = [];
      let deletedCount = 0;

      for (const id of uniqueIds) {
        try {
          const product = await Product.findById(id);
          if (!product) {
            failedIds.push(id);
            continue;
          }

          await product.deleteOne();
          deletedCount += 1;
        } catch (_) {
          failedIds.push(id);
        }
      }

      const message =
        failedIds.length > 0
          ? `Deleted ${deletedCount} product(s). ${failedIds.length} could not be deleted.`
          : `Deleted ${deletedCount} product(s) successfully.`;

      return sendResponse(res, 200, failedIds.length === 0, message, {
        updatedCount: 0,
        deletedCount,
        failedIds,
      });
    }

    if (!status || !PRODUCT_STATUS_VALUES.includes(status)) {
      return sendResponse(
        res,
        400,
        false,
        "status must be draft, published, or inactive when action is status",
      );
    }

    const failedIds = [];
    let updatedCount = 0;

    for (const id of uniqueIds) {
      try {
        const result = await Product.updateOne({ _id: id }, { $set: { status } });

        if (result.matchedCount === 0) {
          failedIds.push(id);
          continue;
        }

        updatedCount += 1;
      } catch (_) {
        failedIds.push(id);
      }
    }

    const message =
      failedIds.length > 0
        ? `Updated ${updatedCount} product(s). ${failedIds.length} could not be updated.`
        : `Updated ${updatedCount} product(s) successfully.`;

    return sendResponse(res, 200, failedIds.length === 0, message, {
      updatedCount,
      deletedCount: 0,
      failedIds,
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  bulkUpdateProducts,
};