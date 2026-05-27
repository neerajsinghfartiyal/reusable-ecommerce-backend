const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const brandRoutes = require("./routes/brandRoutes");
const unitTypeRoutes = require("./routes/unitTypeRoutes");
const attributeRoutes = require("./routes/attributeRoutes");
const productRoutes = require("./routes/productRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const customerRoutes = require("./routes/customerRoutes");
const orderRoutes = require("./routes/orderRoutes");
const returnRequestRoutes = require("./routes/returnRequestRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const storeSettingRoutes = require("./routes/storeSettingRoutes");
const couponRoutes = require("./routes/couponRoutes");
const activityLogRoutes = require("./routes/activityLogRoutes");
const adminRoutes = require("./routes/adminRoutes");
const publicRoutes = require("./routes/publicRoutes");
const cartRoutes = require("./routes/cartRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const pageRoutes = require("./routes/pageRoutes");
const redirectRoutes = require("./routes/redirectRoutes");
const paymentMethodRoutes = require("./routes/paymentMethodRoutes");
const shippingMethodRoutes = require("./routes/shippingMethodRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Reusable eCommerce backend API is running"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/unit-types", unitTypeRoutes);
app.use("/api/attributes", attributeRoutes);
app.use("/api/products", productRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/returns", returnRequestRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/settings", storeSettingRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/activity-logs", activityLogRoutes);
app.use("/api/admins", adminRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/pages", pageRoutes);
app.use("/api/redirects", redirectRoutes);
app.use("/api/payment-methods", paymentMethodRoutes);
app.use("/api/shipping-methods", shippingMethodRoutes);

module.exports = app;