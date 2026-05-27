const mongoose = require("mongoose");

const returnRequestItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    productName: {
      type: String,
      trim: true,
      default: ""
    },
    sku: {
      type: String,
      trim: true,
      default: ""
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    reason: {
      type: String,
      trim: true,
      default: ""
    },
    condition: {
      type: String,
      enum: ["unopened", "opened", "damaged", "wrong_item", "other"],
      default: "other"
    },
    restockable: {
      type: Boolean,
      default: false
    }
  },
  {
    _id: false
  }
);

const returnRequestSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null
    },
    type: {
      type: String,
      enum: ["return", "exchange"],
      required: true
    },
    reason: {
      type: String,
      required: true,
      trim: true
    },
    notes: {
      type: String,
      trim: true,
      default: ""
    },
    items: {
      type: [returnRequestItemSchema],
      required: true,
      validate: {
        validator: function (items) {
          return Array.isArray(items) && items.length > 0;
        },
        message: "Return request must include at least one item"
      }
    },
    status: {
      type: String,
      enum: [
        "requested",
        "approved",
        "rejected",
        "received",
        "refunded",
        "exchanged",
        "closed"
      ],
      default: "requested"
    },
    refundAmount: {
      type: Number,
      default: 0
    },
    replacementOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("ReturnRequest", returnRequestSchema);
