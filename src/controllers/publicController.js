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

const getPublicSettings = async (req, res) => {
  try {
    const settings = await StoreSetting.findOne();

    if (!settings) {
      return sendResponse(res, 200, true, "Public settings fetched successfully", {
        storeName: "My Store",
        storeEmail: "",
        storePhone: "",
        currency: "USD",
        logo: "",
        taxPercentage: 0,
        shippingCharge: 0,
        maintenanceMode: false
      });
    }

    return sendResponse(res, 200, true, "Public settings fetched successfully", {
      storeName: settings.storeName || "My Store",
      storeEmail: settings.storeEmail || "",
      storePhone: settings.storePhone || "",
      currency: settings.currency || "USD",
      logo: settings.logo || "",
      taxPercentage: settings.taxPercentage || 0,
      shippingCharge: settings.shippingCharge || 0,
      maintenanceMode: settings.maintenanceMode || false
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
  getPublicSettings
};
