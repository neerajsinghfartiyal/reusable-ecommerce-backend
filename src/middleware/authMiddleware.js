const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const sendResponse = require("../utils/response");

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendResponse(res, 401, false, "Not authorized, token missing");
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await Admin.findById(decoded.id).select("-password");

    if (!admin) {
      return sendResponse(res, 401, false, "Admin not found");
    }

    req.admin = admin;
    next();
  } catch (error) {
    return sendResponse(res, 401, false, "Not authorized, invalid token");
  }
};

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.admin) {
      return sendResponse(res, 401, false, "Not authorized");
    }

    if (!allowedRoles.includes(req.admin.role)) {
      return sendResponse(
        res,
        403,
        false,
        "Access denied. You do not have permission to perform this action"
      );
    }

    next();
  };
};

module.exports = {
  protect,
  authorizeRoles
};