const express = require('express');
const router = express.Router();

const leadController = require('../../controllers/crm/lead.controller');
const requirementController = require('../../controllers/crm/requirement.controller');
const noteController = require('../../controllers/crm/note.controller');
const callController = require('../../controllers/crm/call.controller');
const matchingController = require('../../controllers/crm/matching.controller');
const shortlistController = require('../../controllers/crm/shortlist.controller');
const whatsappController = require('../../controllers/crm/whatsapp.controller');
const siteVisitController = require('../../controllers/crm/siteVisit.controller');
const followupController = require('../../controllers/crm/followup.controller');
const activityController = require('../../controllers/crm/activity.controller');
const handoffController = require('../../controllers/crm/handoff.controller');
const conversionController = require('../../controllers/crm/conversion.controller');

// ── Lead Collection Endpoints ──────────────────────────────────────────────
router.post('/', leadController.createLead);
router.get('/', leadController.getLeads);
router.get('/assigned', leadController.getAssignedLeads);
router.get('/unassigned', leadController.getUnassignedLeads);

// ── Single Lead Direct Routes ──────────────────────────────────────────────
router.get('/:leadId', leadController.getLeadById);
router.patch('/:leadId', leadController.updateLead);
router.delete('/:leadId', leadController.deleteLead);
router.patch('/:leadId/archive', leadController.archiveLead);
router.patch('/:leadId/restore', leadController.restoreLead);

// ── Status & Assignment ───────────────────────────────────────────────────
router.patch('/:leadId/status', leadController.updateLeadStatus);
router.get('/:leadId/status-history', leadController.getLeadStatusHistory);
router.patch('/:leadId/assign', leadController.assignLead);
router.patch('/:leadId/reassign', leadController.assignLead);

// ── Requirement Specification ─────────────────────────────────────────────
router.get('/:leadId/requirement', requirementController.getLeadRequirement);
router.post('/:leadId/requirement', requirementController.saveLeadRequirement);
router.patch('/:leadId/requirement', requirementController.patchLeadRequirement);
router.get('/:leadId/requirement/history', requirementController.getRequirementHistory);

// ── Notes ─────────────────────────────────────────────────────────────────
router.get('/:leadId/notes', noteController.getNotes);
router.post('/:leadId/notes', noteController.createNote);
router.patch('/:leadId/notes/:noteId', noteController.updateNote);
router.delete('/:leadId/notes/:noteId', noteController.deleteNote);

// ── Related Entities under Lead Context ───────────────────────────────────
router.get('/:leadId/calls', callController.getCallsForLead);
router.get('/:leadId/matches', matchingController.getMatchesForLead);
router.post('/:leadId/matches/refresh', matchingController.refreshMatches);

// ── Shortlist ─────────────────────────────────────────────────────────────
router.get('/:leadId/shortlist', shortlistController.getLeadShortlist);
router.post('/:leadId/shortlist', shortlistController.addToShortlist);
router.delete('/:leadId/shortlist', shortlistController.clearLeadShortlist);
router.get('/:leadId/shortlist/history', shortlistController.getShortlistHistory);
router.post('/:leadId/shortlist/:propertyId', shortlistController.addSinglePropertyToShortlist);
router.patch('/:leadId/shortlist/:propertyId', shortlistController.updateShortlistItem);
router.delete('/:leadId/shortlist/:propertyId', shortlistController.removePropertyFromShortlist);

// ── WhatsApp Shares, Site Visits, Followups, Activity ─────────────────────
router.get('/:leadId/shares', whatsappController.getSharesForLead);
router.get('/:leadId/site-visits', siteVisitController.getVisitsForLead);
router.get('/:leadId/followups', followupController.getFollowUpsForLead);
router.get('/:leadId/activity', activityController.getActivityForLead);

// ── Handoff & Conversion ──────────────────────────────────────────────────
router.post('/:leadId/handoff', handoffController.createHandoff);
router.get('/:leadId/handoff-history', handoffController.getHandoffHistoryForLead);
router.patch('/:leadId/convert', conversionController.convertLead);
router.patch('/:leadId/lost', conversionController.markLeadAsLost);
router.post('/:leadId/lost-reason', conversionController.setLostReason);

module.exports = router;
