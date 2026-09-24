const CRMLead = require('../../models/crm/Lead');
const CRMLeadRequirement = require('../../models/crm/LeadRequirement');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { logCRMActivity } = require('../../services/crm/activity.service');

/**
 * GET /api/crm/leads/:leadId/requirement
 */
const getLeadRequirement = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const requirement = await CRMLeadRequirement.findOne({
    lead: lead._id,
    isCurrent: true,
  }).populate('createdBy', 'name staffId role');

  return res.status(200).json(
    new ApiResponse(
      200,
      { requirement: requirement || null },
      'Lead requirement fetched successfully'
    )
  );
};

/**
 * POST /api/crm/leads/:leadId/requirement
 * Set or update current requirement (archives previous as historical version)
 */
const saveLeadRequirement = async (req, res) => {
  const { leadId } = req.params;
  const {
    requirementType = 'rent',
    propertyType,
    bhk,
    localities,
    city,
    budgetMin,
    budgetMax,
    preferredAreaMin,
    preferredAreaMax,
    furnishing,
    possessionDate,
    preferredFloor,
    preferredAmenities,
    additionalRequirements,
    notes,
    source = 'manual',
  } = req.body;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  // Mark all existing requirements as historical
  const prevCount = await CRMLeadRequirement.countDocuments({ lead: lead._id });
  await CRMLeadRequirement.updateMany({ lead: lead._id }, { isCurrent: false });

  const newRequirement = await CRMLeadRequirement.create({
    lead: lead._id,
    version: prevCount + 1,
    isCurrent: true,
    requirementType,
    propertyType: Array.isArray(propertyType) ? propertyType : propertyType ? [propertyType] : [],
    bhk: Array.isArray(bhk) ? bhk.map(Number) : bhk ? [Number(bhk)] : [],
    localities: Array.isArray(localities) ? localities : localities ? [localities] : [],
    city: city || 'Delhi NCR',
    budgetMin: Number(budgetMin) || 0,
    budgetMax: Number(budgetMax) || 0,
    preferredAreaMin: preferredAreaMin ? Number(preferredAreaMin) : undefined,
    preferredAreaMax: preferredAreaMax ? Number(preferredAreaMax) : undefined,
    furnishing: furnishing || 'any',
    possessionDate: possessionDate ? new Date(possessionDate) : undefined,
    preferredFloor,
    preferredAmenities: Array.isArray(preferredAmenities) ? preferredAmenities : [],
    additionalRequirements,
    notes,
    source,
    createdBy: req.user._id,
  });

  // Also update lead's requirementType
  if (lead.requirementType !== requirementType) {
    lead.requirementType = requirementType;
    await lead.save();
  }

  await logCRMActivity({
    action: prevCount > 0 ? 'requirement_updated' : 'requirement_created',
    entityType: 'CRMLeadRequirement',
    entityId: newRequirement._id,
    performedBy: req.user,
    lead: lead._id,
    metadata: { version: newRequirement.version, budgetMax, localities },
    req,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { requirement: newRequirement },
      'Lead requirement saved successfully'
    )
  );
};

/**
 * PATCH /api/crm/leads/:leadId/requirement
 */
const patchLeadRequirement = async (req, res) => {
  return saveLeadRequirement(req, res);
};

/**
 * GET /api/crm/leads/:leadId/requirement/history
 */
const getRequirementHistory = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const history = await CRMLeadRequirement.find({ lead: lead._id })
    .populate('createdBy', 'name staffId role')
    .sort({ version: -1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(200, { history }, 'Requirement history fetched successfully')
  );
};

module.exports = {
  getLeadRequirement,
  saveLeadRequirement,
  patchLeadRequirement,
  getRequirementHistory,
};
