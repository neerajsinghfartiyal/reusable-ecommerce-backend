const mongoose = require("mongoose");

const normalizeCode = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const shippingMethodSchema = new mongoose.Schema(
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
      enum: ["free", "flat_rate", "local_pickup", "weight_based", "price_based", "custom"],
      default: "flat_rate"
    },
    displayName: {
      type: String,
      trim: true,
      default: ""
    },
    description: {
      type: String,
      default: ""
    },
    instructions: {
      type: String,
      default: ""
    },
    isActive: {
      type: Boolean,
      default: true
    },
    sortOrder: {
      type: Number,
      default: 0
    },
    baseRate: {
      type: Number,
      default: 0,
      min: 0
    },
    freeShippingThreshold: {
      type: Number,
      default: 0,
      min: 0
    },
    minOrderAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    maxOrderAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    allowedCountries: {
      type: [String],
      default: []
    },
    allowedStates: {
      type: [String],
      default: []
    },
    postalCodes: {
      type: [String],
      default: []
    },
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
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

shippingMethodSchema.pre("validate", function () {
  if (this.name !== undefined) {
    this.name = String(this.name || "").trim();
  }

  if (!this.code && this.name) {
    this.code = normalizeCode(this.name);
  } else if (this.code !== undefined) {
    this.code = normalizeCode(this.code);
  }

  if (!this.name) {
    this.invalidate("name", "Name is required");
  }

  if (!this.code) {
    this.invalidate("code", "Code is required");
  }
});

shippingMethodSchema.index({ isActive: 1 });
shippingMethodSchema.index({ type: 1 });

module.exports = mongoose.model("ShippingMethod", shippingMethodSchema);
