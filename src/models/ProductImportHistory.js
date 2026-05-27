const mongoose = require("mongoose");

const productImportHistorySchema = new mongoose.Schema(
  {
    filename: { type: String, trim: true, default: "" },
    fileFormat: { type: String, trim: true, default: "" },
    strategy: {
      type: String,
      enum: ["skip_duplicates", "update_existing", "create_only"],
      default: "skip_duplicates",
    },
    status: {
      type: String,
      enum: ["completed", "partial", "failed"],
      default: "completed",
    },
    importedCount: { type: Number, default: 0 },
    updatedCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    totalRows: { type: Number, default: 0 },
    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    summary: { type: mongoose.Schema.Types.Mixed, default: {} },
    failedRows: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model("ProductImportHistory", productImportHistorySchema);
