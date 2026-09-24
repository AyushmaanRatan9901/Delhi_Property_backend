const express = require('express');
const router = express.Router();
const {
  getSuperAdminTenantRentHistory,
  getTenantDetailedHistory,
  recordRentPayment,
} = require('../controllers/rentPaymentController');
const { protect, authorize } = require('../middlewares/auth');

// All rent payment / tenant history management routes are protected for super_admin and admin
router.use(protect);

router.get(
  '/superadmin/tenant-history',
  authorize('super_admin', 'admin'),
  getSuperAdminTenantRentHistory
);

router.get(
  '/superadmin/tenants/:tenantId/history',
  authorize('super_admin', 'admin'),
  getTenantDetailedHistory
);

router.post(
  '/',
  authorize('super_admin', 'admin'),
  recordRentPayment
);

module.exports = router;
