const dotenv = require("dotenv");
const mongoose = require("mongoose");
const Admin = require("../src/models/Admin");

dotenv.config();

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const existingAdmin = await Admin.findOne({ email: "admin@example.com" });

    if (existingAdmin) {
      console.log("Admin already exists");
      process.exit();
    }

    const admin = new Admin({
      name: "Super Admin",
      email: "admin@example.com",
      password: "admin123",
      role: "super_admin"
    });

    await admin.save();

    console.log("Admin seeded successfully");
    process.exit();
  } catch (error) {
    console.error("Seed error:", error.message);
    process.exit(1);
  }
};

seedAdmin();