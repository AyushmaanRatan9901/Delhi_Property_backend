const CRMCall = require('../../models/crm/Call');
const CRMCallSummary = require('../../models/crm/CallSummary');
const CRMLeadRequirement = require('../../models/crm/LeadRequirement');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { logCRMActivity } = require('../../services/crm/activity.service');

/**
 * Heuristic/AI extraction parser from notes/transcript
 */
const extractStructuredCallSummary = (text, defaultValues = {}) => {
  const content = (text || '').toLowerCase();

  // BHK detection
  let bhk = defaultValues.bhk;
  if (!bhk) {
    if (content.includes('1 bhk') || content.includes('1bhk')) bhk = 1;
    else if (content.includes('2 bhk') || content.includes('2bhk')) bhk = 2;
    else if (content.includes('3 bhk') || content.includes('3bhk')) bhk = 3;
    else if (content.includes('4 bhk') || content.includes('4bhk')) bhk = 4;
  }

  // Purpose (rent / sale / mortgage)
  let purpose = defaultValues.purpose || 'rent';
  if (content.includes('buy') || content.includes('purchase') || content.includes('sale')) {
    purpose = 'sale';
  } else if (content.includes('mortgage') || content.includes('loan')) {
    purpose = 'mortgage';
  }

  // Furnishing
  let furnishing = defaultValues.furnishing || 'semi_furnished';
  if (content.includes('fully') || content.includes('full furnish')) {
    furnishing = 'fully_furnished';
  } else if (content.includes('unfurnish') || content.includes('raw') || content.includes('bare')) {
    furnishing = 'unfurnished';
  }

  // Interest Level
  let interestLevel = defaultValues.interestLevel || 'medium';
  if (content.includes('very interested') || content.includes('ready to visit') || content.includes('urgent') || content.includes('immediately')) {
    interestLevel = 'high';
  } else if (content.includes('not interested') || content.includes('wrong number') || content.includes('cancelled')) {
    interestLevel = 'not_interested';
  } else if (content.includes('later') || content.includes('thinking')) {
    interestLevel = 'low';
  }

  return {
    customerRequirement: defaultValues.customerRequirement || `${bhk ? `${bhk} BHK ` : ''}${purpose} property in Delhi NCR`,
    bhk: bhk || 2,
    locality: defaultValues.locality || ['Delhi NCR'],
    budget: {
      min: defaultValues.budget?.min || 15000,
      max: defaultValues.budget?.max || 35000,
    },
    purpose,
    furnishing,
    preferredDate: defaultValues.preferredDate || 'within 15-30 days',
    interestLevel,
    objections: defaultValues.objections || [],
    nextAction: defaultValues.nextAction || 'Send shortlisted property links via WhatsApp',
    summary:
      defaultValues.summary ||
      `Client inquired about a ${bhk ? `${bhk} BHK ` : ''}${purpose} property. Expressed ${interestLevel} interest.`,
  };
};

/**
 * POST /api/crm/calls/:callId/summary
 */
const generateCallSummary = async (req, res) => {
  const { callId } = req.params;
  const {
    transcript,
    customerRequirement,
    bhk,
    locality,
    budget,
    purpose,
    furnishing,
    preferredDate,
    interestLevel,
    objections,
    nextAction,
    summary,
  } = req.body;

  const call = await CRMCall.findOne({
    $or: [{ _id: callId.match(/^[0-9a-fA-F]{24}$/) ? callId : null }, { callId }],
  });
  if (!call) throw new ApiError(404, 'Call record not found');

  const parsed = extractStructuredCallSummary(transcript || call.notes || '', {
    customerRequirement,
    bhk,
    locality,
    budget,
    purpose,
    furnishing,
    preferredDate,
    interestLevel,
    objections,
    nextAction,
    summary,
  });

  const callSummary = await CRMCallSummary.create({
    call: call._id,
    lead: call.lead,
    customerRequirement: parsed.customerRequirement,
    bhk: parsed.bhk,
    locality: parsed.locality,
    budget: parsed.budget,
    purpose: parsed.purpose,
    furnishing: parsed.furnishing,
    preferredDate: parsed.preferredDate,
    interestLevel: parsed.interestLevel,
    objections: parsed.objections,
    nextAction: parsed.nextAction,
    summary: parsed.summary,
    transcript: transcript || call.notes,
    rawAIResponse: { generatedAt: new Date(), source: 'CRM AI Engine v1.0' },
    generatedBy: req.user._id,
  });

  call.summary = callSummary._id;
  await call.save();

  await logCRMActivity({
    action: 'call_summary_created',
    entityType: 'CRMCallSummary',
    entityId: callSummary._id,
    performedBy: req.user,
    lead: call.lead,
    metadata: { callId: call.callId, summary: callSummary.summary },
    req,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { summary: callSummary }, 'Call summary generated successfully'));
};

