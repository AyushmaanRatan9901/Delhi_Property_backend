const CRMCall = require('../../models/crm/Call');
const CRMLead = require('../../models/crm/Lead');
const CRMFollowUp = require('../../models/crm/FollowUp');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { generateCRMId } = require('../../utils/crmIdGenerator');
const { logCRMActivity } = require('../../services/crm/activity.service');

/**
 * POST /api/crm/calls/start
 * Initiate a call session with a lead
 */
const startCall = async (req, res) => {
  const { leadId, phoneNumber } = req.body;

  if (!leadId) {
    throw new ApiError(400, 'leadId is required to start a call');
  }

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const callId = generateCRMId('CALL');

  const call = await CRMCall.create({
    callId,
    lead: lead._id,
    teleCaller: req.user._id,
    phoneNumber: phoneNumber || lead.phone,
    startedAt: new Date(),
    outcome: 'in_progress',
  });

  // Update lead's lastContactedAt
  lead.lastContactedAt = new Date();
  if (lead.status === 'new') {
    lead.status = 'contacted';
    lead.statusHistory.push({
      status: 'contacted',
      changedBy: req.user._id,
      changedAt: new Date(),
      notes: 'First call initiated',
    });
  }
  await lead.save();

  await logCRMActivity({
    action: 'call_started',
    entityType: 'CRMCall',
    entityId: call._id,
    performedBy: req.user,
    lead: lead._id,
    metadata: { callId: call.callId, phone: call.phoneNumber },
    req,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { call }, 'Call session started successfully'));
};

/**
 * POST /api/crm/calls/:callId/end
 * Conclude a call session with outcome, notes, and duration
 */
const endCall = async (req, res) => {
  const { callId } = req.params;
  const { outcome, notes, duration, scheduleFollowUp } = req.body;

  const call = await CRMCall.findOne({
    $or: [{ _id: callId.match(/^[0-9a-fA-F]{24}$/) ? callId : null }, { callId }],
  });
  if (!call) throw new ApiError(404, 'Call record not found');

  call.endedAt = new Date();
  if (duration !== undefined) {
    call.duration = Number(duration);
  } else if (call.startedAt) {
    call.duration = Math.round((call.endedAt - call.startedAt) / 1000);
  }

  if (outcome) call.outcome = outcome;
  if (notes) call.notes = notes;

  // Optional: Schedule follow-up directly when ending a call
  if (scheduleFollowUp && scheduleFollowUp.scheduledAt) {
    const flpId = generateCRMId('FLP');
    const followUp = await CRMFollowUp.create({
      followupId: flpId,
      lead: call.lead,
      type: scheduleFollowUp.type || 'call',
      scheduledAt: new Date(scheduleFollowUp.scheduledAt),
      priority: scheduleFollowUp.priority || 'medium',
      notes: scheduleFollowUp.notes || `Scheduled from call ${call.callId}`,
      assignedTo: req.user._id,
      createdBy: req.user._id,
    });
    call.followUpScheduled = followUp._id;

    // Update lead nextFollowUpAt
    await CRMLead.findByIdAndUpdate(call.lead, {
      nextFollowUpAt: new Date(scheduleFollowUp.scheduledAt),
    });
  }

  await call.save();

  await logCRMActivity({
    action: 'call_completed',
    entityType: 'CRMCall',
    entityId: call._id,
    performedBy: req.user,
    lead: call.lead,
    metadata: { callId: call.callId, outcome: call.outcome, duration: call.duration },
    req,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { call }, 'Call session ended successfully'));
};

/**
 * GET /api/crm/calls/:callId
 */
const getCallById = async (req, res) => {
  const { callId } = req.params;

  const call = await CRMCall.findOne({
    $or: [{ _id: callId.match(/^[0-9a-fA-F]{24}$/) ? callId : null }, { callId }],
  })
    .populate('lead', 'leadId name phone requirementType status')
    .populate('teleCaller', 'name staffId role profilePhoto')
    .populate('summary')
    .populate('followUpScheduled');

  if (!call) throw new ApiError(404, 'Call record not found');

  return res.status(200).json(new ApiResponse(200, { call }, 'Call details fetched'));
};

/**
 * PATCH /api/crm/calls/:callId
 */
const updateCall = async (req, res) => {
  const { callId } = req.params;
  const { outcome, notes, duration } = req.body;

  const call = await CRMCall.findOne({
    $or: [{ _id: callId.match(/^[0-9a-fA-F]{24}$/) ? callId : null }, { callId }],
  });
  if (!call) throw new ApiError(404, 'Call record not found');

  if (outcome) call.outcome = outcome;
  if (notes !== undefined) call.notes = notes;
  if (duration !== undefined) call.duration = Number(duration);

  await call.save();

  return res.status(200).json(new ApiResponse(200, { call }, 'Call updated successfully'));
};

/**
 * PATCH /api/crm/calls/:callId/outcome
 */
const updateCallOutcome = async (req, res) => {
  const { callId } = req.params;
  const { outcome, notes } = req.body;

  if (!outcome) throw new ApiError(400, 'outcome is required');

  const call = await CRMCall.findOne({
    $or: [{ _id: callId.match(/^[0-9a-fA-F]{24}$/) ? callId : null }, { callId }],
  });
  if (!call) throw new ApiError(404, 'Call record not found');

  call.outcome = outcome;
  if (notes) call.notes = notes;
  await call.save();

  return res
    .status(200)
    .json(new ApiResponse(200, { call }, 'Call outcome updated successfully'));
};

/**
 * GET /api/crm/calls
 */
const getAllCalls = async (req, res) => {
  const { page = 1, limit = 20, outcome, teleCallerId } = req.query;

  const filter = {};
  if (req.user.role === 'tele_caller') {
    filter.teleCaller = req.user._id;
  } else if (teleCallerId) {
    filter.teleCaller = teleCallerId;
  }

  if (outcome && outcome !== 'ALL') {
    filter.outcome = outcome;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [calls, total] = await Promise.all([
    CRMCall.find(filter)
      .populate('lead', 'leadId name phone requirementType')
      .populate('teleCaller', 'name staffId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CRMCall.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        calls,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)) || 1,
        },
      },
      'Calls fetched successfully'
    )
  );
};

/**
 * GET /api/crm/leads/:leadId/calls
 */
const getCallsForLead = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const calls = await CRMCall.find({ lead: lead._id })
    .populate('teleCaller', 'name staffId')
    .populate('summary')
    .sort({ createdAt: -1 })
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, { calls }, 'Lead call history fetched successfully'));
};

module.exports = {
  startCall,
  endCall,
  getCallById,
  updateCall,
  updateCallOutcome,
  getAllCalls,
  getCallsForLead,
};
