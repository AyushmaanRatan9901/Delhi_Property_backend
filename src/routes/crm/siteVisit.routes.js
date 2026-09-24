const express = require('express');
const router = express.Router();
const siteVisitController = require('../../controllers/crm/siteVisit.controller');

router.post('/', siteVisitController.createSiteVisit);
router.get('/', siteVisitController.getSiteVisits);
router.get('/:visitId', siteVisitController.getSiteVisitById);
router.patch('/:visitId', siteVisitController.updateSiteVisit);
router.patch('/:visitId/confirm', siteVisitController.confirmSiteVisit);
router.patch('/:visitId/cancel', siteVisitController.cancelSiteVisit);
router.patch('/:visitId/status', siteVisitController.updateSiteVisitStatus);
router.patch('/:visitId/assign-agent', siteVisitController.assignAgentToSiteVisit);

// ── Site Visit Feedback ───────────────────────────────────────────────────
router.post('/:visitId/feedback', siteVisitController.submitSiteVisitFeedback);
router.get('/:visitId/feedback', siteVisitController.getSiteVisitFeedback);
router.patch('/:visitId/feedback', siteVisitController.updateSiteVisitFeedback);

module.exports = router;
