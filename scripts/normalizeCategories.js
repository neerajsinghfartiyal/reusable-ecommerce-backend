/**
 * Normalize legacy flat categories into a parent-child hierarchy.
 *
 * Usage:
 *   node scripts/normalizeCategories.js
 *   node scripts/normalizeCategories.js --dry-run
 *   node scripts/normalizeCategories.js --apply
 *
 * Default is dry-run. Does not delete categories automatically.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Category = require("../src/models/Category");
const Product = require("../src/models/Product");
const {
  findOrCreateCategoryPath,
  findCategoryByPathParts,
  parseLegacyCategoryName,
  isLegacyFlatCategoryRecord,
} = require("../src/services/categoryService");

const args = new Set(process.argv.slice(2));
const isDryRun = !args.has("--apply");

const connectDb = async () => {
  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    "mongodb://127.0.0.1:27017/ecommerce";
  await mongoose.connect(uri);
};

const buildPlan = async (categories) => {
  const legacyCategories = categories.filter(isLegacyFlatCategoryRecord);
  const plan = {
    toCreate: [],
    toReassign: [],
    toDeactivate: [],
    orphans: [],
  };

  for (const legacy of legacyCategories) {
    const parts = parseLegacyCategoryName(legacy.name);
    if (parts.length < 2) continue;

    const targetPath = parts.join(" > ");
    const productCount = await Product.countDocuments({ category: legacy._id });
    const existingTarget = await findCategoryByPathParts(parts);

    plan.toReassign.push({
      legacyId: String(legacy._id),
      legacyName: legacy.name,
      targetPath,
      parts,
      productCount,
      targetExists: Boolean(existingTarget),
      targetId: existingTarget?._id ? String(existingTarget._id) : null,
    });

    for (let index = 0; index < parts.length; index += 1) {
      const segmentPath = parts.slice(0, index + 1);
      const exists = await findCategoryByPathParts(segmentPath);
      if (!exists) {
        plan.toCreate.push({
          path: segmentPath.join(" > "),
          parts: segmentPath,
        });
      }
    }

    if (productCount === 0) {
      plan.toDeactivate.push({
        legacyId: String(legacy._id),
        legacyName: legacy.name,
        reason: "No products after normalization",
      });
    } else {
      plan.toDeactivate.push({
        legacyId: String(legacy._id),
        legacyName: legacy.name,
        reason: "Products reassigned to hierarchy path",
      });
    }
  }

  const uniqueCreates = new Map();
  plan.toCreate.forEach((entry) => {
    uniqueCreates.set(entry.path, entry);
  });
  plan.toCreate = Array.from(uniqueCreates.values());

  const legacyIds = new Set(legacyCategories.map((item) => String(item._id)));
  plan.orphans = categories
    .filter((category) => legacyIds.has(String(category._id)))
    .map((category) => ({
      id: String(category._id),
      name: category.name,
      note: "Legacy flat category — review manually before deleting",
    }));

  return plan;
};

const printPlan = (plan) => {
  console.log("\n=== Categories to create ===");
  if (!plan.toCreate.length) {
    console.log("(none)");
  } else {
    plan.toCreate.forEach((entry) => {
      console.log(`- ${entry.path}`);
    });
  }

  console.log("\n=== Product reassignments ===");
  if (!plan.toReassign.length) {
    console.log("(none)");
  } else {
    plan.toReassign.forEach((entry) => {
      console.log(
        `- "${entry.legacyName}" -> ${entry.targetPath} (${entry.productCount} products)`,
      );
    });
  }

  console.log("\n=== Legacy categories to mark inactive (apply mode only) ===");
  if (!plan.toDeactivate.length) {
    console.log("(none)");
  } else {
    plan.toDeactivate.forEach((entry) => {
      console.log(`- ${entry.legacyName} (${entry.legacyId}) — ${entry.reason}`);
    });
  }

  console.log("\n=== Legacy/orphan categories that may remain ===");
  if (!plan.orphans.length) {
    console.log("(none)");
  } else {
    plan.orphans.forEach((entry) => {
      console.log(`- ${entry.name} (${entry.id})`);
    });
  }
};

const applyPlan = async (plan) => {
  let reassignedProducts = 0;
  let deactivatedCategories = 0;
  let failedEntries = 0;

  for (const entry of plan.toReassign) {
    try {
      const deepest = await findOrCreateCategoryPath(entry.parts, null);
      if (!deepest) {
        failedEntries += 1;
        console.error(`Failed to resolve category path for "${entry.legacyName}"`);
        continue;
      }

      if (entry.productCount > 0) {
        const updateResult = await Product.updateMany(
          { category: entry.legacyId },
          { category: deepest._id },
        );
        const moved = Number(updateResult.modifiedCount || 0);
        reassignedProducts += moved;
        console.log(
          `Reassigned ${moved} products: "${entry.legacyName}" -> ${entry.targetPath}`,
        );
      }

      const legacy = await Category.findById(entry.legacyId);
      if (legacy && String(legacy._id) !== String(deepest._id)) {
        legacy.status = "inactive";
        await legacy.save();
        deactivatedCategories += 1;
        console.log(`Marked inactive: "${entry.legacyName}"`);
      }
    } catch (error) {
      failedEntries += 1;
      console.error(`Error processing "${entry.legacyName}":`, error.message);
    }
  }

  console.log(
    `Apply summary: ${reassignedProducts} products reassigned, ${deactivatedCategories} legacy categories deactivated, ${failedEntries} failed entries`,
  );
};

const run = async () => {
  await connectDb();

  const categories = await Category.find({}).lean();
  const legacyCount = categories.filter(isLegacyFlatCategoryRecord).length;

  console.log(`Mode: ${isDryRun ? "DRY RUN" : "APPLY"}`);
  console.log(`Total categories: ${categories.length}`);
  console.log(`Legacy flat categories detected: ${legacyCount}`);

  const plan = await buildPlan(categories);
  printPlan(plan);

  if (!isDryRun) {
    console.log("\n=== Applying changes ===");
    await applyPlan(plan);
    console.log("\nApply complete.");
  } else {
    console.log("\nDry run complete. Re-run with --apply to create hierarchy and reassign products.");
    console.log("Legacy categories are marked inactive only when products are reassigned.");
  }

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
