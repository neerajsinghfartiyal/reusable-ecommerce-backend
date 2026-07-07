const dotenv = require("dotenv");
const mongoose = require("mongoose");
const StoreSetting = require("../src/models/StoreSetting");
const {
  DEMO_STORE_NAME,
  DEMO_STORE_TAGLINE,
  DEMO_STORE_EMAIL,
  DEMO_STORE_PHONE
} = require("../src/constants/storeDefaults");

dotenv.config();

const seedStoreSettings = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const existing = await StoreSetting.findOne();

    if (existing) {
      console.log("Store settings already exist — skipping seed (existing data preserved).");
      process.exit();
    }

    await StoreSetting.create({
      storeName: DEMO_STORE_NAME,
      storeTagline: DEMO_STORE_TAGLINE,
      storeEmail: DEMO_STORE_EMAIL,
      storePhone: DEMO_STORE_PHONE,
      currency: "USD",
      currencySymbol: "$"
    });

    console.log(`Store settings seeded with demo brand: ${DEMO_STORE_NAME}`);
    process.exit();
  } catch (error) {
    console.error("Seed error:", error.message);
    process.exit(1);
  }
};

seedStoreSettings();
