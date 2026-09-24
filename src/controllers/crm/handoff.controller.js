const CRMHandoff = require('../../models/crm/CRMHandoff');
const CRMLead = require('../../models/crm/Lead');
const CRMLeadRequirement = require('../../models/crm/LeadRequirement');
const CRMShortlist = require('../../models/crm/Shortlist');
const CRMSiteVisit = require('../../models/crm/SiteVisit');
const CRMCallSummary = require('../../models/crm/CallSummary');
const { PropertyLead } = require('../../models/propertyLeadModel');
const { maskPropertiesList } = require('../../services/crm/maskedInventory.service');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { generateCRMId } = require('../../utils/crmIdGenerator');
const { logCRMActivity } = require('../../services/crm/activity.service');
const { sendCRMNotification } = require('../../services/crm/notification.service');

/**
 * POST /api/crm/leads/:leadId/handoff
 * Tele-caller packages qualified lead dossier and hands off to Super Admin
 */
const createHandoff = async (req, res) => {
  const { leadId } = req.params;
  const {
    teleCallerNotes,
    clientInterest,
    recommendedDeal,
    nextAction,
  } = req.body;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  // Gather aggregated dossier components
  const [requirement, shortlist, visits, latestSummary] = await Promise.all([
    CRMLeadRequirement.findOne({ lead: lead._id, isCurrent: true }).lean(),
    CRMShortlist.find({ lead: lead._id }).lean(),
    CRMSiteVisit.find({ lead: lead._id }).lean(),
    CRMCallSummary.findOne({ lead: lead._id }).sort({ createdAt: -1 }).lean(),
  ]);

  const handoffId = generateCRMId('HO');

  const handoff = await CRMHandoff.create({
    handoffId,
    lead: lead._id,
    teleCaller: req.user._id,
    requirementSummary: requirement || {},
    shortlistedProperties: shortlist.map((s) => s.property),
    siteVisitHistory: visits.map((v) => v._id),
    clientInterest: clientInterest || 'Qualified Client ready for deal negotiation',
    teleCallerNotes: teleCallerNotes || '',
    lastCallSummary: latestSummary?.summary || '',
    recommendedDeal: recommendedDeal || undefined,
    nextAction: nextAction || 'Admin review and deal closure',
    status: 'pending',
  });

  // Update lead status to negotiation
  lead.status = 'negotiation';
  lead.statusHistory.push({
    status: 'negotiation',
    changedBy: req.user._id,
    changedAt: new Date(),
    notes: `Handoff ${handoff.handoffId} submitted to Super Admin`,
  });
  await lead.save();

  await logCRMActivity({
    action: 'handoff_created',
    entityType: 'CRMHandoff',
    entityId: handoff._id,
    performedBy: req.user,
    lead: lead._id,
    metadata: { handoffId: handoff.handoffId },
    req,
  });

  // Broadcast to Super Admins
  await sendCRMNotification({
    type: 'general',
    title: 'New Lead Handoff Submitted',
    message: `Tele-caller ${req.user.name} submitted handoff ${handoff.handoffId} for lead ${lead.name}.`,
    lead: lead._id,
    referenceId: handoff.handoffId,
    broadcastRole: 'super_admin',
    priority: 'high',
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { handoff }, 'Handoff submitted to Super Admin successfully'));
};

/**
 * GET /api/crm/handoffs
 */
const getHandoffs = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (status && status !== 'ALL') filter.status = status;
  if (req.user.role === 'tele_caller') filter.teleCaller = req.user._id;

  const skip = (Number(page) - 1) * Number(limit);

  const [handoffs, total] = await Promise.all([
    CRMHandoff.find(filter)
      .populate('lead', 'leadId name phone requirementType priority')
      .populate('teleCaller', 'name staffId role profilePhoto')
      .populate('shortlistedProperties')
      .populate('reviewedBy', 'name staffId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CRMHandoff.countDocuments(filter),
  ]);

  const formatted = handoffs.map((h) => ({
    ...h,
    shortlistedProperties: maskPropertiesList(h.shortlistedProperties),
  }));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        handoffs: formatted,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)) || 1,
        },
      },
      'Handoffs fetched successfully'
    )
  );
};

/**
 * GET /api/crm/handoffs/:handoffId
 */
