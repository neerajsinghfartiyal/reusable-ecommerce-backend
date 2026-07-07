const Product = require("../models/Product");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const Customer = require("../models/Customer");
const StoreSetting = require("../models/StoreSetting");
const sendResponse = require("../utils/response");
const {
  attachCategoryMeta,
  buildCategoryTree,
  getCategoryDescendantIds,
  getCategoryPath,
} = require("../services/categoryService");
const { mapProductForPublicResponse } = require("../services/productVariantService");

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
      const categoryIds = await getCategoryDescendantIds(category);
      query.category = { $in: categoryIds };
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
      products: products.map((product) => mapProductForPublicResponse(product)),
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

    const productObject = mapProductForPublicResponse(product);
    if (productObject.category?._id) {
      productObject.categoryPath = await getCategoryPath(productObject.category._id);
      productObject.categoryBreadcrumb = productObject.categoryPath.map((item) => item.name).join(" > ");
    } else {
      productObject.categoryPath = [];
      productObject.categoryBreadcrumb = "";
    }

    return sendResponse(res, 200, true, "Public product fetched successfully", productObject);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getPublicCategories = async (req, res) => {
  try {
    const treeMode = String(req.query.tree || "").toLowerCase() === "true";

    const categories = await Category.find({ status: "active" })
      .select("name slug description image parent sortOrder status")
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    const flat = await attachCategoryMeta(categories);

    if (treeMode) {
      const tree = buildCategoryTree(flat);
      return sendResponse(res, 200, true, "Public categories fetched successfully", {
        categories: flat,
        tree,
      });
    }

    return sendResponse(res, 200, true, "Public categories fetched successfully", flat);
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

const upsertCheckoutCustomer = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, address } = req.body;

    if (!firstName || !String(firstName).trim()) {
      return sendResponse(res, 400, false, "First name is required");
    }

    if (!email || !String(email).trim()) {
      return sendResponse(res, 400, false, "Email is required");
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const customerPayload = {
      firstName: String(firstName).trim(),
      lastName: String(lastName || "").trim(),
      phone: String(phone || "").trim(),
      address: {
        street: String(address?.street || "").trim(),
        city: String(address?.city || "").trim(),
        state: String(address?.state || "").trim(),
        postalCode: String(address?.postalCode || "").trim(),
        country: String(address?.country || "").trim()
      },
      status: "active"
    };

    let customer = await Customer.findOne({ email: normalizedEmail });

    if (customer) {
      customer.firstName = customerPayload.firstName;
      customer.lastName = customerPayload.lastName;
      customer.phone = customerPayload.phone;
      customer.address = customerPayload.address;
      customer.status = customerPayload.status;
      await customer.save();
    } else {
      customer = await Customer.create({
        ...customerPayload,
        email: normalizedEmail,
        createdBy: null
      });
    }

    return sendResponse(res, 200, true, "Checkout customer saved successfully", customer);
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
  getPublicPaymentOptions,
  upsertCheckoutCustomer
};
