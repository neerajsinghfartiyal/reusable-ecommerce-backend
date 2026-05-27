const Customer = require("../models/Customer");
const sendResponse = require("../utils/response");
const { logActivity } = require("../utils/activityLogger");

const createCustomer = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      address,
      status
    } = req.body;

    if (!firstName || !email) {
      return sendResponse(res, 400, false, "First name and email are required");
    }

    const existingCustomer = await Customer.findOne({
      email: email.trim().toLowerCase()
    });

    if (existingCustomer) {
      return sendResponse(res, 400, false, "Customer with this email already exists");
    }

    const customer = await Customer.create({
      firstName: firstName.trim(),
      lastName: lastName || "",
      email: email.trim().toLowerCase(),
      phone: phone || "",
      address: address || {},
      status: status || "active",
      createdBy: req.admin._id
    });

    await logActivity({
      admin: req.admin._id,
      action: "CUSTOMER_CREATED",
      module: "CUSTOMER",
      description: `Customer created: ${customer.firstName} ${customer.lastName}`.trim(),
      entityId: customer._id.toString(),
      entityType: "Customer",
      metadata: {
        email: customer.email,
        status: customer.status
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    return sendResponse(res, 201, true, "Customer created successfully", customer);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getAllCustomers = async (req, res) => {
  try {
    const {
      search,
      status,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } }
      ];
    }

    if (status) {
      query.status = status;
    }

    const currentPage = Number(page) > 0 ? Number(page) : 1;
    const pageLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (currentPage - 1) * pageLimit;
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const customers = await Customer.find(query)
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(pageLimit);

    const totalCustomers = await Customer.countDocuments(query);

    return sendResponse(res, 200, true, "Customer list fetched successfully", {
      customers,
      pagination: {
        totalCustomers,
        currentPage,
        totalPages: Math.ceil(totalCustomers / pageLimit),
        pageLimit
      }
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return sendResponse(res, 404, false, "Customer not found");
    }

    return sendResponse(res, 200, true, "Customer fetched successfully", customer);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return sendResponse(res, 404, false, "Customer not found");
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      address,
      status
    } = req.body;

    if (email && email.trim().toLowerCase() !== customer.email) {
      const existingCustomer = await Customer.findOne({
        email: email.trim().toLowerCase()
      });

      if (existingCustomer) {
        return sendResponse(res, 400, false, "Customer with this email already exists");
      }
    }

    if (firstName) customer.firstName = firstName.trim();
    if (lastName !== undefined) customer.lastName = lastName;
    if (email) customer.email = email.trim().toLowerCase();
    if (phone !== undefined) customer.phone = phone;
    if (address !== undefined) customer.address = address;
    if (status) customer.status = status;

    await customer.save();

    await logActivity({
      admin: req.admin._id,
      action: "CUSTOMER_UPDATED",
      module: "CUSTOMER",
      description: `Customer updated: ${customer.firstName} ${customer.lastName}`.trim(),
      entityId: customer._id.toString(),
      entityType: "Customer",
      metadata: {
        email: customer.email,
        status: customer.status
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    return sendResponse(res, 200, true, "Customer updated successfully", customer);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return sendResponse(res, 404, false, "Customer not found");
    }

    await logActivity({
      admin: req.admin._id,
      action: "CUSTOMER_DELETED",
      module: "CUSTOMER",
      description: `Customer deleted: ${customer.firstName} ${customer.lastName}`.trim(),
      entityId: customer._id.toString(),
      entityType: "Customer",
      metadata: {
        email: customer.email,
        status: customer.status
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    await customer.deleteOne();

    return sendResponse(res, 200, true, "Customer deleted successfully");
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer
};