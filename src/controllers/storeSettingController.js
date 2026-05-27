const StoreSetting = require("../models/StoreSetting");
const sendResponse = require("../utils/response");
const { logActivity } = require("../utils/activityLogger");

const getStoreSettings = async (req, res) => {
  try {
    let settings = await StoreSetting.findOne();

    if (!settings) {
      settings = await StoreSetting.create({
        storeName: "My Store"
      });
    }

    return sendResponse(res, 200, true, "Store settings fetched successfully", settings);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateStoreSettings = async (req, res) => {
  try {
    const {
      storeName,
      storeEmail,
      storePhone,
      currency,
      logo,
      address,
      taxPercentage,
      shippingCharge,
      maintenanceMode
    } = req.body;

    let settings = await StoreSetting.findOne();

    if (!settings) {
      settings = await StoreSetting.create({
        storeName: storeName || "My Store"
      });
    }

    if (storeName !== undefined) settings.storeName = storeName;
    if (storeEmail !== undefined) settings.storeEmail = storeEmail;
    if (storePhone !== undefined) settings.storePhone = storePhone;
    if (currency !== undefined) settings.currency = currency;
    if (logo !== undefined) settings.logo = logo;
    if (address !== undefined) settings.address = address;
    if (taxPercentage !== undefined) settings.taxPercentage = taxPercentage;
    if (shippingCharge !== undefined) settings.shippingCharge = shippingCharge;
    if (maintenanceMode !== undefined) settings.maintenanceMode = maintenanceMode;

    settings.updatedBy = req.admin._id;

    await settings.save();

    await logActivity({
      admin: req.admin._id,
      action: "STORE_SETTINGS_UPDATED",
      module: "SETTINGS",
      description: "Store settings updated",
      entityId: settings._id.toString(),
      entityType: "StoreSetting",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    return sendResponse(res, 200, true, "Store settings updated successfully", settings);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  getStoreSettings,
  updateStoreSettings
};