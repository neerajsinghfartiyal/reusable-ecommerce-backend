const mongoose = require("mongoose");
const slugify = require("slugify");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    image: {
      type: String,
      default: "",
      trim: true,
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
  },
);

categorySchema.index({ parent: 1, name: 1 }, { unique: true });
categorySchema.index({ parent: 1, sortOrder: 1, name: 1 });
categorySchema.index({ status: 1, parent: 1, sortOrder: 1 });

categorySchema.pre("save", async function () {
  if (!this.name) return;

  const Category = this.constructor;
  const pathNames = [String(this.name).trim()];
  let currentParentId = this.parent || null;

  while (currentParentId) {
    const parentDoc = await Category.findById(currentParentId).select("name parent").lean();
    if (!parentDoc) break;
    pathNames.unshift(String(parentDoc.name || "").trim());
    currentParentId = parentDoc.parent || null;
  }

  this.slug = slugify(pathNames.filter(Boolean).join("-"), {
    lower: true,
    strict: true,
  });
});

module.exports = mongoose.model("Category", categorySchema);
