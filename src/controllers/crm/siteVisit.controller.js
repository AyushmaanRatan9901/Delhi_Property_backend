const CRMSiteVisit = require('../../models/crm/SiteVisit');
const CRMSiteVisitFeedback = require('../../models/crm/SiteVisitFeedback');
const CRMLead = require('../../models/crm/Lead');
const { PropertyLead } = require('../../models/propertyLeadModel');
const User = require('../../models/User');
const { maskPropertyForTeleCaller } = require('../../services/crm/maskedInventory.service');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { generateCRMId } = require('../../utils/crmIdGenerator');
const { logCRMActivity } = require('../../services/crm/activity.service');
const { sendCRMNotification } = require('../../services/crm/notification.service');

/**
 * POST /api/crm/site-visits
 * Schedule a physical property site visit
 */
const createSiteVisit = async (req, res) => {
  const {
    leadId,
    propertyId,
    scheduledAt,
    numberOfVisitors = 1,
    assignedFieldAgent,
    meetingLocation,
    notes,
  } = req.body;

  if (!leadId || !propertyId || !scheduledAt) {
    throw new ApiError(400, 'leadId, propertyId, and scheduledAt are required');
  }

  const [lead, prop] = await Promise.all([
    CRMLead.findOne({
      $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
    }),
    PropertyLead.findOne({
      $or: [{ _id: propertyId.match(/^[0-9a-fA-F]{24}$/) ? propertyId : null }, { leadId: propertyId }],
    }),
  ]);

  if (!lead) throw new ApiError(404, 'Lead not found');
  if (!prop) throw new ApiError(404, 'Property not found');

  const visitId = generateCRMId('VIS');

  let agentUser = null;
  if (assignedFieldAgent) {
    agentUser = await User.findById(assignedFieldAgent);
  }

  const visit = await CRMSiteVisit.create({
    visitId,
    lead: lead._id,
    property: prop._id,
    scheduledAt: new Date(scheduledAt),
    numberOfVisitors: Number(numberOfVisitors) || 1,
    assignedFieldAgent: agentUser?._id,
    assignedBy: agentUser ? req.user._id : undefined,
    meetingLocation: meetingLocation || prop.locality || 'Property Location',
    notes,
    status: agentUser ? 'agent_assigned' : 'requested',
    statusHistory: [
      {
        status: agentUser ? 'agent_assigned' : 'requested',
        changedBy: req.user._id,
        changedAt: new Date(),
        notes: 'Site visit booked by CRM staff',
      },
    ],
    createdBy: req.user._id,
  });

  // Update lead status to 'site_visit'
  lead.status = 'site_visit';
  lead.statusHistory.push({
    status: 'site_visit',
    changedBy: req.user._id,
    changedAt: new Date(),
    notes: `Site visit ${visit.visitId} booked for ${prop.title || prop.locality}`,
  });
  await lead.save();

  await logCRMActivity({
    action: 'site_visit_created',
    entityType: 'CRMSiteVisit',
    entityId: visit._id,
    performedBy: req.user,
    lead: lead._id,
    property: prop._id,
    metadata: { visitId: visit.visitId, scheduledAt: visit.scheduledAt },
    req,
  });

  if (agentUser) {
    await sendCRMNotification({
      recipientId: agentUser._id,
      type: 'site_visit_confirmed',
      title: 'Site Visit Assigned',
      message: `You have been assigned to lead ${lead.name} for site visit at ${prop.locality} on ${new Date(scheduledAt).toLocaleString()}.`,
      lead: lead._id,
      property: prop._id,
      referenceId: visit.visitId,
    });
  }

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        siteVisit: {
          ...visit.toObject(),
          property: maskPropertyForTeleCaller(prop),
        },
      },
      'Site visit scheduled successfully'
    )
  );
};

/**
 * GET /api/crm/site-visits
 */
const getSiteVisits = async (req, res) => {
  const { page = 1, limit = 20, status, agentId, from, to } = req.query;

  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (agentId) filter.assignedFieldAgent = agentId;

  if (from || to) {
    filter.scheduledAt = {};
    if (from) filter.scheduledAt.$gte = new Date(from);
    if (to) filter.scheduledAt.$lte = new Date(to);
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [visits, total] = await Promise.all([
    CRMSiteVisit.find(filter)
      .populate('lead', 'leadId name phone requirementType')
      .populate('property')
      .populate('assignedFieldAgent', 'name phone staffId profilePhoto')
      .populate('feedback')
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CRMSiteVisit.countDocuments(filter),
  ]);

  const formatted = visits.map((v) => ({
    ...v,
    property: maskPropertyForTeleCaller(v.property),
  }));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        siteVisits: formatted,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)) || 1,
        },
      },
      'Site visits fetched successfully'
    )
  );
};

/**
 * GET /api/crm/site-visits/:visitId
 */
