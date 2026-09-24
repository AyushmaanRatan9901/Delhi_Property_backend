const mongoose = require('mongoose');
const CRMSiteVisit = require('../../../models/crm/SiteVisit');
const CRMSiteVisitFeedback = require('../../../models/crm/SiteVisitFeedback');
const CRMLead = require('../../../models/crm/Lead');
const PropertyLead = require('../../../models/propertyLeadModel');
const User = require('../../../models/User');
const conflictCheckService = require('../../../services/crm/conflictCheck.service');
const auditLogService = require('../../../services/crm/auditLog.service');
const crmSocketService = require('../../../services/crm/crmSocket.service');
const { generateCRMId } = require('../../../utils/crmIdGenerator');
const ApiResponse = require('../../../utils/ApiResponse');
const ApiError = require('../../../utils/ApiError');

/**
 * GET /api/admin/crm/site-visits
 * View all site visits with filters & pagination
 */
const getAllSiteVisits = async (req, res) => {
  const {
    caller,
    fieldAgent,
    property,
    lead,
    date,
    dateFrom,
    dateTo,
    status,
    page = 1,
    limit = 20,
    sort = 'scheduledAt',
    sortBy = 'desc',
  } = req.query;

  const query = {};

  if (caller && mongoose.Types.ObjectId.isValid(caller)) {
    query.createdBy = new mongoose.Types.ObjectId(caller);
  }
  if (fieldAgent && mongoose.Types.ObjectId.isValid(fieldAgent)) {
    query.assignedFieldAgent = new mongoose.Types.ObjectId(fieldAgent);
  }
  if (property && mongoose.Types.ObjectId.isValid(property)) {
    query.property = new mongoose.Types.ObjectId(property);
  }
  if (lead && mongoose.Types.ObjectId.isValid(lead)) {
    query.lead = new mongoose.Types.ObjectId(lead);
  }
  if (status) query.status = status.toLowerCase();

  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    query.scheduledAt = { $gte: start, $lte: end };
  } else if (dateFrom || dateTo) {
    query.scheduledAt = {};
    if (dateFrom) query.scheduledAt.$gte = new Date(dateFrom);
    if (dateTo) query.scheduledAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sortDirection = sortBy === 'asc' ? 1 : -1;

  const [visits, total] = await Promise.all([
    CRMSiteVisit.find(query)
      .populate('lead', 'leadId name phone requirementType status')
      .populate('property', 'leadId locality address expectedPrice propertyType')
      .populate('assignedFieldAgent', 'name phone email staffId')
      .populate('createdBy', 'name phone staffId role')
      .populate('feedback')
      .sort({ [sort]: sortDirection })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CRMSiteVisit.countDocuments(query),
  ]);

  return res.json(
    new ApiResponse(200, visits, 'Site visits retrieved successfully', {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    })
  );
};

/**
 * GET /api/admin/crm/site-visits/:id
 */
const getSiteVisitById = async (req, res) => {
  const { id } = req.params;

  let visit = null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    visit = await CRMSiteVisit.findById(id)
      .populate('lead', 'leadId name phone requirementType status')
      .populate('property')
      .populate('assignedFieldAgent', 'name phone email staffId')
      .populate('createdBy', 'name phone staffId role')
      .populate('feedback')
      .lean();
  }
  if (!visit && id) {
    visit = await CRMSiteVisit.findOne({ visitId: id })
      .populate('lead', 'leadId name phone requirementType status')
      .populate('property')
      .populate('assignedFieldAgent', 'name phone email staffId')
      .populate('createdBy', 'name phone staffId role')
      .populate('feedback')
      .lean();
  }

  if (!visit) throw new ApiError(404, 'Site visit not found');

  return res.json(new ApiResponse(200, visit, 'Site visit details retrieved'));
};

/**
 * POST /api/admin/crm/site-visits
 * Schedule site visit with conflict prevention
 */
