const CRMFollowUp = require('../../models/crm/FollowUp');
const CRMLead = require('../../models/crm/Lead');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { generateCRMId } = require('../../utils/crmIdGenerator');
const { logCRMActivity } = require('../../services/crm/activity.service');

/**
 * POST /api/crm/followups
 */
const createFollowUp = async (req, res) => {
  const { leadId, type = 'call', scheduledAt, priority = 'medium', notes, assignedTo } = req.body;

  if (!leadId || !scheduledAt) {
    throw new ApiError(400, 'leadId and scheduledAt are required');
  }

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const followupId = generateCRMId('FLP');

  const followUp = await CRMFollowUp.create({
    followupId,
    lead: lead._id,
    type,
    scheduledAt: new Date(scheduledAt),
    priority,
    notes,
    assignedTo: assignedTo || req.user._id,
    createdBy: req.user._id,
  });

  // Update nextFollowUpAt on the lead
  lead.nextFollowUpAt = new Date(scheduledAt);
  await lead.save();

  await logCRMActivity({
    action: 'followup_created',
    entityType: 'CRMFollowUp',
    entityId: followUp._id,
    performedBy: req.user,
    lead: lead._id,
    metadata: { followupId: followUp.followupId, type, scheduledAt },
    req,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { followUp }, 'Follow-up created successfully'));
};

/**
 * GET /api/crm/followups
 */
const getFollowUps = async (req, res) => {
  const { page = 1, limit = 20, status, type, priority, assignedTo } = req.query;

  const filter = {};
  if (req.user.role === 'tele_caller') {
    filter.assignedTo = req.user._id;
  } else if (assignedTo) {
    filter.assignedTo = assignedTo;
  }

  if (status && status !== 'ALL') filter.status = status;
  if (type && type !== 'ALL') filter.type = type;
  if (priority && priority !== 'ALL') filter.priority = priority;

  const skip = (Number(page) - 1) * Number(limit);

  const [followups, total] = await Promise.all([
    CRMFollowUp.find(filter)
      .populate('lead', 'leadId name phone requirementType priority status')
      .populate('assignedTo', 'name staffId role')
      .sort({ scheduledAt: 1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CRMFollowUp.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        followups,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)) || 1,
        },
      },
      'Follow-ups fetched successfully'
    )
  );
};

/**
 * GET /api/crm/followups/:followupId
 */
const getFollowUpById = async (req, res) => {
  const { followupId } = req.params;

  const followUp = await CRMFollowUp.findOne({
    $or: [{ _id: followupId.match(/^[0-9a-fA-F]{24}$/) ? followupId : null }, { followupId }],
  })
    .populate('lead', 'leadId name phone requirementType priority status')
    .populate('assignedTo', 'name staffId role')
    .lean();

  if (!followUp) throw new ApiError(404, 'Follow-up not found');

  return res.status(200).json(new ApiResponse(200, { followUp }, 'Follow-up fetched'));
};

/**
 * PATCH /api/crm/followups/:followupId
 */
const updateFollowUp = async (req, res) => {
  const { followupId } = req.params;
  const { type, scheduledAt, priority, notes, assignedTo } = req.body;

  const followUp = await CRMFollowUp.findOne({
    $or: [{ _id: followupId.match(/^[0-9a-fA-F]{24}$/) ? followupId : null }, { followupId }],
  });
  if (!followUp) throw new ApiError(404, 'Follow-up not found');

  if (type) followUp.type = type;
  if (scheduledAt) followUp.scheduledAt = new Date(scheduledAt);
  if (priority) followUp.priority = priority;
  if (notes !== undefined) followUp.notes = notes;
  if (assignedTo) followUp.assignedTo = assignedTo;

  await followUp.save();

  return res.status(200).json(new ApiResponse(200, { followUp }, 'Follow-up updated'));
};

/**
 * PATCH /api/crm/followups/:followupId/complete
 */
