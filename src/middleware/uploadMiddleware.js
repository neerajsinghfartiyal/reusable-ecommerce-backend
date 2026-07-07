const multer = require("multer");
const path = require("path");
const fs = require("fs");

const productUploadPath = path.join(__dirname, "../uploads/products");
const mediaUploadPath = path.join(__dirname, "../uploads/media");

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".svg",
]);

const ALLOWED_IMAGE_MIME_PREFIXES = ["image/jpeg", "image/png", "image/webp", "image/svg"];

const MEDIA_MAX_FILE_SIZE = 10 * 1024 * 1024;
const PRODUCT_MAX_FILE_SIZE = 5 * 1024 * 1024;

const ensureDirectory = (targetPath) => {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
};

ensureDirectory(productUploadPath);
ensureDirectory(mediaUploadPath);

const isAllowedImageFile = (file = {}) => {
  const extension = path.extname(file.originalname || "").toLowerCase();
  const mimeType = String(file.mimetype || "").toLowerCase();

  const extensionAllowed = ALLOWED_IMAGE_EXTENSIONS.has(extension);
  const mimeAllowed =
    ALLOWED_IMAGE_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix)) ||
    mimeType === "image/jpg" ||
    mimeType === "image/pjpeg" ||
    mimeType === "image/x-png";

  if (extensionAllowed && (mimeAllowed || !mimeType || mimeType === "application/octet-stream")) {
    return true;
  }

  if (!extension && mimeAllowed) {
    return true;
  }

  return extensionAllowed && mimeAllowed;
};

const imageFileFilter = function (req, file, cb) {
  if (isAllowedImageFile(file)) {
    cb(null, true);
    return;
  }

  const error = new Error("Unsupported file type. Allowed formats: JPEG, PNG, WebP, SVG.");
  error.code = "UNSUPPORTED_FILE_TYPE";
  cb(error);
};

const productStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      ensureDirectory(productUploadPath);
      cb(null, productUploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExtension = path.extname(file.originalname);
    const cleanFileName = file.fieldname + "-" + uniqueSuffix + fileExtension;

    cb(null, cleanFileName);
  },
});

const mediaStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      ensureDirectory(mediaUploadPath);
      cb(null, mediaUploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExtension = path.extname(file.originalname);
    const cleanFileName = "media-" + uniqueSuffix + fileExtension;

    cb(null, cleanFileName);
  },
});

const uploadProductImages = multer({
  storage: productStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: PRODUCT_MAX_FILE_SIZE,
  },
});

const uploadMediaFile = multer({
  storage: mediaStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: MEDIA_MAX_FILE_SIZE,
  },
});

const importFileFilter = function (req, file, cb) {
  const extension = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = [".csv", ".xlsx", ".xlsm", ".xls"];
  const allowedMimeTypes = [
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];

  const isExtensionAllowed = allowedExtensions.includes(extension);
  const isMimeAllowed =
    !file.mimetype || allowedMimeTypes.includes(file.mimetype) || isExtensionAllowed;

  if (isExtensionAllowed && isMimeAllowed) {
    cb(null, true);
  } else {
    const error = new Error("Only CSV and XLSX import files are allowed");
    error.code = "UNSUPPORTED_FILE_TYPE";
    cb(error);
  }
};

const uploadImportFile = multer({
  storage: multer.memoryStorage(),
  fileFilter: importFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

const formatBytes = (bytes) => {
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)}MB`;
};

const handleUploadError = (error, req, res, next) => {
  if (!error) {
    return next();
  }

  console.error("Upload error:", {
    code: error.code,
    message: error.message,
    field: error.field,
    path: req.originalUrl,
    adminId: req.admin?._id?.toString?.() || "",
  });

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      const maxSize =
        req.originalUrl && req.originalUrl.includes("/media/")
          ? MEDIA_MAX_FILE_SIZE
          : PRODUCT_MAX_FILE_SIZE;
      return res.status(413).json({
        success: false,
        message: `File is too large. Maximum upload size is ${formatBytes(maxSize)}.`,
        data: null,
      });
    }

    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: 'Invalid upload field. Use the "file" field for media uploads.',
        data: null,
      });
    }

    return res.status(400).json({
      success: false,
      message: "Upload failed. Please check the file and try again.",
      data: null,
    });
  }

  if (error.code === "UNSUPPORTED_FILE_TYPE") {
    return res.status(415).json({
      success: false,
      message: error.message,
      data: null,
    });
  }

  if (error.code === "EACCES" || error.code === "EPERM") {
    return res.status(500).json({
      success: false,
      message: "Upload folder is not writable. Check server permissions.",
      data: null,
    });
  }

  if (error.code === "ENOENT") {
    return res.status(500).json({
      success: false,
      message: "Upload folder is missing and could not be created.",
      data: null,
    });
  }

  if (error.message && error.message.toLowerCase().includes("only image")) {
    return res.status(415).json({
      success: false,
      message: "Unsupported file type. Allowed formats: JPEG, PNG, WebP, SVG.",
      data: null,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Upload failed. Please check file type, size, or backend upload configuration.",
    data: null,
  });
};

const runMediaUpload = (req, res, next) => {
  uploadMediaFile.single("file")(req, res, (error) => {
    if (error) {
      return handleUploadError(error, req, res, next);
    }
    return next();
  });
};

const runProductUpload = (req, res, next) => {
  uploadProductImages.fields([
    { name: "featuredImage", maxCount: 1 },
    { name: "galleryImages", maxCount: 5 },
  ])(req, res, (error) => {
    if (error) {
      return handleUploadError(error, req, res, next);
    }
    return next();
  });
};

module.exports = {
  uploadProductImages,
  uploadMediaFile,
  uploadImportFile,
  handleUploadError,
  runMediaUpload,
  runProductUpload,
  MEDIA_MAX_FILE_SIZE,
  PRODUCT_MAX_FILE_SIZE,
};
