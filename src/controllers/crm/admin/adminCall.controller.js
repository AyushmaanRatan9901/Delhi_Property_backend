const mongoose = require('mongoose');
const CRMCall = require('../../../models/crm/Call');
const CRMCallSummary = require('../../../models/crm/CallSummary');
const CRMLead = require('../../../models/crm/Lead');
const telephonyService = require('../../../services/crm/telephony.service');
const aiCallSummaryService = require('../../../services/crm/aiCallSummary.service');
const ApiResponse = require('../../../utils/ApiResponse');
const ApiError = require('../../../utils/ApiError');

/**
 * GET /api/admin/crm/calls
 * Retrieve calls across all tele-callers with filters
 */
const getAllCalls = async (req, res) => {
  const {
    caller,
    lead,
    dateFrom,
    dateTo,
    outcome,
    minDuration,
    maxDuration,
    direction,
    page = 1,
    limit = 20,
    sort = 'startedAt',
    sortBy = 'desc',
  } = req.query;

  const query = {};

  if (caller && mongoose.Types.ObjectId.isValid(caller)) {
    query.teleCaller = new mongoose.Types.ObjectId(caller);
  }
  if (lead && mongoose.Types.ObjectId.isValid(lead)) {
    query.lead = new mongoose.Types.ObjectId(lead);
  }
  if (outcome) query.outcome = outcome;
  if (direction) query.direction = direction;

  if (dateFrom || dateTo) {
    query.startedAt = {};
    if (dateFrom) query.startedAt.$gte = new Date(dateFrom);
    if (dateTo) query.startedAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }

  if (minDuration || maxDuration) {
    query.duration = {};
    if (minDuration) query.duration.$gte = Number(minDuration);
    if (maxDuration) query.duration.$lte = Number(maxDuration);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sortDirection = sortBy === 'asc' ? 1 : -1;

  const [calls, total] = await Promise.all([
    CRMCall.find(query)
      .populate('teleCaller', 'name phone email staffId')
      .populate('lead', 'leadId name phone requirementType status')
      .populate('summary')
      .sort({ [sort]: sortDirection })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CRMCall.countDocuments(query),
  ]);

  // Format recordings with protected URL
  const formattedCalls = calls.map((call) => ({
    ...call,
    recordingUrl: call.recording?.url
      ? telephonyService.generateSecureRecordingUrl(call._id, call.recording.url)
      : null,
  }));

  return res.json(
    new ApiResponse(200, formattedCalls, 'Call logs retrieved successfully', {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    })
  );
};

/**
 * GET /api/admin/crm/calls/:callId
 */
const getCallById = async (req, res) => {
  const { callId } = req.params;

  let call = null;
  if (mongoose.Types.ObjectId.isValid(callId)) {
    call = await CRMCall.findById(callId)
      .populate('teleCaller', 'name phone email staffId')
      .populate('lead', 'leadId name phone requirementType status')
      .populate('summary')
      .lean();
  }
  if (!call && callId) {
    call = await CRMCall.findOne({ callId })
      .populate('teleCaller', 'name phone email staffId')
      .populate('lead', 'leadId name phone requirementType status')
      .populate('summary')
      .lean();
  }

  if (!call) throw new ApiError(404, 'Call log not found');

  const responseCall = {
    ...call,
    recordingUrl: call.recording?.url
      ? telephonyService.generateSecureRecordingUrl(call._id, call.recording.url)
      : null,
  };

  return res.json(new ApiResponse(200, responseCall, 'Call details retrieved successfully'));
};

/**
 * GET /api/admin/crm/calls/:callId/summary
 * AI Call Summary Endpoint
 */
const getCallSummary = async (req, res) => {
  const { callId } = req.params;

  const call = await CRMCall.findById(callId).populate('lead', 'name phone').populate('summary');
  if (!call) throw new ApiError(404, 'Call log not found');

  if (call.summary) {
    return res.json(new ApiResponse(200, call.summary, 'Existing AI Call summary retrieved'));
  }

  // Generate on-the-fly summary via AI service
  const aiSummary = await aiCallSummaryService.generateSummary({
    callNotes: call.notes,
    transcript: call.transcript,
    leadName: call.lead?.name,
    leadPhone: call.lead?.phone,
  });

  return res.json(new ApiResponse(200, aiSummary, 'AI Call summary generated successfully'));
};

const getLeadCalls = async (req, res) => {
  req.query.lead = req.params.leadId;
  return getAllCalls(req, res);
};

const getCallerCalls = async (req, res) => {
  req.query.caller = req.params.callerId;
  return getAllCalls(req, res);
};

module.exports = {
  getAllCalls,
  getCallById,
  getCallSummary,
  getLeadCalls,
  getCallerCalls,
};
