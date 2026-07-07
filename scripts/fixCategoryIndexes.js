/**
 * Fix Category collection indexes for sibling-scoped uniqueness.
 *
 * Drops legacy global unique index on name (name_1) if present.
 * Ensures compound unique index on { parent, name }.
 *
 * Usage:
 *   node scripts/fixCategoryIndexes.js
 *   node scripts/fixCategoryIndexes.js --dry-run
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Category = require("../src/models/Category");

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");

const COMPOUND_INDEX = { parent: 1, name: 1 };
const LEGACY_GLOBAL_NAME_INDEX = "name_1";

const connectDb = async () => {
  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    "mongodb://127.0.0.1:27017/ecommerce";
  await mongoose.connect(uri);
};

const printIndexes = (indexes, title) => {
  console.log(`\n${title}`);
  if (!indexes.length) {
    console.log("(none)");
    return;
  }
  indexes.forEach((index) => {
    const unique = index.unique ? " [unique]" : "";
    console.log(`- ${index.name}: ${JSON.stringify(index.key)}${unique}`);
  });
};

const hasLegacyGlobalNameIndex = (indexes) =>
  indexes.some(
    (index) =>
      index.name === LEGACY_GLOBAL_NAME_INDEX &&
      index.unique === true &&
      index.key &&
      Object.keys(index.key).length === 1 &&
      index.key.name === 1,
  );

const hasCompoundParentNameIndex = (indexes) =>
  indexes.some(
    (index) =>
      index.unique === true &&
      index.key &&
      index.key.parent === 1 &&
      index.key.name === 1,
  );

const run = async () => {
  await connectDb();

  const collection = Category.collection;
  const before = await collection.indexes();

  console.log(`Mode: ${isDryRun ? "DRY RUN" : "APPLY"}`);
  printIndexes(before, "Current indexes:");

  const legacyPresent = hasLegacyGlobalNameIndex(before);
  const compoundPresent = hasCompoundParentNameIndex(before);

  if (legacyPresent) {
    console.log(
      `\nFound legacy global unique index "${LEGACY_GLOBAL_NAME_INDEX}" on { name: 1 }.`,
    );
    console.log(
      "This blocks the same category name under different parents (e.g. Footwear under Men and Women).",
    );
    if (isDryRun) {
      console.log(`Dry run: would drop index "${LEGACY_GLOBAL_NAME_INDEX}".`);
    } else {
      await collection.dropIndex(LEGACY_GLOBAL_NAME_INDEX);
      console.log(`Dropped index "${LEGACY_GLOBAL_NAME_INDEX}".`);
    }
  } else {
    console.log("\nLegacy global name index not found (OK).");
  }

  if (compoundPresent) {
    console.log("Compound unique index on { parent: 1, name: 1 } already exists (OK).");
  } else if (isDryRun) {
    console.log("Dry run: would create unique compound index on { parent: 1, name: 1 }.");
  } else {
    await collection.createIndex(COMPOUND_INDEX, { unique: true });
    console.log("Created unique compound index on { parent: 1, name: 1 }.");
  }

  if (!isDryRun) {
    await Category.syncIndexes();
    const after = await collection.indexes();
    printIndexes(after, "Indexes after fix:");
  }

  console.log("\nDone. No category documents or products were modified.");
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
