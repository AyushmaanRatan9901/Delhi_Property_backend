const express = require('express');
const router = express.Router();
const followupController = require('../../controllers/crm/followup.controller');

router.post('/', followupController.createFollowUp);
router.get('/', followupController.getFollowUps);
router.get('/today', followupController.getTodayFollowUps);
router.get('/overdue', followupController.getOverdueFollowUps);
router.get('/:followupId', followupController.getFollowUpById);
router.patch('/:followupId', followupController.updateFollowUp);
router.patch('/:followupId/complete', followupController.completeFollowUp);
router.patch('/:followupId/cancel', followupController.cancelFollowUp);
router.patch('/:followupId/snooze', followupController.snoozeFollowUp);

module.exports = router;
