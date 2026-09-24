const express = require('express');
const router = express.Router();
const analyticsController = require('../../controllers/crm/analytics.controller');

router.get('/leads', analyticsController.getLeadAnalytics);
router.get('/calls', analyticsController.getCallAnalytics);
router.get('/site-visits', analyticsController.getSiteVisitAnalytics);
router.get('/conversions', analyticsController.getConversionAnalytics);
router.get('/tele-callers', analyticsController.getTeleCallerPerformance);
router.get('/matching', analyticsController.getMatchingAnalytics);
router.get('/whatsapp', analyticsController.getWhatsAppAnalytics);

module.exports = router;
