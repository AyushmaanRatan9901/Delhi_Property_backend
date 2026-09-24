const express = require('express');
const router = express.Router();
const activityController = require('../../controllers/crm/activity.controller');

router.get('/', activityController.getAllActivity);
router.get('/:activityId', activityController.getActivityById);

module.exports = router;
