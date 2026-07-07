const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    productName: {
      type: String,
      required: true,
      trim: true
    },
    variantTitle: {
      type: String,
      trim: true,
      default: ""
    },
    variantOptions: {
      type: Map,
      of: String,
      default: {}
    },
    sku: {
      type: String,
      required: true,
      trim: true
    },
    image: {
      type: String,
      trim: true,
      default: ""
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
    unitPrice: {
      type: Number,
      min: 0,
      default: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    },
    lineTotal: {
      type: Number,
      min: 0,
      default: 0
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
    courierName: {
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

const orderTimelineSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      trim: true,
      default: ""
    },
    label: {
      type: String,
      trim: true,
      default: ""
    },
    message: {
      type: String,
      trim: true,
      default: ""
    },
    note: {
      type: String,
      trim: true,
      default: ""
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },
    actorType: {
      type: String,
      enum: ["system", "admin", "customer"],
      default: "system"
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    }
  },
  {
    _id: false
  }
);

const adminNoteSchema = new mongoose.Schema(
  {
    note: {
      type: String,
      required: true,
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },
    isPrivate: {
      type: Boolean,
      default: true
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
    refundAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    refundReference: {
      type: String,
      trim: true,
      default: ""
    },
    cancelledAt: {
      type: Date,
      default: null
    },
    cancellationReason: {
      type: String,
      trim: true,
      default: ""
    },
    returnReason: {
      type: String,
      trim: true,
      default: ""
    },
    inventoryRestored: {
      type: Boolean,
      default: false
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
      enum: [
        "pending",
        "confirmed",
        "processing",
        "packed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "return_requested",
        "returned",
        "refunded"
      ],
      default: "pending"
    },
    orderTimeline: {
      type: [orderTimelineSchema],
      default: () => []
    },
    adminNotes: {
      type: [adminNoteSchema],
      default: () => []
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