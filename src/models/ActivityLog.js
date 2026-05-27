const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    },
    action: {
      type: String,
      required: true,
      trim: true
    },
    module: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: "",
      trim: true
    },
    entityId: {
      type: String,
      default: "",
      trim: true
    },
    entityType: {
      type: String,
      default: "",
      trim: true
    },
    metadata: {
      type: Object,
      default: {}
    },
    ipAddress: {
      type: String,
      default: "",
      trim: true
    },
    userAgent: {
      type: String,
      default: "",
      trim: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("ActivityLog", activityLogSchema);
