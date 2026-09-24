const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getDashboardActivity,
  getDashboardFollowups,
  getDashboardCalls,
  getDashboardSiteVisits,
  getDashboardNotifications,
} = require('../../controllers/crm/dashboard.controller');

router.get('/', getDashboardStats);
router.get('/activity', getDashboardActivity);
router.get('/followups', getDashboardFollowups);
router.get('/calls', getDashboardCalls);
router.get('/site-visits', getDashboardSiteVisits);
router.get('/notifications', getDashboardNotifications);

module.exports = router;
