const StoreSetting = require("../models/StoreSetting");
const sendResponse = require("../utils/response");
const {
  DEMO_STORE_NAME,
  DEMO_STORE_TAGLINE
} = require("../constants/storeDefaults");const { logActivity } = require("../utils/activityLogger");
const {
  applyStoreSettingsUpdate,
  toStoreSettingsResponse
} = require("../utils/storeSettingMapper");

const getStoreSettings = async (req, res) => {
  try {
    let settings = await StoreSetting.findOne();

    if (!settings) {
      settings = await StoreSetting.create({
        storeName: DEMO_STORE_NAME,
        storeTagline: DEMO_STORE_TAGLINE
      });
    }

    return sendResponse(
      res,
      200,
      true,
      "Store settings fetched successfully",
      toStoreSettingsResponse(settings)
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updateStoreSettings = async (req, res) => {
  try {
    let settings = await StoreSetting.findOne();

    if (!settings) {
      settings = await StoreSetting.create({
        storeName: req.body?.storeName || DEMO_STORE_NAME,
        storeTagline: req.body?.storeTagline || DEMO_STORE_TAGLINE
      });
    }

    applyStoreSettingsUpdate(settings, req.body);
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

    return sendResponse(
      res,
      200,
      true,
      "Store settings updated successfully",
      toStoreSettingsResponse(settings)
    );
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  getStoreSettings,
  updateStoreSettings
};
