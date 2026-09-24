const mongoose = require('mongoose');
const CRMFollowUp = require('../../../models/crm/FollowUp');
const CRMLead = require('../../../models/crm/Lead');
const User = require('../../../models/User');
const auditLogService = require('../../../services/crm/auditLog.service');
const crmSocketService = require('../../../services/crm/crmSocket.service');
const { generateCRMId } = require('../../../utils/crmIdGenerator');
const ApiResponse = require('../../../utils/ApiResponse');
const ApiError = require('../../../utils/ApiError');

/**
 * GET /api/admin/crm/follow-ups
 */
const getAllFollowUps = async (req, res) => {
  const {
    caller,
    lead,
    status,
    type,
    priority,
    dateFrom,
    dateTo,
    page = 1,
    limit = 20,
    sort = 'scheduledAt',
    sortBy = 'asc',
  } = req.query;

  const query = {};

  if (caller && mongoose.Types.ObjectId.isValid(caller)) {
    query.assignedTo = new mongoose.Types.ObjectId(caller);
  }
  if (lead && mongoose.Types.ObjectId.isValid(lead)) {
    query.lead = new mongoose.Types.ObjectId(lead);
  }
  if (status) query.status = status;
  if (type) query.type = type;
  if (priority) query.priority = priority;

  if (dateFrom || dateTo) {
    query.scheduledAt = {};
    if (dateFrom) query.scheduledAt.$gte = new Date(dateFrom);
    if (dateTo) query.scheduledAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sortDirection = sortBy === 'asc' ? 1 : -1;

  const [followups, total] = await Promise.all([
    CRMFollowUp.find(query)
      .populate('lead', 'leadId name phone requirementType status priority')
      .populate('assignedTo', 'name phone email staffId')
      .populate('createdBy', 'name role')
      .sort({ [sort]: sortDirection })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CRMFollowUp.countDocuments(query),
  ]);

  return res.json(
    new ApiResponse(200, followups, 'Follow-up tasks retrieved', {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    })
  );
};

/**
 * GET /api/admin/crm/follow-ups/today
 */
const getFollowUpsToday = async (req, res) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  req.query.dateFrom = start.toISOString();
  req.query.dateTo = end.toISOString();

  return getAllFollowUps(req, res);
};

/**
 * GET /api/admin/crm/follow-ups/overdue
 */
const getOverdueFollowUps = async (req, res) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const query = {
    scheduledAt: { $lt: startOfToday },
    status: 'pending',
  };

  if (req.query.caller && mongoose.Types.ObjectId.isValid(req.query.caller)) {
    query.assignedTo = new mongoose.Types.ObjectId(req.query.caller);
  }

  const followups = await CRMFollowUp.find(query)
    .populate('lead', 'leadId name phone requirementType status priority')
    .populate('assignedTo', 'name phone email staffId')
    .sort({ scheduledAt: 1 })
    .lean();

  return res.json(new ApiResponse(200, followups, 'Overdue follow-ups retrieved'));
};

/**
 * GET /api/admin/crm/follow-ups/:id
 */
const getFollowUpById = async (req, res) => {
  const { id } = req.params;

  let followUp = null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    followUp = await CRMFollowUp.findById(id)
      .populate('lead')
      .populate('assignedTo', 'name phone email staffId')
      .lean();
  }
  if (!followUp && id) {
    followUp = await CRMFollowUp.findOne({ followupId: id })
      .populate('lead')
      .populate('assignedTo', 'name phone email staffId')
      .lean();
  }

  if (!followUp) throw new ApiError(404, 'Follow-up not found');

  return res.json(new ApiResponse(200, followUp, 'Follow-up details retrieved'));
};

/**
 * POST /api/admin/crm/leads/:leadId/follow-ups
 */
const createLeadFollowUp = async (req, res) => {
  const { leadId } = req.params;
  const { scheduledAt, type = 'call', priority = 'medium', notes, assignedTo } = req.body;

  const lead = await CRMLead.findById(leadId);
  if (!lead) throw new ApiError(404, 'Lead not found');

  const assigneeId = assignedTo || lead.assignedTo || req.user._id;
  const followupId = generateCRMId('FLP');

  const followUp = await CRMFollowUp.create({
    followupId,
    lead: lead._id,
    type,
    scheduledAt: new Date(scheduledAt),
    priority,
    notes,
    assignedTo: assigneeId,
    createdBy: req.user._id,
    status: 'pending',
  });

  lead.nextFollowUpAt = new Date(scheduledAt);
  await lead.save();

  crmSocketService.followupCreated(followUp);

  await auditLogService.log({
    actor: req.user,
    action: 'FOLLOWUP_CREATED',
    entity: 'FollowUp',
    entityId: followUp._id,
    metadata: { leadId: lead.leadId, scheduledAt },
    req,
  });

  return res.status(201).json(new ApiResponse(201, followUp, 'Follow-up task created'));
};

/**
 * PATCH /api/admin/crm/follow-ups/:id
 */
const updateFollowUp = async (req, res) => {
  const { id } = req.params;
  const { scheduledAt, type, priority, notes, assignedTo } = req.body;

  const followUp = await CRMFollowUp.findById(id);
  if (!followUp) throw new ApiError(404, 'Follow-up not found');

  if (scheduledAt) followUp.scheduledAt = new Date(scheduledAt);
  if (type) followUp.type = type;
  if (priority) followUp.priority = priority;
  if (notes) followUp.notes = notes;
  if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) followUp.assignedTo = assignedTo;

  await followUp.save();

  return res.json(new ApiResponse(200, followUp, 'Follow-up updated'));
};

/**
 * PATCH /api/admin/crm/follow-ups/:id/complete
 */
const completeFollowUp = async (req, res) => {
  const { id } = req.params;
  const { completionNotes } = req.body;

  const followUp = await CRMFollowUp.findById(id);
  if (!followUp) throw new ApiError(404, 'Follow-up not found');

  followUp.status = 'completed';
  followUp.completedAt = new Date();
  followUp.completionNotes = completionNotes || 'Marked completed by Super Admin';
  await followUp.save();

  crmSocketService.followupCompleted(followUp);

  await auditLogService.log({
    actor: req.user,
    action: 'FOLLOWUP_COMPLETED',
    entity: 'FollowUp',
    entityId: followUp._id,
    metadata: { completionNotes },
    req,
  });

  return res.json(new ApiResponse(200, followUp, 'Follow-up marked as completed'));
};

/**
 * POST /api/admin/crm/follow-ups/:id/cancel
 */
const cancelFollowUp = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const followUp = await CRMFollowUp.findById(id);
  if (!followUp) throw new ApiError(404, 'Follow-up not found');

  followUp.status = 'cancelled';
  followUp.completionNotes = reason || 'Cancelled by Super Admin';
  await followUp.save();

  return res.json(new ApiResponse(200, followUp, 'Follow-up cancelled'));
};

module.exports = {
  getAllFollowUps,
  getFollowUpsToday,
  getOverdueFollowUps,
  getFollowUpById,
  createLeadFollowUp,
  updateFollowUp,
  completeFollowUp,
  cancelFollowUp,
};
