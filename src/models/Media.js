const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: true,
      trim: true
    },
    originalName: {
      type: String,
      default: "",
      trim: true
    },
    filePath: {
      type: String,
      required: true,
      trim: true
    },
    fileUrl: {
      type: String,
      required: true,
      trim: true
    },
    mimeType: {
      type: String,
      default: "",
      trim: true
    },
    size: {
      type: Number,
      default: 0
    },
    type: {
      type: String,
      enum: ["image", "document", "video", "other"],
      default: "image"
    },
    folder: {
      type: String,
      default: "general",
      trim: true
    },
    altText: {
      type: String,
      default: "",
      trim: true
    },
    title: {
      type: String,
      default: "",
      trim: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Media", mediaSchema);
