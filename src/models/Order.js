const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    productName: {
      type: String,
      required: true,
      trim: true
    },
    sku: {
      type: String,
      required: true,
      trim: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    }
  },
  {
    _id: false
  }
);

const addressSnapshotSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      trim: true,
      default: ""
    },
    lastName: {
      type: String,
      trim: true,
      default: ""
    },
    email: {
      type: String,
      trim: true,
      default: ""
    },
    phone: {
      type: String,
      trim: true,
      default: ""
    },
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
  {
    _id: false
  }
);

const shippingMethodSnapshotSchema = new mongoose.Schema(
  {
    methodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShippingMethod",
      default: null
    },
    code: {
      type: String,
      trim: true,
      default: ""
    },
    name: {
      type: String,
      trim: true,
      default: ""
    },
    displayName: {
      type: String,
      trim: true,
      default: ""
    },
    type: {
      type: String,
      trim: true,
      default: ""
    },
    instructions: {
      type: String,
      trim: true,
      default: ""
    },
    charge: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    _id: false
  }
);

const paymentMethodSnapshotSchema = new mongoose.Schema(
  {
    methodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentMethod",
      default: null
    },
    code: {
      type: String,
      trim: true,
      default: ""
    },
    name: {
      type: String,
      trim: true,
      default: ""
    },
    displayName: {
      type: String,
      trim: true,
      default: ""
    },
    type: {
      type: String,
      trim: true,
      default: ""
    },
    provider: {
      type: String,
      trim: true,
      default: ""
    },
    instructions: {
      type: String,
      trim: true,
      default: ""
    }
  },
  {
    _id: false
  }
);

const fulfillmentSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["unfulfilled", "processing", "packed", "shipped", "delivered", "returned"],
      default: "unfulfilled"
    },
    carrier: {
      type: String,
      trim: true,
      default: ""
    },
    trackingNumber: {
      type: String,
      trim: true,
      default: ""
    },
    trackingUrl: {
      type: String,
      trim: true,
      default: ""
    },
    shippedAt: {
      type: Date,
      default: null
    },
    deliveredAt: {
      type: Date,
      default: null
    },
    notes: {
      type: String,
      trim: true,
      default: ""
    }
  },
  {
    _id: false
  }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: function (items) {
          return items.length > 0;
        },
        message: "Order must have at least one product"
      }
    },
    subtotal: {
      type: Number,
      required: true,
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
    shippingMethodSnapshot: {
      type: shippingMethodSnapshotSchema,
      default: null
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null
    },
    couponCode: {
      type: String,
      trim: true,
      default: ""
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
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    paymentStatus: {
      type: String,
      enum: [
        "pending",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
        "cod_pending"
      ],
      default: "pending"
    },
    paymentMethodRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentMethod",
      default: null
    },
    paymentMethodSnapshot: {
      type: paymentMethodSnapshotSchema,
      default: null
    },
    paymentMethod: {
      type: String,
      default: "",
      trim: true
    },
    paymentReference: {
      type: String,
      default: "",
      trim: true
    },
    paidAt: {
      type: Date,
      default: null
    },
    refundedAt: {
      type: Date,
      default: null
    },
    shippingAddressSnapshot: {
      type: addressSnapshotSchema,
      default: () => ({})
    },
    fulfillment: {
      type: fulfillmentSchema,
      default: () => ({})
    },
    orderStatus: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
      default: "pending"
    },
    orderKind: {
      type: String,
      enum: ["standard", "replacement"],
      default: "standard"
    },
    sourceOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null
    },
    returnRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReturnRequest",
      default: null
    },
    notes: {
      type: String,
      trim: true,
      default: ""
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    }
  },
  {
    timestamps: true
  }
);

orderSchema.pre("save", function () {
  if (!this.orderNumber) {
    const timestamp = Date.now();
    const randomNumber = Math.floor(1000 + Math.random() * 9000);
    this.orderNumber = `ORD-${timestamp}-${randomNumber}`;
  }
});

module.exports = mongoose.model("Order", orderSchema);