const createSiteVisit = async (req, res) => {
  const {
    leadId,
    propertyId,
    scheduledAt,
    assignedFieldAgentId,
    meetingLocation,
    notes,
    numberOfVisitors = 1,
  } = req.body;

  if (!leadId || !propertyId || !scheduledAt) {
    throw new ApiError(400, 'leadId, propertyId, and scheduledAt are required');
  }

  const [lead, property] = await Promise.all([
    CRMLead.findById(leadId),
    PropertyLead.findById(propertyId),
  ]);

  if (!lead) throw new ApiError(404, 'Lead not found');
  if (!property) throw new ApiError(404, 'Property not found');

  // Conflict Detection Check
  const conflictResult = await conflictCheckService.checkSiteVisitConflicts({
    scheduledAt,
    assignedFieldAgentId,
    propertyId: property._id,
    leadId: lead._id,
  });

  if (conflictResult.hasConflict) {
    return res.status(409).json({
      success: false,
      message: 'Scheduling conflict detected for site visit',
      conflicts: conflictResult.conflicts,
    });
  }

  const visitId = generateCRMId('VST');

  const siteVisit = await CRMSiteVisit.create({
    visitId,
    lead: lead._id,
    property: property._id,
    scheduledAt: new Date(scheduledAt),
    assignedFieldAgent: assignedFieldAgentId && mongoose.Types.ObjectId.isValid(assignedFieldAgentId) ? assignedFieldAgentId : undefined,
    assignedBy: assignedFieldAgentId ? req.user._id : undefined,
    meetingLocation: meetingLocation || property.locality,
    notes,
    numberOfVisitors,
    status: assignedFieldAgentId ? 'agent_assigned' : 'confirmed',
    createdBy: req.user._id,
    statusHistory: [
      {
        status: assignedFieldAgentId ? 'agent_assigned' : 'confirmed',
        changedBy: req.user._id,
        changedAt: new Date(),
        notes: 'Scheduled by Super Admin',
      },
    ],
  });

  // Update lead status to site_visit if earlier stage
  if (['new', 'contacted', 'qualified', 'matching', 'shortlisted'].includes(lead.status)) {
    lead.status = 'site_visit';
    lead.statusHistory.push({
      status: 'site_visit',
      changedBy: req.user._id,
      changedAt: new Date(),
      notes: `Site visit scheduled for ${new Date(scheduledAt).toLocaleString('en-IN')}`,
    });
    await lead.save();
    crmSocketService.leadStatusChanged(lead, 'shortlisted', 'site_visit');
  }

  crmSocketService.siteVisitCreated(siteVisit);

  await auditLogService.log({
    actor: req.user,
    action: 'SITE_VISIT_CREATED',
    entity: 'SiteVisit',
    entityId: siteVisit._id,
    metadata: { visitId: siteVisit.visitId, leadId: lead.leadId, propertyId: property.leadId },
    req,
  });

  return res.status(201).json(new ApiResponse(201, siteVisit, 'Site visit scheduled successfully'));
};

/**
 * PATCH /api/admin/crm/site-visits/:id
 */
const updateSiteVisit = async (req, res) => {
  const { id } = req.params;
  const { scheduledAt, assignedFieldAgentId, meetingLocation, notes, numberOfVisitors } = req.body;

  const siteVisit = await CRMSiteVisit.findById(id);
  if (!siteVisit) throw new ApiError(404, 'Site visit not found');

  if (scheduledAt) {
    const conflictResult = await conflictCheckService.checkSiteVisitConflicts({
      scheduledAt,
      assignedFieldAgentId: assignedFieldAgentId || siteVisit.assignedFieldAgent,
      propertyId: siteVisit.property,
      leadId: siteVisit.lead,
      excludeVisitId: siteVisit._id,
    });

    if (conflictResult.hasConflict) {
      return res.status(409).json({
        success: false,
        message: 'Rescheduling conflict detected',
        conflicts: conflictResult.conflicts,
      });
    }

    siteVisit.scheduledAt = new Date(scheduledAt);
  }

  if (assignedFieldAgentId !== undefined) siteVisit.assignedFieldAgent = assignedFieldAgentId || undefined;
  if (meetingLocation) siteVisit.meetingLocation = meetingLocation;
  if (notes) siteVisit.notes = notes;
  if (numberOfVisitors) siteVisit.numberOfVisitors = numberOfVisitors;

  await siteVisit.save();

  crmSocketService.siteVisitUpdated(siteVisit);

  return res.json(new ApiResponse(200, siteVisit, 'Site visit updated successfully'));
};

/**
 * PATCH /api/admin/crm/site-visits/:id/status
 */
