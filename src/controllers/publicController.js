const Product = require("../models/Product");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const StoreSetting = require("../models/StoreSetting");
const sendResponse = require("../utils/response");

const getPublicProducts = async (req, res) => {
  try {
    const {
      search,
      category,
      brand,
      unitType,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const query = {
      status: "published"
    };

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

    if (unitType) {
      query.unitType = unitType;
    }

    const currentPage = Number(page) > 0 ? Number(page) : 1;
    const pageLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (currentPage - 1) * pageLimit;
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const products = await Product.find(query)
      .populate("category", "name slug")
      .populate("brand", "name slug")
      .populate("unitType", "name slug")
      .populate("attributes.attribute", "name slug options")
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(pageLimit);

    const totalProducts = await Product.countDocuments(query);

    return sendResponse(res, 200, true, "Public products fetched successfully", {
      products,
      pagination: {
        totalProducts,
        currentPage,
        totalPages: Math.ceil(totalProducts / pageLimit),
        pageLimit
      }
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getPublicProductBySlug = async (req, res) => {
  try {
    const product = await Product.findOne({
      slug: req.params.slug,
      status: "published"
    })
      .populate("category", "name slug")
      .populate("brand", "name slug")
      .populate("unitType", "name slug")
      .populate("attributes.attribute", "name slug options");

    if (!product) {
      return sendResponse(res, 404, false, "Product not found");
    }

    return sendResponse(res, 200, true, "Public product fetched successfully", product);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getPublicCategories = async (req, res) => {
  try {
    const categories = await Category.find({ status: "active" })
      .select("name slug")
      .sort({ name: 1 });

    return sendResponse(res, 200, true, "Public categories fetched successfully", categories);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getPublicBrands = async (req, res) => {
  try {
    const brands = await Brand.find({ status: "active" })
      .select("name slug")
      .sort({ name: 1 });

    return sendResponse(res, 200, true, "Public brands fetched successfully", brands);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const {
  toPublicStoreSettings
} = require("../utils/storeSettingMapper");
const {
  buildLocationFromAddress,
  getStoreShippingSettings,
  listCheckoutShippingOptions,
  applyStoreFreeShippingOverride
} = require("../services/shippingMethodService");
const {
  buildLocationFromAddress: buildPaymentLocationFromAddress,
  listCheckoutPaymentOptions
} = require("../services/paymentMethodService");

const getPublicSettings = async (req, res) => {
  try {
    const settings = await StoreSetting.findOne();

    return sendResponse(
      res,
      200,
      true,
      "Public settings fetched successfully",
      toPublicStoreSettings(settings)
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getPublicShippingOptions = async (req, res) => {
  try {
    const { subtotal = 0, country, state, postalCode, itemCount = 0 } = req.query;
    const { shippingEnabled } = await getStoreShippingSettings();
    const location = buildLocationFromAddress({ country, state, postalCode });
    const parsedSubtotal = Number(subtotal) > 0 ? Number(subtotal) : 0;
    const parsedItemCount = Number(itemCount) > 0 ? Number(itemCount) : 0;

    const shippingOptions = await listCheckoutShippingOptions({
      subtotal: parsedSubtotal,
      itemCount: parsedItemCount,
      location,
      shippingEnabled
    });

    const optionsWithStoreOverride = await Promise.all(
      shippingOptions.map(async (option) => ({
        ...option,
        charge: await applyStoreFreeShippingOverride(option.charge, parsedSubtotal)
      }))
    );

    return sendResponse(res, 200, true, "Public shipping options fetched successfully", {
      shippingEnabled,
      subtotal: parsedSubtotal,
      shippingOptions: optionsWithStoreOverride
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getPublicPaymentOptions = async (req, res) => {
  try {
    const { subtotal = 0, country } = req.query;
    const parsedSubtotal = Number(subtotal) > 0 ? Number(subtotal) : 0;
    const location = buildPaymentLocationFromAddress({ country });

    const paymentOptions = await listCheckoutPaymentOptions({
      subtotal: parsedSubtotal,
      location
    });

    return sendResponse(res, 200, true, "Public payment options fetched successfully", {
      subtotal: parsedSubtotal,
      paymentOptions
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  getPublicProducts,
  getPublicProductBySlug,
  getPublicCategories,
  getPublicBrands,
  getPublicSettings,
  getPublicShippingOptions,
  getPublicPaymentOptions
};
