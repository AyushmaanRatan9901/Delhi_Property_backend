const express = require('express');
const { body } = require('express-validator');
const {
  registerFieldAgent,
  verifyRegistrationOTP,
  seedSuperAdmin,
  sendOTP,
  verifyOTPLogin,
  getMe,
  updateProfile,
  uploadPhoto,
  uploadKycDocument,
  updateKyc,
  updateKycStatus,
  createUser,
  listUsers,
  getUserById,
  editUser,
  toggleUserStatus,
  updateCommission,
  deleteUser,
  getUserAnalyticsAndDetail,
} = require('../controllers/authController');
const { protect, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const upload = require('../middlewares/upload');
const { uploadKyc } = require('../middlewares/upload');

const router = express.Router();

// ── Bootstrap (one-time) ──────────────────────────────────────────────────────
router.post(
  '/seed-super-admin',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit Indian mobile number required'),
    body('email').optional().isEmail().withMessage('Invalid email format'),
  ],
  validate,
  seedSuperAdmin
);

// ── Field Agent Self-Registration (public) ────────────────────────────────────
router.post(
  '/register',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit Indian mobile number required'),
    body('email').optional().isEmail().withMessage('Invalid email format'),
  ],
  validate,
  registerFieldAgent
);

// Step 2 of self-registration — verify OTP → get JWT
router.post(
  '/register/verify-otp',
  [
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit mobile number required'),
    body('otp').isLength({ min: 6, max: 6 }).isNumeric().withMessage('OTP must be a 6-digit number'),
  ],
  validate,
  verifyRegistrationOTP
);

// ── OTP Login (2-step) ────────────────────────────────────────────────────────
router.post(
  '/send-otp',
  [body('identifier').notEmpty().withMessage('Phone number or email is required')],
  validate,
  sendOTP
);

router.post(
  '/verify-otp',
  [
    body('identifier').notEmpty().withMessage('Phone number or email is required'),
    body('otp').isLength({ min: 6, max: 6 }).isNumeric().withMessage('OTP must be a 6-digit number'),
  ],
  validate,
  verifyOTPLogin
);

// ── Protected — any logged-in role ───────────────────────────────────────────
router.get('/me', protect, getMe);

router.put(
  '/profile',
  protect,
  [
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('email').optional().isEmail().withMessage('Invalid email format'),
    body('alternatePhone').optional().matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit mobile number required'),
    body('gender').optional().isIn(['male', 'female', 'other']).withMessage('Gender must be male, female, or other'),
    body('upiId').optional().notEmpty().withMessage('UPI ID cannot be empty'),
  ],
  validate,
  updateProfile
);

// Profile photo upload
router.post('/profile/photo', protect, upload.single('photo'), uploadPhoto);

// ── KYC Document Upload & Management (Field Agents / Staff) ───────────────────
router.post('/kyc/upload', protect, uploadKyc.single('document'), uploadKycDocument);

router.put(
  '/kyc',
  protect,
  [
    body('aadhaarNumber').optional().trim(),
    body('panNumber').optional().trim(),
  ],
  validate,
  updateKyc
);

// Admin KYC status approval/rejection
router.put(
  '/users/:id/kyc-status',
  protect,
  authorize('super_admin', 'admin'),
  [
    body('status')
      .isIn(['VERIFIED', 'REJECTED', 'UNDER_REVIEW', 'NOT_UPLOADED'])
      .withMessage('Invalid KYC status value'),
  ],
  validate,
  updateKycStatus
);

// ── Super Admin + Admin ───────────────────────────────────────────────────────
router.post(
  '/users',
  protect,
  authorize('super_admin', 'admin'),
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit Indian mobile number required'),
    body('email').optional().isEmail().withMessage('Invalid email format'),
    body('role')
      .isIn(['admin', 'field_agent', 'dealer', 'broker', 'field_staff', 'tele_caller'])
      .withMessage('Role must be admin, field_agent, dealer, broker, field_staff, or tele_caller'),
    body('commissionRate').optional().isFloat({ min: 0, max: 100 }).withMessage('Commission rate must be between 0 and 100'),
  ],
  validate,
  createUser
);

router.get('/users', protect, authorize('super_admin', 'admin'), listUsers);

router.get('/users/:id', protect, authorize('super_admin', 'admin'), getUserById);

router.get('/users/:id/details', protect, authorize('super_admin', 'admin'), getUserAnalyticsAndDetail);

router.put(
  '/users/:id',
  protect,
  authorize('super_admin', 'admin'),
  [
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('phone').optional().matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit mobile number required'),
    body('email').optional().isEmail().withMessage('Invalid email format'),
    body('alternatePhone').optional().matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit mobile number required'),
    body('gender').optional().isIn(['male', 'female', 'other']).withMessage('Gender must be male, female, or other'),
  ],
  validate,
  editUser
);

router.put('/users/:id/status', protect, authorize('super_admin', 'admin'), toggleUserStatus);

router.put(
  '/users/:id/commission',
  protect,
  authorize('super_admin', 'admin'),
  [body('commissionRate').isFloat({ min: 0, max: 100 }).withMessage('Commission rate must be between 0 and 100')],
  validate,
  updateCommission
);

// Delete User — Super Admin exclusive
router.delete(
  '/users/:id',
  protect,
  authorize('super_admin'),
  deleteUser
);

module.exports = router;
