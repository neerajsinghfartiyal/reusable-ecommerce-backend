const multer = require("multer");
const path = require("path");
const fs = require("fs");

const productUploadPath = path.join(__dirname, "../uploads/products");
const mediaUploadPath = path.join(__dirname, "../uploads/media");

if (!fs.existsSync(productUploadPath)) {
  fs.mkdirSync(productUploadPath, { recursive: true });
}

if (!fs.existsSync(mediaUploadPath)) {
  fs.mkdirSync(mediaUploadPath, { recursive: true });
}

const imageFileFilter = function (req, file, cb) {
  const allowedFileTypes = /jpeg|jpg|png|webp/;
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype;

  const isExtensionAllowed = allowedFileTypes.test(fileExtension);
  const isMimeTypeAllowed = allowedFileTypes.test(mimeType);

  if (isExtensionAllowed && isMimeTypeAllowed) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"));
  }
};

const productStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, productUploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExtension = path.extname(file.originalname);
    const cleanFileName = file.fieldname + "-" + uniqueSuffix + fileExtension;

    cb(null, cleanFileName);
  }
});

const mediaStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, mediaUploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExtension = path.extname(file.originalname);
    const cleanFileName = "media-" + uniqueSuffix + fileExtension;

    cb(null, cleanFileName);
  }
});

const uploadProductImages = multer({
  storage: productStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

const uploadMediaFile = multer({
  storage: mediaStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
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
    cb(new Error("Only CSV and XLSX import files are allowed"));
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

module.exports = {
  uploadProductImages,
  uploadMediaFile,
  uploadImportFile,
};