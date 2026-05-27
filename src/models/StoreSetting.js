const mongoose = require("mongoose");

const storeSettingSchema = new mongoose.Schema(
  {
    storeName: {
      type: String,
      required: true,
      trim: true,
      default: "My Store"
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
    logo: {
      type: String,
      trim: true,
      default: ""
    },
    address: {
      street: {
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
    taxPercentage: {
      type: Number,
      default: 0,
      min: 0
    },
    shippingCharge: {
      type: Number,
      default: 0,
      min: 0
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