const multer = require('multer');
const path = require('path');
const fs = require('fs');

const PROFILE_DIR = 'uploads/profiles';
const KYC_DIR = 'uploads/kyc';
const PROPERTY_DIR = 'uploads/properties';

[PROFILE_DIR, KYC_DIR, PROPERTY_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PROFILE_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const userId = req.user ? req.user._id : 'user';
    cb(null, `${userId}_${Date.now()}${ext}`);
  },
});

const kycStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, KYC_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const docType = file.fieldname || 'doc';
    const userId = req.user ? req.user._id : 'user';
    cb(null, `${userId}_${docType}_${Date.now()}${ext}`);
  },
});

const propertyStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PROPERTY_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const slot = (req.body && req.body.slot) ? req.body.slot.replace(/[^a-zA-Z0-9_-]/g, '') : 'slot';
    cb(null, `prop_${Date.now()}_${Math.round(Math.random() * 1e6)}_${slot}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/pdf',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/m4v',
  ];
  if (
    allowed.includes(file.mimetype.toLowerCase()) ||
    file.mimetype.startsWith('image/') ||
    file.mimetype.startsWith('video/')
  ) {
    return cb(null, true);
  }
  cb(new Error('Only standard Image and Video files are allowed'));
};

const upload = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter,
});

const uploadKyc = multer({
  storage: kycStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter,
});

const uploadPropertyMedia = multer({
  storage: propertyStorage,
  limits: { fileSize: 40 * 1024 * 1024 }, // 40 MB
  fileFilter,
});

module.exports = upload;
module.exports.uploadKyc = uploadKyc;
module.exports.uploadPropertyMedia = uploadPropertyMedia;
