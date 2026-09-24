const express = require('express');
const router = express.Router();

const { protect } = require('../../middlewares/auth');
const { requireCRMAccess } = require('../../middlewares/crmAuth');

const dashboardRoutes = require('./dashboard.routes');
const leadRoutes = require('./lead.routes');
const callRoutes = require('./call.routes');
const inventoryRoutes = require('./inventory.routes');
const matchingRoutes = require('./matching.routes');
const shortlistRoutes = require('./shortlist.routes');
const whatsappRoutes = require('./whatsapp.routes');
const sharedRoutes = require('./shared.routes');
const showcaseRoutes = require('./showcase.routes');
const siteVisitRoutes = require('./siteVisit.routes');
const followupRoutes = require('./followup.routes');
const handoffRoutes = require('./handoff.routes');
const notificationRoutes = require('./notification.routes');
const analyticsRoutes = require('./analytics.routes');
const activityRoutes = require('./activity.routes');
const searchRoutes = require('./search.routes');
const accessRoutes = require('./access.routes');

// ── 1. Public Shared Catalogues (No Auth Required for prospective clients) ────
router.use('/shared', sharedRoutes);

// ── 2. TV Display Screen (Public or screen-token accessible) ───────────────
router.get('/showcase/:showcaseId/display', require('./showcase.routes'));

// ── 3. Authenticated CRM Endpoints (Protected by JWT & requireCRMAccess) ─────
router.use(protect);
router.use(requireCRMAccess);

router.use('/dashboard', dashboardRoutes);
router.use('/leads', leadRoutes);
router.use('/calls', callRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/matching', matchingRoutes);
router.use('/shortlists', shortlistRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/showcase', showcaseRoutes);
router.use('/site-visits', siteVisitRoutes);
router.use('/followups', followupRoutes);
router.use('/handoffs', handoffRoutes);
router.use('/notifications', notificationRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/activity', activityRoutes);
router.use('/search', searchRoutes);
router.use('/access', accessRoutes);
router.use('/permissions', accessRoutes);

module.exports = router;
