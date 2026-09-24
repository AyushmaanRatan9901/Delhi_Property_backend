const express = require('express');
const router = express.Router();

const { protect } = require('../../../middlewares/auth');
const { requireAdminOrSuperAdmin } = require('../../../middlewares/crmAuth');

const adminDashboard = require('../../../controllers/crm/admin/adminDashboard.controller');
const adminCaller = require('../../../controllers/crm/admin/adminCaller.controller');
const adminLead = require('../../../controllers/crm/admin/adminLead.controller');
const adminCall = require('../../../controllers/crm/admin/adminCall.controller');
const adminInventory = require('../../../controllers/crm/admin/adminInventory.controller');
const adminShortlist = require('../../../controllers/crm/admin/adminShortlist.controller');
const adminWhatsApp = require('../../../controllers/crm/admin/adminWhatsApp.controller');
const adminSiteVisit = require('../../../controllers/crm/admin/adminSiteVisit.controller');
const adminFollowUp = require('../../../controllers/crm/admin/adminFollowUp.controller');
const adminHandoff = require('../../../controllers/crm/admin/adminHandoff.controller');
const adminTVShowcase = require('../../../controllers/crm/admin/adminTVShowcase.controller');
const adminAuditLog = require('../../../controllers/crm/admin/adminAuditLog.controller');
const adminLeadSource = require('../../../controllers/crm/admin/adminLeadSource.controller');

// Enforce Auth and Admin/Super Admin authorization across all Admin CRM routes
router.use(protect);
router.use(requireAdminOrSuperAdmin);

// ── 1. CRM Dashboard ────────────────────────────────────────────────────────
router.get('/dashboard', adminDashboard.getCRMDashboardStats);

// ── 2. Tele-caller Management ────────────────────────────────────────────────
router.get('/callers', adminCaller.getAllCallers);
router.post('/callers', adminCaller.createCaller);
router.get('/callers/:id', adminCaller.getCallerById);
router.patch('/callers/:id', adminCaller.updateCaller);
router.patch('/callers/:id/status', adminCaller.updateCallerStatus);
router.post('/callers/:id/activate', adminCaller.activateCaller);
router.post('/callers/:id/deactivate', adminCaller.deactivateCaller);

router.get('/callers/:id/performance', adminCaller.getCallerPerformance);
router.get('/callers/:id/activity', adminCaller.getCallerActivity);
router.get('/callers/:id/leads', adminCaller.getCallerLeads);
router.get('/callers/:id/calls', adminCaller.getCallerCalls);
router.get('/callers/:id/follow-ups', adminCaller.getCallerFollowUps);
router.get('/callers/:id/site-visits', adminCaller.getCallerSiteVisits);
router.get('/callers/:id/shortlists', adminCaller.getCallerShortlists);
router.get('/callers/:id/handoffs', adminCaller.getCallerHandoffs);

// ── 3. Lead Management ───────────────────────────────────────────────────────
router.get('/leads', adminLead.getAllLeads);
router.get('/leads/unassigned', adminLead.getUnassignedLeads);
router.post('/leads', adminLead.createLead);
router.get('/leads/:leadId', adminLead.getLeadById);
router.patch('/leads/:leadId', adminLead.updateLead);
router.patch('/leads/:leadId/status', adminLead.updateLeadStatus);
router.patch('/leads/:leadId/priority', adminLead.updateLeadPriority);
router.patch('/leads/:leadId/requirement', adminLead.updateLeadRequirement);
router.patch('/leads/:leadId/assign', adminLead.assignLead);
router.patch('/leads/:leadId/reassign', adminLead.reassignLead);
router.post('/leads/:leadId/archive', adminLead.archiveLead);

// Lead nested resources
router.get('/leads/:leadId/calls', adminCall.getLeadCalls);
router.get('/leads/:leadId/matches', adminInventory.getLeadMatches);
router.get('/leads/:leadId/shortlists', adminShortlist.getLeadShortlists);
router.post('/leads/:leadId/shortlists', adminShortlist.addShortlist);
router.patch('/leads/:leadId/shortlists/:propertyId', adminShortlist.updateShortlistStatus);
router.delete('/leads/:leadId/shortlists/:propertyId', adminShortlist.removeShortlist);
router.get('/leads/:leadId/shares', adminWhatsApp.getLeadShares);
router.post('/leads/:leadId/follow-ups', adminFollowUp.createLeadFollowUp);

