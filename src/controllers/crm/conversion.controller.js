const CRMLead = require('../../models/crm/Lead');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { logCRMActivity } = require('../../services/crm/activity.service');

/**
 * PATCH /api/crm/leads/:leadId/convert
 * Mark a lead as successfully converted
 */
const convertLead = async (req, res) => {
  const { leadId } = req.params;
  const { propertyId, dealAmount, agreementNumber, notes } = req.body;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  lead.status = 'converted';
  lead.convertedAt = new Date();
  lead.convertedDealDetails = {
    propertyId,
    dealAmount: Number(dealAmount) || 0,
    agreementNumber: agreementNumber || '',
    notes: notes || '',
    convertedBy: req.user._id,
  };

  lead.statusHistory.push({
    status: 'converted',
    changedBy: req.user._id,
    changedAt: new Date(),
    notes: notes || `Lead converted successfully (Deal: ₹${dealAmount || 0})`,
  });

  await lead.save();

  await logCRMActivity({
    action: 'lead_converted',
    entityType: 'CRMLead',
    entityId: lead._id,
    performedBy: req.user,
    lead: lead._id,
    metadata: { dealAmount, agreementNumber },
    req,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { lead }, 'Lead converted successfully'));
};

/**
 * PATCH /api/crm/leads/:leadId/lost
 * Mark a lead as lost with required reason
 */
const markLeadAsLost = async (req, res) => {
  const { leadId } = req.params;
  const { reason, notes } = req.body;

  const validReasons = [
    'budget_too_low',
    'location_not_available',
    'not_interested',
    'found_elsewhere',
    'duplicate',
    'wrong_number',
    'no_response',
    'requirement_changed',
    'other',
  ];

  if (!reason || !validReasons.includes(reason)) {
    throw new ApiError(400, `Valid lost reason is required: ${validReasons.join(', ')}`);
  }

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  lead.status = 'lost';
  lead.lostReason = reason;
  lead.lostNotes = notes || '';

  lead.statusHistory.push({
    status: 'lost',
    changedBy: req.user._id,
    changedAt: new Date(),
    notes: `Lost Reason: ${reason}. Notes: ${notes || 'None'}`,
  });

  await lead.save();

  await logCRMActivity({
    action: 'lead_lost',
    entityType: 'CRMLead',
    entityId: lead._id,
    performedBy: req.user,
    lead: lead._id,
    metadata: { lostReason: reason, lostNotes: notes },
    req,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { lead }, 'Lead marked as lost'));
};

/**
 * POST /api/crm/leads/:leadId/lost-reason
 */
const setLostReason = async (req, res) => {
  return markLeadAsLost(req, res);
};

module.exports = {
  convertLead,
  markLeadAsLost,
  setLostReason,
};
