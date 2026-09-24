const express = require('express');
const router = express.Router();
const {
  getNotificationAutomations,
  createNotificationAutomation,
  updateNotificationAutomation,
  toggleAutomationRule,
  sendManualRentReminder,
  sendCustomNotification,
  getNotificationHistory,
  runAutomatedRentWorkflow,
} = require('../controllers/notificationAutomationController');
const { protect, authorize } = require('../middlewares/auth');

router.use(protect);

router.get(
  '/',
  authorize('super_admin', 'admin'),
  getNotificationAutomations
);

router.post(
  '/',
  authorize('super_admin'),
  createNotificationAutomation
);

router.patch(
  '/:id',
  authorize('super_admin'),
  updateNotificationAutomation
);

router.patch(
  '/:id/toggle',
  authorize('super_admin'),
  toggleAutomationRule
);

router.post(
  '/send-manual',
  authorize('super_admin', 'admin'),
  sendManualRentReminder
);

router.post(
  '/send-custom',
  authorize('super_admin', 'admin'),
  sendCustomNotification
);

router.get(
  '/history',
  authorize('super_admin', 'admin'),
  getNotificationHistory
);

router.post(
  '/run-cron',
  authorize('super_admin'),
  runAutomatedRentWorkflow
);

module.exports = router;