// ── 4. Call Monitoring ───────────────────────────────────────────────────────
router.get('/calls', adminCall.getAllCalls);
router.get('/calls/:callId', adminCall.getCallById);
router.get('/calls/:callId/summary', adminCall.getCallSummary);

// ── 5. Inventory & Matching ──────────────────────────────────────────────────
router.get('/inventory', adminInventory.getInventory);
router.get('/inventory/:propertyId', adminInventory.getInventoryById);
router.get('/inventory/:propertyId/media', adminInventory.getInventoryMedia);
router.post('/property-matching/search', adminInventory.searchPropertyMatches);

// ── 6. WhatsApp Sharing ──────────────────────────────────────────────────────
router.get('/whatsapp/shares', adminWhatsApp.getAllShares);
router.get('/shares/:shareId', adminWhatsApp.getShareById);

// ── 7. Site Visits ───────────────────────────────────────────────────────────
router.get('/site-visits/availability', adminSiteVisit.checkAvailability);
router.get('/site-visits', adminSiteVisit.getAllSiteVisits);
router.post('/site-visits', adminSiteVisit.createSiteVisit);
router.get('/site-visits/:id', adminSiteVisit.getSiteVisitById);
router.patch('/site-visits/:id', adminSiteVisit.updateSiteVisit);
router.patch('/site-visits/:id/status', adminSiteVisit.updateSiteVisitStatus);
router.patch('/site-visits/:id/feedback', adminSiteVisit.updateSiteVisitFeedback);
router.post('/site-visits/:id/cancel', adminSiteVisit.cancelSiteVisit);

// ── 8. Follow-ups ────────────────────────────────────────────────────────────
router.get('/follow-ups/today', adminFollowUp.getFollowUpsToday);
router.get('/follow-ups/overdue', adminFollowUp.getOverdueFollowUps);
router.get('/follow-ups', adminFollowUp.getAllFollowUps);
router.get('/follow-ups/:id', adminFollowUp.getFollowUpById);
router.patch('/follow-ups/:id', adminFollowUp.updateFollowUp);
router.patch('/follow-ups/:id/complete', adminFollowUp.completeFollowUp);
router.post('/follow-ups/:id/cancel', adminFollowUp.cancelFollowUp);

// ── 9. Handoffs ──────────────────────────────────────────────────────────────
router.get('/handoffs', adminHandoff.getAllHandoffs);
router.get('/handoffs/:id', adminHandoff.getHandoffById);
router.post('/handoffs/:id/accept', adminHandoff.acceptHandoff);
router.post('/handoffs/:id/reject', adminHandoff.rejectHandoff);
router.post('/handoffs/:id/return', adminHandoff.returnHandoff);

// ── 10. TV Showcases ─────────────────────────────────────────────────────────
router.get('/tv/showcases', adminTVShowcase.getAllShowcases);
router.post('/tv/showcases', adminTVShowcase.createShowcase);
router.get('/tv/showcases/:id', adminTVShowcase.getShowcaseById);
router.patch('/tv/showcases/:id', adminTVShowcase.updateShowcase);
router.delete('/tv/showcases/:id', adminTVShowcase.deleteShowcase);
router.post('/tv/showcases/:id/properties', adminTVShowcase.addPropertiesToShowcase);
router.delete('/tv/showcases/:id/properties/:propertyId', adminTVShowcase.removePropertyFromShowcase);
router.post('/tv/showcases/:id/play', adminTVShowcase.playShowcase);
router.post('/tv/showcases/:id/next', adminTVShowcase.nextShowcaseProperty);
router.post('/tv/showcases/:id/previous', adminTVShowcase.previousShowcaseProperty);

// ── 11. Audit Logs & Sources ─────────────────────────────────────────────────
router.get('/audit-logs', adminAuditLog.getAuditLogs);
router.get('/lead-sources', adminLeadSource.getLeadSources);

module.exports = router;
