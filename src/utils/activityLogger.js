const ActivityLog = require("../models/ActivityLog");

const logActivity = async ({
  admin,
  action,
  module,
  description = "",
  entityId = "",
  entityType = "",
  metadata = {},
  ipAddress = "",
  userAgent = ""
}) => {
  try {
    await ActivityLog.create({
      admin,
      action,
      module,
      description,
      entityId,
      entityType,
      metadata,
      ipAddress,
      userAgent
    });
  } catch (error) {
    console.error("Activity logging failed:", error.message);
  }
};

module.exports = {
  logActivity
};
