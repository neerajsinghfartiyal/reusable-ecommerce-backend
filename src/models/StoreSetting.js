const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    street: {
      type: String,
      trim: true,
      default: ""
    },
    line2: {
      type: String,
      trim: true,
      default: ""
    },
    city: {
      type: String,
      trim: true,
      default: ""
    },
    state: {
      type: String,
      trim: true,
      default: ""
    },
    postalCode: {
      type: String,
      trim: true,
      default: ""
    },
    country: {
      type: String,
      trim: true,
      default: ""
    }
  },
  {
    _id: false
  }
);

const seoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: ""
    },
    description: {
      type: String,
      trim: true,
      default: ""
    },
    keywords: {
      type: [String],
      default: []
    }
  },
  {
    _id: false
  }
);

const socialSchema = new mongoose.Schema(
  {
    facebook: { type: String, trim: true, default: "" },
    instagram: { type: String, trim: true, default: "" },
    linkedin: { type: String, trim: true, default: "" },
    twitter: { type: String, trim: true, default: "" },
    youtube: { type: String, trim: true, default: "" }
  },
  {
    _id: false
  }
);

const storeSettingSchema = new mongoose.Schema(
  {
    storeName: {
      type: String,
      required: true,
      trim: true,
      default: "My Store"
    },
    storeTagline: {
      type: String,
      trim: true,
      default: ""
    },
    storeEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: ""
    },
    storePhone: {
      type: String,
      trim: true,
      default: ""
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "USD"
    },
    currencySymbol: {
      type: String,
      trim: true,
      default: "$"
    },
    logo: {
      type: String,
      trim: true,
      default: ""
    },
    favicon: {
      type: String,
      trim: true,
      default: ""
    },
    address: {
      type: addressSchema,
      default: () => ({})
    },
    taxEnabled: {
      type: Boolean,
      default: false
    },
    taxPercentage: {
      type: Number,
      default: 0,
      min: 0
    },
    shippingEnabled: {
      type: Boolean,
      default: false
    },
    freeShippingThreshold: {
      type: Number,
      default: 0,
      min: 0
    },
    /** @deprecated Use freeShippingThreshold. Kept for backward compatibility. */
    shippingCharge: {
      type: Number,
      default: 0,
      min: 0
    },
    seo: {
      type: seoSchema,
      default: () => ({})
    },
    social: {
      type: socialSchema,
      default: () => ({})
    },
    maintenanceMode: {
      type: Boolean,
      default: false
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

module.exports = mongoose.model("StoreSetting", storeSettingSchema);
