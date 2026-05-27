const sendResponse = require("../utils/response");

const createMaster = (Model) => async (req, res) => {
  try {
    const { name, status, isActive, description, shortCode, options } = req.body;

    if (!name) {
      return sendResponse(res, 400, false, "Name is required");
    }

    const existing = await Model.findOne({ name: name.trim() });

    if (existing) {
      return sendResponse(res, 400, false, `${Model.modelName} already exists`);
    }

    const payload = {
      name: name.trim(),
      status:
        status ||
        (typeof isActive === "boolean" ? (isActive ? "active" : "inactive") : "active"),
      createdBy: req.admin._id
    };

    if (typeof description === "string") {
      payload.description = description.trim();
    }

    if (typeof shortCode === "string") {
      payload.shortCode = shortCode.trim();
    }

    if (Model.modelName === "Attribute") {
      payload.options = Array.isArray(options) ? options : [];
    }

    const item = await Model.create(payload);

    return sendResponse(res, 201, true, `${Model.modelName} created successfully`, item);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getAllMasters = (Model) => async (req, res) => {
  try {
    const items = await Model.find().sort({ createdAt: -1 });

    return sendResponse(res, 200, true, `${Model.modelName} list fetched successfully`, items);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getMasterById = (Model) => async (req, res) => {
  try {
    const item = await Model.findById(req.params.id);

    if (!item) {
      return sendResponse(res, 404, false, `${Model.modelName} not found`);
    }

    return sendResponse(res, 200, true, `${Model.modelName} fetched successfully`, item);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateMaster = (Model) => async (req, res) => {
  try {
    const { name, status, isActive, description, shortCode, options } = req.body;

    const item = await Model.findById(req.params.id);

    if (!item) {
      return sendResponse(res, 404, false, `${Model.modelName} not found`);
    }

    if (name) {
      item.name = name.trim();
    }

    if (status || typeof isActive === "boolean") {
      item.status = status || (isActive ? "active" : "inactive");
    }

    if (description !== undefined) {
      item.description = typeof description === "string" ? description.trim() : "";
    }

    if (shortCode !== undefined) {
      item.shortCode = typeof shortCode === "string" ? shortCode.trim() : "";
    }

    if (Model.modelName === "Attribute" && Array.isArray(options)) {
      item.options = options;
    }

    await item.save();

    return sendResponse(res, 200, true, `${Model.modelName} updated successfully`, item);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const deleteMaster = (Model) => async (req, res) => {
  try {
    const item = await Model.findById(req.params.id);

    if (!item) {
      return sendResponse(res, 404, false, `${Model.modelName} not found`);
    }

    await item.deleteOne();

    return sendResponse(res, 200, true, `${Model.modelName} deleted successfully`);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createMaster,
  getAllMasters,
  getMasterById,
  updateMaster,
  deleteMaster
};