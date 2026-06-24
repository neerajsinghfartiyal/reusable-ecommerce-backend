const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    productName: {
      type: String,
      default: "",
      trim: true
    },
    sku: {
      type: String,
      default: "",
      trim: true
    },
    price: {
      type: Number,
      default: 0,
      min: 0
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1
    },
    featuredImage: {
      type: String,
      default: ""
    },
    total: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    _id: false
  }
);

const cartSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null
    },
    items: {
      type: [cartItemSchema],
      default: []
    },
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null
    },
    couponCode: {
      type: String,
      default: "",
      trim: true
    },
    couponDiscountType: {
      type: String,
      enum: ["percentage", "fixed", ""],
      default: ""
    },
    couponDiscountValue: {
      type: Number,
      default: 0,
      min: 0
    },
    subtotal: {
      type: Number,
      default: 0,
      min: 0
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    shippingAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    shippingMethod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShippingMethod",
      default: null
    },
    shippingMethodCode: {
      type: String,
      default: "",
      trim: true
    },
    paymentMethodRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentMethod",
      default: null
    },
    paymentMethodCode: {
      type: String,
      default: "",
      trim: true
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    totalAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    status: {
      type: String,
      enum: ["active", "converted", "abandoned"],
      default: "active"
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Cart", cartSchema);
