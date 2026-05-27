const mongoose = require("mongoose");

const normalizeSlug = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const attributeValueSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true
    },
    value: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    colorCode: {
      type: String,
      default: ""
    },
    image: {
      type: String,
      default: ""
    },
    sortOrder: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { _id: false }
);

const attributeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    code: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    type: {
      type: String,
      enum: ["text", "dropdown", "button", "color", "image"],
      default: "dropdown"
    },
    description: {
      type: String,
      default: ""
    },
    values: {
      type: [attributeValueSchema],
      default: []
    },
    isVariationAttribute: {
      type: Boolean,
      default: true
    },
    isFilterable: {
      type: Boolean,
      default: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    sortOrder: {
      type: Number,
      default: 0
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

attributeSchema.pre("validate", function () {
  if (this.name !== undefined) {
    this.name = String(this.name || "").trim();
  }
  if (!this.name) {
    this.invalidate("name", "Name is required");
  }

  if (!this.code && this.name) {
    this.code = normalizeSlug(this.name);
  } else if (this.code !== undefined) {
    this.code = normalizeSlug(this.code);
  }

  if (!this.code) {
    this.invalidate("code", "Code is required");
  }

  const normalizedValues = Array.isArray(this.values) ? this.values : [];
  const seenValues = new Set();

  normalizedValues.forEach((item, index) => {
    const label = String(item?.label || "").trim();
    const normalizedValue = normalizeSlug(item?.value || label);

    if (!label) {
      this.invalidate(`values.${index}.label`, "Value label is required");
    }
    if (!normalizedValue) {
      this.invalidate(`values.${index}.value`, "Value is required");
    }

    if (seenValues.has(normalizedValue)) {
      this.invalidate(`values.${index}.value`, "Duplicate attribute value is not allowed");
    } else {
      seenValues.add(normalizedValue);
    }

    item.label = label;
    item.value = normalizedValue;
    item.colorCode = String(item?.colorCode || "");
    item.image = String(item?.image || "");
    item.sortOrder = Number(item?.sortOrder || 0);
    item.isActive = item?.isActive !== undefined ? Boolean(item.isActive) : true;
  });

  this.values = normalizedValues;
});

attributeSchema.index({ isActive: 1 });
attributeSchema.index({ type: 1 });
attributeSchema.index({ isVariationAttribute: 1 });
attributeSchema.index({ isFilterable: 1 });

module.exports = mongoose.model("Attribute", attributeSchema);