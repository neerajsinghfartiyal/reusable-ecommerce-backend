const mongoose = require("mongoose");
const slugify = require("slugify");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      unique: true
    },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    salePrice: {
      type: Number,
      default: null,
      min: 0
    },
    quantity: {
      type: Number,
      default: 0,
      min: 0
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true
    },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand"
    },
    unitType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UnitType"
    },
    attributes: [
      {
        attribute: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Attribute"
        },
        name: {
          type: String,
          trim: true,
          default: ""
        },
        code: {
          type: String,
          trim: true,
          default: ""
        },
        values: [
          {
            label: {
              type: String,
              trim: true,
              default: ""
            },
            value: {
              type: String,
              trim: true,
              default: ""
            },
            colorCode: {
              type: String,
              trim: true,
              default: ""
            },
            image: {
              type: String,
              trim: true,
              default: ""
            }
          }
        ],
        isVariationAttribute: {
          type: Boolean,
          default: true
        },
        isVisible: {
          type: Boolean,
          default: true
        }
      }
    ],
    hasVariants: {
      type: Boolean,
      default: false
    },
    variants: [
      {
        sku: {
          type: String,
          trim: true,
          default: ""
        },
        title: {
          type: String,
          trim: true,
          default: ""
        },
        options: {
          type: Map,
          of: String,
          default: {}
        },
        price: {
          type: Number,
          default: 0,
          min: 0
        },
        compareAtPrice: {
          type: Number,
          default: null,
          min: 0
        },
        stockQuantity: {
          type: Number,
          default: 0,
          min: 0
        },
        image: {
          type: String,
          trim: true,
          default: ""
        },
        isActive: {
          type: Boolean,
          default: true
        },
        sortOrder: {
          type: Number,
          default: 0
        }
      }
    ],
    variations: [
      {
        sku: {
          type: String,
          trim: true,
          default: ""
        },
        price: {
          type: Number,
          default: 0,
          min: 0
        },
        salePrice: {
          type: Number,
          default: null,
          min: 0
        },
        quantity: {
          type: Number,
          default: 0,
          min: 0
        },
        image: {
          type: String,
          trim: true,
          default: ""
        },
        status: {
          type: String,
          enum: ["active", "inactive", "draft"],
          default: "active"
        },
        attributes: [
          {
            attribute: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Attribute"
            },
            name: {
              type: String,
              trim: true,
              default: ""
            },
            code: {
              type: String,
              trim: true,
              default: ""
            },
            value: {
              type: String,
              trim: true,
              default: ""
            },
            label: {
              type: String,
              trim: true,
              default: ""
            },
            colorCode: {
              type: String,
              trim: true,
              default: ""
            },
            image: {
              type: String,
              trim: true,
              default: ""
            }
          }
        ]
      }
    ],
    shortDescription: {
      type: String,
      trim: true
    },
    description: {
      type: String
    },
    featuredImage: {
      type: String,
      default: null
    },
    featuredMediaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Media",
      default: null
    },
    galleryImages: [
      {
        type: String
      }
    ],
    galleryMediaIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Media",
          required: false,
          default: null
        }
      ],
      default: []
    },
    status: {
      type: String,
      enum: ["draft", "published", "inactive"],
      default: "draft"
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

productSchema.pre("save", function () {
  if (this.name) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
});

module.exports = mongoose.model("Product", productSchema);