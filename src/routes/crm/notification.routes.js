const express = require('express');
const router = express.Router();
const notificationController = require('../../controllers/crm/notification.controller');

router.get('/', notificationController.getNotifications);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:notificationId/read', notificationController.markAsRead);
router.delete('/:notificationId', notificationController.deleteNotification);

module.exports = router;
