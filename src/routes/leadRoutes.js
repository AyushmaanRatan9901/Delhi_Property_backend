const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const { uploadPropertyMedia } = require('../middlewares/upload');
const propertyController = require('../controllers/propertyController');

// All routes require authentication
router.use(protect);


// ── 0. Media Upload Route ──────────────────────────────────────────────────────
router.post(
  '/upload-media',
  authorize('field_staff', 'verification_staff', 'admin', 'super_admin', 'agent', 'broker'),
  uploadPropertyMedia.single('file'),
  propertyController.uploadLeadMedia
);

// ── 1. Field Agent Routes (Personal Submission & Stats) ────────────────────────
router.post('/', propertyController.createPropertyLead);
router.get('/my-leads', propertyController.getMyLeads);
router.get('/my-stats', propertyController.getMyLeadStats);
router.get('/stats', propertyController.getMyLeadStats);

// ── 2. Verification Staff Panel Routes ─────────────────────────────────────────
router.get(
  '/check-aadhaar',
  authorize('field_staff', 'verification_staff', 'admin', 'super_admin'),
  propertyController.checkDuplicateAadhaar
);
router.get(
  '/my-inspections',
  authorize('field_staff', 'verification_staff', 'admin', 'super_admin'),
  propertyController.getStaffInspections
);
router.get(
  '/complaints',
  authorize('field_staff', 'verification_staff', 'admin', 'super_admin'),
  propertyController.getStaffComplaints
);
router.post(
  '/complaints',
  authorize('field_staff', 'verification_staff', 'admin', 'super_admin'),
  propertyController.createComplaintTicket
);
router.patch(
  '/:propertyId/complaints/:ticketId',
  authorize('field_staff', 'verification_staff', 'admin', 'super_admin'),
  propertyController.updateComplaintStatus
);
router.post(
  '/:id/publish-inspection',
  authorize('field_staff', 'verification_staff', 'admin', 'super_admin'),
  propertyController.publishInspectionLead
);
router.post(
  '/:id/inspection-report',
  authorize('field_staff', 'verification_staff', 'admin', 'super_admin'),
  propertyController.addInspectionReport
);
router.post(
  '/:id/inspections/schedule',
  authorize('field_staff', 'verification_staff', 'admin', 'super_admin'),
  propertyController.schedulePropertyInspection
);
router.patch(
  '/:propertyId/room-change/:requestId',
  authorize('field_staff', 'verification_staff', 'admin', 'super_admin'),
  propertyController.updateRoomChangeRequestStatus
);

// ── 3. Field Staff Routes (Assigned Leads & Physical Inspection) ───────────────
router.get(
  '/assigned-to-me',
  authorize('field_staff', 'verification_staff', 'admin', 'super_admin'),
  propertyController.getAssignedLeadsForStaff
);
router.patch(
  '/:id/verify-inspection',
  authorize('field_staff', 'verification_staff', 'admin', 'super_admin'),
  propertyController.verifyLeadByStaff
);

// ── 4. Admin & Staff Assignment Routes ─────────────────────────────────────────
router.get(
  '/admin/all',
  authorize('super_admin', 'admin', 'tele_caller'),
  propertyController.getAllLeadsAdmin
);
router.patch(
  '/:id/assign',
  authorize('super_admin', 'admin'),
  propertyController.assignLeadToStaff
);

// ── 5. Super Admin Exclusive Routes ───────────────────────────────────────────
router.patch(
  '/:id/commission',
  authorize('super_admin'),
  propertyController.decideCommissionSuperAdmin
);

// Duplicate review & resolution
router.get(
  '/admin/duplicates',
  authorize('super_admin', 'admin'),
  propertyController.getDuplicateLeads
);
router.patch(
  '/:id/resolve-duplicate',
  authorize('super_admin'),
  propertyController.resolveDuplicateLead
);

// Booking & Deal Management
router.patch(
  '/:id/deal',
  authorize('super_admin'),
  propertyController.confirmDeal
);
router.delete(
  '/:id/deal',
  authorize('super_admin'),
  propertyController.removeTenantFromDeal
);
router.delete(
  '/:id/deal/tenant',
  authorize('super_admin'),
  propertyController.removeTenantFromDeal
);

// Universal Rent Ledger
router.get(
  '/admin/rent-ledger',
  authorize('super_admin', 'admin'),
  propertyController.getAdminRentLedger
);

router.post(
  '/:id/rent-ledger',
  authorize('super_admin'),
  propertyController.addRentLedgerEntry
);
router.post(
  '/:id/owner-payout',
  authorize('super_admin'),
  propertyController.addOwnerPayoutEntry
);

router.patch(
  '/:id/rent-ledger',
  authorize('super_admin'),
  propertyController.updateRentLedgerEntry
);

// Owner & Agent Payouts
router.get(
  '/admin/payouts',
  authorize('super_admin'),
  propertyController.getAdminPayouts
);
router.patch(
  '/:id/owner-payout',
  authorize('super_admin'),
  propertyController.processOwnerPayout
);

// Reports & Hyperlocal Analytics
router.get(
  '/admin/analytics',
  authorize('super_admin', 'admin'),
  propertyController.getAdminAnalytics
);

// System Automation Settings
router.get(
  '/admin/settings',
  authorize('super_admin'),
  propertyController.getAdminSettings
);
router.put(
  '/admin/settings',
  authorize('super_admin'),
  propertyController.updateAdminSettings
);

// ── 6. Common CRUD Operations ──────────────────────────────────────────────────
router.get('/:id', propertyController.getLeadById);
router.put('/:id', propertyController.updateLeadByStaff);
router.patch('/:id', propertyController.updateLeadByStaff);
router.delete('/:id', propertyController.deleteLeadWithReason); // Mandatory reason required in req.body

module.exports = router;
