const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const notificationController = require('../controllers/notificationController');

const { authorize } = require('../middlewares/auth');
const automationController = require('../controllers/notificationAutomationController');

// All notification routes require authentication
router.use(protect);

router.get('/', notificationController.getMyNotifications);
router.patch('/mark-all-read', notificationController.markAllNotificationsRead);
router.patch('/:id/read', notificationController.markNotificationRead);
router.delete('/clear-all', notificationController.clearAllNotifications);
router.delete('/:id', notificationController.deleteNotification);

// Super Admin notification dispatch & audit history
router.post('/send-manual', authorize('super_admin', 'admin'), automationController.sendManualRentReminder);
router.post('/send-custom', authorize('super_admin', 'admin'), automationController.sendCustomNotification);
router.get('/history', authorize('super_admin', 'admin'), automationController.getNotificationHistory);

module.exports = router;