/**
 * GET /api/crm/calls/:callId/summary
 */
const getCallSummary = async (req, res) => {
  const { callId } = req.params;

  const call = await CRMCall.findOne({
    $or: [{ _id: callId.match(/^[0-9a-fA-F]{24}$/) ? callId : null }, { callId }],
  });
  if (!call) throw new ApiError(404, 'Call record not found');

  const summary = await CRMCallSummary.findOne({ call: call._id })
    .populate('generatedBy', 'name staffId')
    .lean();

  if (!summary) throw new ApiError(404, 'No summary found for this call');

  return res
    .status(200)
    .json(new ApiResponse(200, { summary }, 'Call summary fetched successfully'));
};

/**
 * POST /api/crm/calls/:callId/summary/regenerate
 */
const regenerateCallSummary = async (req, res) => {
  const { callId } = req.params;
  const call = await CRMCall.findOne({
    $or: [{ _id: callId.match(/^[0-9a-fA-F]{24}$/) ? callId : null }, { callId }],
  });
  if (!call) throw new ApiError(404, 'Call record not found');

  // Delete previous summary if exists
  await CRMCallSummary.deleteMany({ call: call._id });

  return generateCallSummary(req, res);
};

/**
 * PATCH /api/crm/calls/:callId/summary/requirements
 * Sync AI-extracted summary parameters to the Lead's current requirement
 */
const applySummaryToRequirements = async (req, res) => {
  const { callId } = req.params;

  const call = await CRMCall.findOne({
    $or: [{ _id: callId.match(/^[0-9a-fA-F]{24}$/) ? callId : null }, { callId }],
  });
  if (!call) throw new ApiError(404, 'Call record not found');

  const summary = await CRMCallSummary.findOne({ call: call._id });
  if (!summary) throw new ApiError(404, 'Call summary not found');

  // Archive prior requirement and create new version
  const prevCount = await CRMLeadRequirement.countDocuments({ lead: call.lead });
  await CRMLeadRequirement.updateMany({ lead: call.lead }, { isCurrent: false });

  const updatedReq = await CRMLeadRequirement.create({
    lead: call.lead,
    version: prevCount + 1,
    isCurrent: true,
    requirementType: summary.purpose || 'rent',
    bhk: summary.bhk ? [summary.bhk] : [],
    localities: summary.locality || [],
    budgetMin: summary.budget?.min || 0,
    budgetMax: summary.budget?.max || 0,
    furnishing: summary.furnishing || 'any',
    notes: `Generated from AI Call Summary (${call.callId}): ${summary.summary}`,
    source: 'ai_call_summary',
    createdBy: req.user._id,
  });

  summary.isAppliedToRequirement = true;
  await summary.save();

  await logCRMActivity({
    action: 'requirement_updated_from_summary',
    entityType: 'CRMLeadRequirement',
    entityId: updatedReq._id,
    performedBy: req.user,
    lead: call.lead,
    metadata: { version: updatedReq.version, callId: call.callId },
    req,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { requirement: updatedReq, summary },
      'AI summary applied to client requirement successfully'
    )
  );
};

module.exports = {
  generateCallSummary,
  getCallSummary,
  regenerateCallSummary,
  applySummaryToRequirements,
};