const completeFollowUp = async (req, res) => {
  const { followupId } = req.params;
  const { completionNotes } = req.body;

  const followUp = await CRMFollowUp.findOne({
    $or: [{ _id: followupId.match(/^[0-9a-fA-F]{24}$/) ? followupId : null }, { followupId }],
  });
  if (!followUp) throw new ApiError(404, 'Follow-up not found');

  followUp.status = 'completed';
  followUp.completedAt = new Date();
  followUp.completionNotes = completionNotes || 'Completed';
  await followUp.save();

  await logCRMActivity({
    action: 'followup_completed',
    entityType: 'CRMFollowUp',
    entityId: followUp._id,
    performedBy: req.user,
    lead: followUp.lead,
    req,
  });

  return res.status(200).json(new ApiResponse(200, { followUp }, 'Follow-up completed'));
};

/**
 * PATCH /api/crm/followups/:followupId/cancel
 */
const cancelFollowUp = async (req, res) => {
  const { followupId } = req.params;

  const followUp = await CRMFollowUp.findOne({
    $or: [{ _id: followupId.match(/^[0-9a-fA-F]{24}$/) ? followupId : null }, { followupId }],
  });
  if (!followUp) throw new ApiError(404, 'Follow-up not found');

  followUp.status = 'cancelled';
  await followUp.save();

  return res.status(200).json(new ApiResponse(200, { followUp }, 'Follow-up cancelled'));
};

/**
 * PATCH /api/crm/followups/:followupId/snooze
 */
const snoozeFollowUp = async (req, res) => {
  const { followupId } = req.params;
  const { snoozeUntil, snoozeHours = 24 } = req.body;

  const followUp = await CRMFollowUp.findOne({
    $or: [{ _id: followupId.match(/^[0-9a-fA-F]{24}$/) ? followupId : null }, { followupId }],
  });
  if (!followUp) throw new ApiError(404, 'Follow-up not found');

  let nextDate = snoozeUntil ? new Date(snoozeUntil) : new Date();
  if (!snoozeUntil) {
    nextDate.setHours(nextDate.getHours() + Number(snoozeHours));
  }

  followUp.status = 'snoozed';
  followUp.snoozedUntil = nextDate;
  followUp.scheduledAt = nextDate;
  followUp.snoozeCount = (followUp.snoozeCount || 0) + 1;
  await followUp.save();

  await CRMLead.findByIdAndUpdate(followUp.lead, { nextFollowUpAt: nextDate });

  return res
    .status(200)
    .json(new ApiResponse(200, { followUp }, 'Follow-up snoozed successfully'));
};

/**
 * GET /api/crm/followups/today
 */
const getTodayFollowUps = async (req, res) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const filter = {
    scheduledAt: { $gte: start, $lte: end },
    status: { $in: ['pending', 'snoozed'] },
  };

  if (req.user.role === 'tele_caller') filter.assignedTo = req.user._id;

  const followups = await CRMFollowUp.find(filter)
    .populate('lead', 'leadId name phone requirementType priority')
    .sort({ scheduledAt: 1 })
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, { followups }, "Today's follow-ups fetched"));
};

/**
 * GET /api/crm/followups/overdue
 */
const getOverdueFollowUps = async (req, res) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const filter = {
    scheduledAt: { $lt: startOfToday },
    status: { $in: ['pending', 'snoozed'] },
  };

  if (req.user.role === 'tele_caller') filter.assignedTo = req.user._id;

  const followups = await CRMFollowUp.find(filter)
    .populate('lead', 'leadId name phone requirementType priority')
    .sort({ scheduledAt: 1 })
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, { followups }, 'Overdue follow-ups fetched'));
};

/**
 * GET /api/crm/leads/:leadId/followups
 */
const getFollowUpsForLead = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const followups = await CRMFollowUp.find({ lead: lead._id })
    .populate('assignedTo', 'name staffId')
    .sort({ scheduledAt: -1 })
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, { followups }, 'Lead follow-ups fetched'));
};

module.exports = {
  createFollowUp,
  getFollowUps,
  getFollowUpById,
  updateFollowUp,
  completeFollowUp,
  cancelFollowUp,
  snoozeFollowUp,
  getTodayFollowUps,
  getOverdueFollowUps,
  getFollowUpsForLead,
};