const getSiteVisitById = async (req, res) => {
  const { visitId } = req.params;

  const visit = await CRMSiteVisit.findOne({
    $or: [{ _id: visitId.match(/^[0-9a-fA-F]{24}$/) ? visitId : null }, { visitId }],
  })
    .populate('lead', 'leadId name phone requirementType')
    .populate('property')
    .populate('assignedFieldAgent', 'name phone staffId profilePhoto')
    .populate('feedback')
    .lean();

  if (!visit) throw new ApiError(404, 'Site visit not found');

  visit.property = maskPropertyForTeleCaller(visit.property);

  return res.status(200).json(new ApiResponse(200, { siteVisit: visit }, 'Site visit fetched'));
};

/**
 * PATCH /api/crm/site-visits/:visitId
 */
const updateSiteVisit = async (req, res) => {
  const { visitId } = req.params;
  const { scheduledAt, numberOfVisitors, meetingLocation, notes } = req.body;

  const visit = await CRMSiteVisit.findOne({
    $or: [{ _id: visitId.match(/^[0-9a-fA-F]{24}$/) ? visitId : null }, { visitId }],
  });
  if (!visit) throw new ApiError(404, 'Site visit not found');

  if (scheduledAt) visit.scheduledAt = new Date(scheduledAt);
  if (numberOfVisitors !== undefined) visit.numberOfVisitors = Number(numberOfVisitors);
  if (meetingLocation) visit.meetingLocation = meetingLocation;
  if (notes !== undefined) visit.notes = notes;

  await visit.save();

  return res.status(200).json(new ApiResponse(200, { siteVisit: visit }, 'Site visit updated'));
};

/**
 * PATCH /api/crm/site-visits/:visitId/confirm
 */
const confirmSiteVisit = async (req, res) => {
  const { visitId } = req.params;
  const visit = await CRMSiteVisit.findOne({
    $or: [{ _id: visitId.match(/^[0-9a-fA-F]{24}$/) ? visitId : null }, { visitId }],
  });
  if (!visit) throw new ApiError(404, 'Site visit not found');

  visit.status = 'confirmed';
  visit.statusHistory.push({
    status: 'confirmed',
    changedBy: req.user._id,
    changedAt: new Date(),
    notes: 'Confirmed with client',
  });
  await visit.save();

  return res.status(200).json(new ApiResponse(200, { siteVisit: visit }, 'Site visit confirmed'));
};

/**
 * PATCH /api/crm/site-visits/:visitId/cancel
 */
const cancelSiteVisit = async (req, res) => {
  const { visitId } = req.params;
  const { reason } = req.body;

  const visit = await CRMSiteVisit.findOne({
    $or: [{ _id: visitId.match(/^[0-9a-fA-F]{24}$/) ? visitId : null }, { visitId }],
  });
  if (!visit) throw new ApiError(404, 'Site visit not found');

  visit.status = 'cancelled';
  visit.statusHistory.push({
    status: 'cancelled',
    changedBy: req.user._id,
    changedAt: new Date(),
    notes: reason || 'Cancelled by client or staff',
  });
  await visit.save();

  return res.status(200).json(new ApiResponse(200, { siteVisit: visit }, 'Site visit cancelled'));
};

/**
 * PATCH /api/crm/site-visits/:visitId/status
 */
const updateSiteVisitStatus = async (req, res) => {
  const { visitId } = req.params;
  const { status, notes } = req.body;

  const visit = await CRMSiteVisit.findOne({
    $or: [{ _id: visitId.match(/^[0-9a-fA-F]{24}$/) ? visitId : null }, { visitId }],
  });
  if (!visit) throw new ApiError(404, 'Site visit not found');

  visit.status = status;
  visit.statusHistory.push({
    status,
    changedBy: req.user._id,
    changedAt: new Date(),
    notes: notes || `Status changed to ${status}`,
  });
  await visit.save();

  return res.status(200).json(new ApiResponse(200, { siteVisit: visit }, 'Status updated'));
};

/**
 * PATCH /api/crm/site-visits/:visitId/assign-agent
 */
const assignAgentToSiteVisit = async (req, res) => {
  const { visitId } = req.params;
  const { agentId } = req.body;

  const [visit, agentUser] = await Promise.all([
    CRMSiteVisit.findOne({
      $or: [{ _id: visitId.match(/^[0-9a-fA-F]{24}$/) ? visitId : null }, { visitId }],
    }),
    User.findById(agentId),
  ]);

  if (!visit) throw new ApiError(404, 'Site visit not found');
  if (!agentUser) throw new ApiError(404, 'Field Agent not found');

  visit.assignedFieldAgent = agentUser._id;
  visit.assignedBy = req.user._id;
  visit.status = 'agent_assigned';
  visit.statusHistory.push({
    status: 'agent_assigned',
    changedBy: req.user._id,
    changedAt: new Date(),
    notes: `Assigned to field agent ${agentUser.name}`,
  });
  await visit.save();

  await sendCRMNotification({
    recipientId: agentUser._id,
    type: 'site_visit_confirmed',
    title: 'New Site Visit Assigned',
    message: `You have been assigned to site visit ${visit.visitId} on ${new Date(visit.scheduledAt).toLocaleString()}.`,
    referenceId: visit.visitId,
  });

  return res.status(200).json(
    new ApiResponse(200, { siteVisit: visit }, `Assigned to ${agentUser.name} successfully`)
  );
};

