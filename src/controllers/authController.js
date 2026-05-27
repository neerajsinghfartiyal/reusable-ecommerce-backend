const Admin = require("../models/Admin");
const generateToken = require("../utils/generateToken");
const sendResponse = require("../utils/response");

const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendResponse(res, 400, false, "Email and password are required");
    }

    const admin = await Admin.findOne({ email });

    if (!admin) {
      return sendResponse(res, 401, false, "Invalid credentials");
    }

    if (!admin.isActive) {
      return sendResponse(res, 403, false, "Admin account is inactive");
    }

    const isMatch = await admin.comparePassword(password);

    if (!isMatch) {
      return sendResponse(res, 401, false, "Invalid credentials");
    }

    const token = generateToken({
      id: admin._id,
      email: admin.email,
      role: admin.role
    });

    return sendResponse(res, 200, true, "Login successful", {
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getProfile = async (req, res) => {
  try {
    return sendResponse(res, 200, true, "Profile fetched successfully", {
      admin: req.admin
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  loginAdmin,
  getProfile
};