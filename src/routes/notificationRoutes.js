const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const notificationController = require('../controllers/notificationController');

// All notification routes require authentication
router.use(protect);

router.get('/', notificationController.getMyNotifications);
router.patch('/mark-all-read', notificationController.markAllNotificationsRead);
router.patch('/:id/read', notificationController.markNotificationRead);
router.delete('/clear-all', notificationController.clearAllNotifications);
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;
