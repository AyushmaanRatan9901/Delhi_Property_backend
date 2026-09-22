const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const {
  getTenantDashboard,
  getTenantProperty,
  getTenantDocuments,
  getTenantRent,
  payTenantRent,
  getTenantReceipt,
  getTenantComplaints,
  createTenantComplaint,
  getTenantComplaintById,
  addTenantComplaintMessage,
  reopenTenantComplaint,
  getTenantInspections,
  getTenantRoomChangeRequests,
  createTenantRoomChangeRequest,
  getTenantNotifications,
  markTenantNotificationRead,
  markAllTenantNotificationsRead,
  getTenantProfile,
  updateTenantProfile,
} = require('../controllers/tenantController');

// All tenant routes require active authentication
router.use(protect);

// Dashboard & Overview
router.get('/dashboard', getTenantDashboard);

// Property Information & Documents
router.get('/property', getTenantProperty);
router.get('/documents', getTenantDocuments);

// Rent Management, Payments & Receipts
router.get('/rent', getTenantRent);
router.post('/rent/pay', payTenantRent);
router.get('/rent/receipt/:receiptId', getTenantReceipt);

// Complaints & Maintenance
router.get('/complaints', getTenantComplaints);
router.post('/complaints', createTenantComplaint);
router.get('/complaints/:ticketId', getTenantComplaintById);
router.post('/complaints/:ticketId/message', addTenantComplaintMessage);
router.post('/complaints/:ticketId/reopen', reopenTenantComplaint);

// Inspections
router.get('/inspections', getTenantInspections);

// Room / Property Change Requests
router.get('/room-change', getTenantRoomChangeRequests);
router.post('/room-change', createTenantRoomChangeRequest);

// Notifications
router.get('/notifications', getTenantNotifications);
router.patch('/notifications/read-all', markAllTenantNotificationsRead);
router.patch('/notifications/:id/read', markTenantNotificationRead);

// Profile
router.get('/profile', getTenantProfile);
router.patch('/profile', updateTenantProfile);

module.exports = router;
