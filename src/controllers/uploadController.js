const sendResponse = require("../utils/response");

const uploadProductImages = async (req, res) => {
  try {
    const files = req.files;

    const featuredImage = files.featuredImage
      ? `/uploads/products/${files.featuredImage[0].filename}`
      : null;

    const galleryImages = files.galleryImages
      ? files.galleryImages.map((file) => `/uploads/products/${file.filename}`)
      : [];

    return sendResponse(res, 200, true, "Product images uploaded successfully", {
      featuredImage,
      galleryImages
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  uploadProductImages
};