/**
 * GET /api/crm/leads/:leadId/site-visits
 */
const getVisitsForLead = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const visits = await CRMSiteVisit.find({ lead: lead._id })
    .populate('property')
    .populate('assignedFieldAgent', 'name phone staffId')
    .populate('feedback')
    .sort({ scheduledAt: -1 })
    .lean();

  const formatted = visits.map((v) => ({
    ...v,
    property: maskPropertyForTeleCaller(v.property),
  }));

  return res
    .status(200)
    .json(new ApiResponse(200, { siteVisits: formatted }, 'Lead site visits fetched'));
};

// ─────────────────────────────────────────────────────────────────────────────
// Site Visit Feedback Sub-handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/crm/site-visits/:visitId/feedback
 */
const submitSiteVisitFeedback = async (req, res) => {
  const { visitId } = req.params;
  const {
    outcome,
    clientImpression,
    budgetFit,
    locationFit,
    feedbackNotes,
    objections,
    nextAction,
  } = req.body;

  if (!outcome) throw new ApiError(400, 'outcome is required for feedback');

  const visit = await CRMSiteVisit.findOne({
    $or: [{ _id: visitId.match(/^[0-9a-fA-F]{24}$/) ? visitId : null }, { visitId }],
  });
  if (!visit) throw new ApiError(404, 'Site visit not found');

  const feedback = await CRMSiteVisitFeedback.create({
    siteVisit: visit._id,
    lead: visit.lead,
    property: visit.property,
    outcome,
    clientImpression,
    budgetFit,
    locationFit,
    feedbackNotes,
    objections: Array.isArray(objections) ? objections : [],
    nextAction,
    submittedBy: req.user._id,
  });

  visit.feedback = feedback._id;
  visit.status = 'completed';
  visit.statusHistory.push({
    status: 'completed',
    changedBy: req.user._id,
    changedAt: new Date(),
    notes: `Visit completed with outcome: ${outcome}`,
  });
  await visit.save();

  // If interested, upgrade lead status
  if (outcome === 'interested' || outcome === 'negotiation') {
    await CRMLead.findByIdAndUpdate(visit.lead, {
      status: 'negotiation',
    });
  }

  await logCRMActivity({
    action: 'site_visit_completed',
    entityType: 'CRMSiteVisitFeedback',
    entityId: feedback._id,
    performedBy: req.user,
    lead: visit.lead,
    property: visit.property,
    metadata: { visitId: visit.visitId, outcome },
    req,
  });

  return res.status(201).json(
    new ApiResponse(201, { feedback, siteVisit: visit }, 'Feedback submitted successfully')
  );
};

/**
 * GET /api/crm/site-visits/:visitId/feedback
 */
const getSiteVisitFeedback = async (req, res) => {
  const { visitId } = req.params;

  const visit = await CRMSiteVisit.findOne({
    $or: [{ _id: visitId.match(/^[0-9a-fA-F]{24}$/) ? visitId : null }, { visitId }],
  });
  if (!visit) throw new ApiError(404, 'Site visit not found');

  const feedback = await CRMSiteVisitFeedback.findOne({ siteVisit: visit._id })
    .populate('submittedBy', 'name staffId')
    .lean();

  if (!feedback) throw new ApiError(404, 'No feedback recorded for this visit');

  return res
    .status(200)
    .json(new ApiResponse(200, { feedback }, 'Feedback fetched successfully'));
};

/**
 * PATCH /api/crm/site-visits/:visitId/feedback
 */
const updateSiteVisitFeedback = async (req, res) => {
  const { visitId } = req.params;
  const {
    outcome,
    clientImpression,
    budgetFit,
    locationFit,
    feedbackNotes,
    objections,
    nextAction,
  } = req.body;

  const visit = await CRMSiteVisit.findOne({
    $or: [{ _id: visitId.match(/^[0-9a-fA-F]{24}$/) ? visitId : null }, { visitId }],
  });
  if (!visit) throw new ApiError(404, 'Site visit not found');

  const feedback = await CRMSiteVisitFeedback.findOne({ siteVisit: visit._id });
  if (!feedback) throw new ApiError(404, 'Feedback not found');

  if (outcome) feedback.outcome = outcome;
  if (clientImpression) feedback.clientImpression = clientImpression;
  if (budgetFit) feedback.budgetFit = budgetFit;
  if (locationFit) feedback.locationFit = locationFit;
  if (feedbackNotes !== undefined) feedback.feedbackNotes = feedbackNotes;
  if (objections) feedback.objections = objections;
  if (nextAction !== undefined) feedback.nextAction = nextAction;

  await feedback.save();

  return res
    .status(200)
    .json(new ApiResponse(200, { feedback }, 'Feedback updated successfully'));
};

module.exports = {
  createSiteVisit,
  getSiteVisits,
  getSiteVisitById,
  updateSiteVisit,
  confirmSiteVisit,
  cancelSiteVisit,
  updateSiteVisitStatus,
  assignAgentToSiteVisit,
  getVisitsForLead,
  submitSiteVisitFeedback,
  getSiteVisitFeedback,
  updateSiteVisitFeedback,
};