const getHandoffById = async (req, res) => {
  const { handoffId } = req.params;

  const handoff = await CRMHandoff.findOne({
    $or: [{ _id: handoffId.match(/^[0-9a-fA-F]{24}$/) ? handoffId : null }, { handoffId }],
  })
    .populate('lead')
    .populate('teleCaller', 'name staffId role profilePhoto')
    .populate('shortlistedProperties')
    .populate('siteVisitHistory')
    .populate('reviewedBy', 'name staffId')
    .lean();

  if (!handoff) throw new ApiError(404, 'Handoff not found');

  handoff.shortlistedProperties = maskPropertiesList(handoff.shortlistedProperties);

  return res.status(200).json(new ApiResponse(200, { handoff }, 'Handoff details fetched'));
};

/**
 * PATCH /api/crm/handoffs/:handoffId/accept
 * Admin / Super Admin accepts handoff for final deal closing
 */
const acceptHandoff = async (req, res) => {
  const { handoffId } = req.params;
  const { adminRemarks } = req.body;

  const handoff = await CRMHandoff.findOne({
    $or: [{ _id: handoffId.match(/^[0-9a-fA-F]{24}$/) ? handoffId : null }, { handoffId }],
  });
  if (!handoff) throw new ApiError(404, 'Handoff not found');

  handoff.status = 'accepted';
  handoff.reviewedBy = req.user._id;
  handoff.reviewedAt = new Date();
  if (adminRemarks) handoff.adminRemarks = adminRemarks;
  await handoff.save();

  await logCRMActivity({
    action: 'handoff_accepted',
    entityType: 'CRMHandoff',
    entityId: handoff._id,
    performedBy: req.user,
    lead: handoff.lead,
    metadata: { handoffId: handoff.handoffId },
    req,
  });

  await sendCRMNotification({
    recipientId: handoff.teleCaller,
    type: 'handoff_accepted',
    title: 'Handoff Accepted by Admin!',
    message: `Your handoff ${handoff.handoffId} for lead has been accepted by Super Admin.`,
    lead: handoff.lead,
    referenceId: handoff.handoffId,
    priority: 'high',
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { handoff }, 'Handoff accepted successfully'));
};

/**
 * PATCH /api/crm/handoffs/:handoffId/return
 * Admin / Super Admin returns handoff to Tele-caller with remarks
 */
const returnHandoff = async (req, res) => {
  const { handoffId } = req.params;
  const { adminRemarks } = req.body;

  if (!adminRemarks) {
    throw new ApiError(400, 'adminRemarks explaining why the handoff is returned is required');
  }

  const handoff = await CRMHandoff.findOne({
    $or: [{ _id: handoffId.match(/^[0-9a-fA-F]{24}$/) ? handoffId : null }, { handoffId }],
  });
  if (!handoff) throw new ApiError(404, 'Handoff not found');

  handoff.status = 'returned';
  handoff.reviewedBy = req.user._id;
  handoff.reviewedAt = new Date();
  handoff.adminRemarks = adminRemarks;
  await handoff.save();

  // Revert lead status to qualified/matching
  await CRMLead.findByIdAndUpdate(handoff.lead, {
    status: 'matching',
  });

  await logCRMActivity({
    action: 'handoff_returned',
    entityType: 'CRMHandoff',
    entityId: handoff._id,
    performedBy: req.user,
    lead: handoff.lead,
    metadata: { handoffId: handoff.handoffId, adminRemarks },
    req,
  });

  await sendCRMNotification({
    recipientId: handoff.teleCaller,
    type: 'handoff_returned',
    title: 'Handoff Returned by Admin',
    message: `Handoff ${handoff.handoffId} was returned: ${adminRemarks}`,
    lead: handoff.lead,
    referenceId: handoff.handoffId,
    priority: 'high',
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { handoff }, 'Handoff returned to tele-caller'));
};

/**
 * PATCH /api/crm/handoffs/:handoffId/cancel
 */
const cancelHandoff = async (req, res) => {
  const { handoffId } = req.params;

  const handoff = await CRMHandoff.findOne({
    $or: [{ _id: handoffId.match(/^[0-9a-fA-F]{24}$/) ? handoffId : null }, { handoffId }],
  });
  if (!handoff) throw new ApiError(404, 'Handoff not found');

  handoff.status = 'cancelled';
  await handoff.save();

  return res.status(200).json(new ApiResponse(200, { handoff }, 'Handoff cancelled'));
};

/**
 * GET /api/crm/leads/:leadId/handoff-history
 */
const getHandoffHistoryForLead = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const history = await CRMHandoff.find({ lead: lead._id })
    .populate('teleCaller', 'name staffId')
    .populate('reviewedBy', 'name staffId')
    .sort({ createdAt: -1 })
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, { history }, 'Handoff history fetched'));
};

module.exports = {
  createHandoff,
  getHandoffs,
  getHandoffById,
  acceptHandoff,
  returnHandoff,
  cancelHandoff,
  getHandoffHistoryForLead,
};
