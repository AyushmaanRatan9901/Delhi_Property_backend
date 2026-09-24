const mongoose = require('mongoose');
const CRMHandoff = require('../../../models/crm/CRMHandoff');
const CRMLead = require('../../../models/crm/Lead');
const auditLogService = require('../../../services/crm/auditLog.service');
const crmSocketService = require('../../../services/crm/crmSocket.service');
const notificationService = require('../../../services/crm/notification.service');
const ApiResponse = require('../../../utils/ApiResponse');
const ApiError = require('../../../utils/ApiError');

/**
 * GET /api/admin/crm/handoffs
 */
const getAllHandoffs = async (req, res) => {
  const { status, caller, page = 1, limit = 20 } = req.query;

  const query = {};
  if (status && status !== 'ALL') query.status = status.toLowerCase();
  if (caller && mongoose.Types.ObjectId.isValid(caller)) {
    query.teleCaller = new mongoose.Types.ObjectId(caller);
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [handoffs, total] = await Promise.all([
    CRMHandoff.find(query)
      .populate('lead', 'leadId name phone requirementType status priority')
      .populate('teleCaller', 'name phone email staffId')
      .populate('shortlistedProperties')
      .populate('siteVisitHistory')
      .populate('reviewedBy', 'name role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CRMHandoff.countDocuments(query),
  ]);

  return res.json(
    new ApiResponse(200, handoffs, 'Lead handoffs retrieved successfully', {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    })
  );
};

/**
 * GET /api/admin/crm/handoffs/:id
 */
const getHandoffById = async (req, res) => {
  const { id } = req.params;

  let handoff = null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    handoff = await CRMHandoff.findById(id)
      .populate('lead')
      .populate('teleCaller', 'name phone email staffId')
      .populate('shortlistedProperties')
      .populate('siteVisitHistory')
      .populate('reviewedBy', 'name role')
      .lean();
  }
  if (!handoff && id) {
    handoff = await CRMHandoff.findOne({ handoffId: id })
      .populate('lead')
      .populate('teleCaller', 'name phone email staffId')
      .populate('shortlistedProperties')
      .populate('siteVisitHistory')
      .populate('reviewedBy', 'name role')
      .lean();
  }

  if (!handoff) throw new ApiError(404, 'Handoff not found');

  return res.json(new ApiResponse(200, handoff, 'Handoff details retrieved'));
};

/**
 * POST /api/admin/crm/handoffs/:id/accept
 */
const acceptHandoff = async (req, res) => {
  const { id } = req.params;
  const { remarks } = req.body;

  const handoff = await CRMHandoff.findById(id).populate('lead');
  if (!handoff) throw new ApiError(404, 'Handoff not found');

  handoff.status = 'accepted';
  handoff.reviewedBy = req.user._id;
  handoff.reviewedAt = new Date();
  handoff.adminRemarks = remarks || 'Accepted by Super Admin for deal closing';
  await handoff.save();

  // Advance lead status to negotiation if currently in earlier stage
  if (handoff.lead) {
    handoff.lead.status = 'negotiation';
    handoff.lead.statusHistory.push({
      status: 'negotiation',
      changedBy: req.user._id,
      changedAt: new Date(),
      notes: 'Handoff accepted by Super Admin for deal closing',
    });
    await handoff.lead.save();
    crmSocketService.leadStatusChanged(handoff.lead, 'site_visit', 'negotiation');
  }

  crmSocketService.handoffAccepted(handoff);

  await auditLogService.log({
    actor: req.user,
    action: 'HANDOFF_ACCEPTED',
    entity: 'CRMHandoff',
    entityId: handoff._id,
    metadata: { handoffId: handoff.handoffId, remarks },
    req,
  });

  return res.json(new ApiResponse(200, handoff, 'Handoff accepted successfully'));
};

/**
 * POST /api/admin/crm/handoffs/:id/reject
 */
const rejectHandoff = async (req, res) => {
  const { id } = req.params;
  const { remarks } = req.body;

  const handoff = await CRMHandoff.findById(id);
  if (!handoff) throw new ApiError(404, 'Handoff not found');

  handoff.status = 'rejected';
  handoff.reviewedBy = req.user._id;
  handoff.reviewedAt = new Date();
  handoff.adminRemarks = remarks || 'Rejected by Super Admin';
  await handoff.save();

  crmSocketService.handoffRejected(handoff);

  await auditLogService.log({
    actor: req.user,
    action: 'HANDOFF_REJECTED',
    entity: 'CRMHandoff',
    entityId: handoff._id,
    metadata: { handoffId: handoff.handoffId, remarks },
    req,
  });

  return res.json(new ApiResponse(200, handoff, 'Handoff rejected'));
};

/**
 * POST /api/admin/crm/handoffs/:id/return
 */
const returnHandoff = async (req, res) => {
  const { id } = req.params;
  const { remarks } = req.body;

  const handoff = await CRMHandoff.findById(id);
  if (!handoff) throw new ApiError(404, 'Handoff not found');

  handoff.status = 'returned';
  handoff.reviewedBy = req.user._id;
  handoff.reviewedAt = new Date();
  handoff.adminRemarks = remarks || 'Returned for further follow-up by caller';
  await handoff.save();

  await auditLogService.log({
    actor: req.user,
    action: 'HANDOFF_RETURNED',
    entity: 'CRMHandoff',
    entityId: handoff._id,
    metadata: { handoffId: handoff.handoffId, remarks },
    req,
  });

  return res.json(new ApiResponse(200, handoff, 'Handoff returned to tele-caller for further qualification'));
};

module.exports = {
  getAllHandoffs,
  getHandoffById,
  acceptHandoff,
  rejectHandoff,
  returnHandoff,
};