const updateSiteVisitStatus = async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  const siteVisit = await CRMSiteVisit.findById(id);
  if (!siteVisit) throw new ApiError(404, 'Site visit not found');

  const oldStatus = siteVisit.status;
  siteVisit.status = status.toLowerCase();

  siteVisit.statusHistory.push({
    status: siteVisit.status,
    changedBy: req.user._id,
    changedAt: new Date(),
    notes: notes || `Status changed from ${oldStatus} to ${siteVisit.status}`,
  });

  await siteVisit.save();

  if (['completed', 'visit_completed'].includes(siteVisit.status)) {
    crmSocketService.siteVisitCompleted(siteVisit);
  } else {
    crmSocketService.siteVisitUpdated(siteVisit);
  }

  await auditLogService.log({
    actor: req.user,
    action: 'SITE_VISIT_STATUS_CHANGED',
    entity: 'SiteVisit',
    entityId: siteVisit._id,
    metadata: { from: oldStatus, to: siteVisit.status, notes },
    req,
  });

  return res.json(new ApiResponse(200, siteVisit, `Site visit status updated to ${siteVisit.status}`));
};

/**
 * PATCH /api/admin/crm/site-visits/:id/feedback
 */
const updateSiteVisitFeedback = async (req, res) => {
  const { id } = req.params;
  const { outcome, clientImpression, budgetFit, locationFit, feedbackNotes, objections, nextAction } = req.body;

  const siteVisit = await CRMSiteVisit.findById(id);
  if (!siteVisit) throw new ApiError(404, 'Site visit not found');

  let feedback = await CRMSiteVisitFeedback.findOne({ siteVisit: siteVisit._id });
  if (!feedback) {
    feedback = new CRMSiteVisitFeedback({
      siteVisit: siteVisit._id,
      lead: siteVisit.lead,
      property: siteVisit.property,
      submittedBy: req.user._id,
    });
  }

  if (outcome) feedback.outcome = outcome;
  if (clientImpression) feedback.clientImpression = clientImpression;
  if (budgetFit) feedback.budgetFit = budgetFit;
  if (locationFit) feedback.locationFit = locationFit;
  if (feedbackNotes) feedback.feedbackNotes = feedbackNotes;
  if (objections) feedback.objections = Array.isArray(objections) ? objections : [objections];
  if (nextAction) feedback.nextAction = nextAction;

  await feedback.save();

  siteVisit.feedback = feedback._id;
  siteVisit.status = 'visit_completed';
  await siteVisit.save();

  return res.json(new ApiResponse(200, feedback, 'Site visit feedback recorded successfully'));
};

/**
 * POST /api/admin/crm/site-visits/:id/cancel
 */
const cancelSiteVisit = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const siteVisit = await CRMSiteVisit.findById(id);
  if (!siteVisit) throw new ApiError(404, 'Site visit not found');

  siteVisit.status = 'cancelled';
  siteVisit.statusHistory.push({
    status: 'cancelled',
    changedBy: req.user._id,
    changedAt: new Date(),
    notes: reason || 'Cancelled by Super Admin',
  });

  await siteVisit.save();

  crmSocketService.siteVisitUpdated(siteVisit);

  await auditLogService.log({
    actor: req.user,
    action: 'SITE_VISIT_CANCELLED',
    entity: 'SiteVisit',
    entityId: siteVisit._id,
    metadata: { reason },
    req,
  });

  return res.json(new ApiResponse(200, siteVisit, 'Site visit cancelled'));
};

/**
 * GET /api/admin/crm/site-visits/availability
 */
const checkAvailability = async (req, res) => {
  const { scheduledAt, assignedFieldAgentId, propertyId, leadId, excludeVisitId } = req.query;

  if (!scheduledAt) throw new ApiError(400, 'scheduledAt date-time string is required');

  const result = await conflictCheckService.checkSiteVisitConflicts({
    scheduledAt,
    assignedFieldAgentId,
    propertyId,
    leadId,
    excludeVisitId,
  });

  return res.json(new ApiResponse(200, result, 'Availability status checked'));
};

module.exports = {
  getAllSiteVisits,
  getSiteVisitById,
  createSiteVisit,
  updateSiteVisit,
  updateSiteVisitStatus,
  updateSiteVisitFeedback,
  cancelSiteVisit,
  checkAvailability,
};
