const mongoose = require("mongoose");

const redirectSchema = new mongoose.Schema(
  {
    sourcePath: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    targetPath: {
      type: String,
      required: true,
      trim: true
    },
    redirectType: {
      type: Number,
      enum: [301, 302],
      default: 301
    },
    isActive: {
      type: Boolean,
      default: true
    },
    notes: {
      type: String,
      default: "",
      trim: true
    },
    hitCount: {
      type: Number,
      default: 0
    },
    lastHitAt: {
      type: Date,
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Redirect", redirectSchema);
