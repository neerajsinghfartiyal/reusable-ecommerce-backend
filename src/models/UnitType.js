const mongoose = require("mongoose");
const slugify = require("slugify");

const unitTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    slug: {
      type: String,
      unique: true
    },
    shortCode: {
      type: String,
      trim: true,
      default: ""
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active"
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

unitTypeSchema.pre("save", function () {
  if (this.name) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
});

module.exports = mongoose.model("UnitType", unitTypeSchema);