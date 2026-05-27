const Coupon = require("../models/Coupon");
const sendResponse = require("../utils/response");
const { logActivity } = require("../utils/activityLogger");

const createCoupon = async (req, res) => {
  try {
    const {
      code,
      discountType,
      discountValue,
      minimumOrderAmount,
      usageLimit,
      startDate,
      expiryDate,
      status
    } = req.body;

    if (!code || !discountType || discountValue === undefined) {
      return sendResponse(
        res,
        400,
        false,
        "Code, discount type, and discount value are required"
      );
    }

    if (!["percentage", "fixed"].includes(discountType)) {
      return sendResponse(
        res,
        400,
        false,
        "Discount type must be percentage or fixed"
      );
    }

    if (discountType === "percentage" && Number(discountValue) > 100) {
      return sendResponse(
        res,
        400,
        false,
        "Percentage discount cannot be more than 100"
      );
    }

    const existingCoupon = await Coupon.findOne({
      code: code.trim().toUpperCase()
    });

    if (existingCoupon) {
      return sendResponse(res, 400, false, "Coupon code already exists");
    }

    const coupon = await Coupon.create({
      code: code.trim().toUpperCase(),
      discountType,
      discountValue: Number(discountValue),
      minimumOrderAmount: Number(minimumOrderAmount) || 0,
      usageLimit: Number(usageLimit) || 0,
      startDate: startDate || Date.now(),
      expiryDate: expiryDate || null,
      status: status || "active",
      createdBy: req.admin._id
    });

    await logActivity({
      admin: req.admin._id,
      action: "COUPON_CREATED",
      module: "COUPON",
      description: `Coupon created: ${coupon.code}`,
      entityId: coupon._id.toString(),
      entityType: "Coupon",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    return sendResponse(res, 201, true, "Coupon created successfully", coupon);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getAllCoupons = async (req, res) => {
  try {
    const {
      search,
      status,
      discountType,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const query = {};

    if (search) {
      query.code = { $regex: search, $options: "i" };
    }

    if (status) {
      query.status = status;
    }

    if (discountType) {
      query.discountType = discountType;
    }

    const currentPage = Number(page) > 0 ? Number(page) : 1;
    const pageLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (currentPage - 1) * pageLimit;
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const coupons = await Coupon.find(query)
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(pageLimit);

    const totalCoupons = await Coupon.countDocuments(query);

    return sendResponse(res, 200, true, "Coupon list fetched successfully", {
      coupons,
      pagination: {
        totalCoupons,
        currentPage,
        totalPages: Math.ceil(totalCoupons / pageLimit),
        pageLimit
      }
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return sendResponse(res, 404, false, "Coupon not found");
    }

    return sendResponse(res, 200, true, "Coupon fetched successfully", coupon);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return sendResponse(res, 404, false, "Coupon not found");
    }

    const {
      code,
      discountType,
      discountValue,
      minimumOrderAmount,
      usageLimit,
      startDate,
      expiryDate,
      status
    } = req.body;

    if (code && code.trim().toUpperCase() !== coupon.code) {
      const existingCoupon = await Coupon.findOne({
        code: code.trim().toUpperCase()
      });

      if (existingCoupon) {
        return sendResponse(res, 400, false, "Coupon code already exists");
      }
    }

    const finalDiscountType = discountType || coupon.discountType;
    const finalDiscountValue =
      discountValue !== undefined ? Number(discountValue) : coupon.discountValue;

    if (!["percentage", "fixed"].includes(finalDiscountType)) {
      return sendResponse(
        res,
        400,
        false,
        "Discount type must be percentage or fixed"
      );
    }

    if (finalDiscountType === "percentage" && finalDiscountValue > 100) {
      return sendResponse(
        res,
        400,
        false,
        "Percentage discount cannot be more than 100"
      );
    }

    if (code) coupon.code = code.trim().toUpperCase();
    if (discountType) coupon.discountType = discountType;
    if (discountValue !== undefined) coupon.discountValue = Number(discountValue);
    if (minimumOrderAmount !== undefined) {
      coupon.minimumOrderAmount = Number(minimumOrderAmount) || 0;
    }
    if (usageLimit !== undefined) {
      coupon.usageLimit = Number(usageLimit) || 0;
    }
    if (startDate !== undefined) coupon.startDate = startDate;
    if (expiryDate !== undefined) coupon.expiryDate = expiryDate || null;
    if (status) coupon.status = status;

    await coupon.save();

    return sendResponse(res, 200, true, "Coupon updated successfully", coupon);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return sendResponse(res, 404, false, "Coupon not found");
    }

    await coupon.deleteOne();

    return sendResponse(res, 200, true, "Coupon deleted successfully");
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createCoupon,
  getAllCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon
};