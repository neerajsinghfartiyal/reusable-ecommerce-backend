const mongoose = require("mongoose");

const sectionSchema = new mongoose.Schema(
  {
    sectionKey: {
      type: String,
      default: "",
      trim: true
    },
    sectionType: {
      type: String,
      default: "",
      trim: true
    },
    heading: {
      type: String,
      default: "",
      trim: true
    },
    subheading: {
      type: String,
      default: "",
      trim: true
    },
    description: {
      type: String,
      default: ""
    },
    image: {
      type: String,
      default: "",
      trim: true
    },
    buttonText: {
      type: String,
      default: "",
      trim: true
    },
    buttonLink: {
      type: String,
      default: "",
      trim: true
    },
    sortOrder: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    },
    content: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { _id: false }
);

const pageSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    pageType: {
      type: String,
      enum: ["page", "homepage", "landing", "policy", "blog", "custom"],
      default: "page"
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft"
    },
    seoTitle: {
      type: String,
      default: "",
      trim: true
    },
    seoDescription: {
      type: String,
      default: "",
      trim: true
    },
    seoKeywords: {
      type: [String],
      default: []
    },
    featuredImage: {
      type: String,
      default: "",
      trim: true
    },
    sections: {
      type: [sectionSchema],
      default: []
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

module.exports = mongoose.model("Page", pageSchema);
