const CRMShortlist = require('../../models/crm/Shortlist');
const CRMLead = require('../../models/crm/Lead');
const { PropertyLead } = require('../../models/propertyLeadModel');
const { maskPropertyForTeleCaller } = require('../../services/crm/maskedInventory.service');
const { calculateMatchScore } = require('../../services/crm/matching.service');
const CRMLeadRequirement = require('../../models/crm/LeadRequirement');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { logCRMActivity } = require('../../services/crm/activity.service');

/**
 * POST /api/crm/leads/:leadId/shortlist
 * Add one or multiple properties to lead shortlist
 */
const addToShortlist = async (req, res) => {
  const { leadId } = req.params;
  const { propertyId, propertyIds, notes, position, clientInterest = 'pending' } = req.body;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const rawIds = propertyIds && Array.isArray(propertyIds) ? propertyIds : [propertyId];
  const targetIds = rawIds.filter(Boolean);

  if (targetIds.length === 0) {
    throw new ApiError(400, 'propertyId or propertyIds array is required');
  }

  const requirement = await CRMLeadRequirement.findOne({ lead: lead._id, isCurrent: true });

  const addedItems = [];

  for (const pid of targetIds) {
    const prop = await PropertyLead.findOne({
      $or: [{ _id: pid.match(/^[0-9a-fA-F]{24}$/) ? pid : null }, { leadId: pid }],
    });

    if (!prop) continue;

    // Check if already in shortlist (prevent duplicate)
    let item = await CRMShortlist.findOne({ lead: lead._id, property: prop._id });
    if (!item) {
      const match = calculateMatchScore(prop, requirement);
      const curCount = await CRMShortlist.countDocuments({ lead: lead._id });

      item = await CRMShortlist.create({
        lead: lead._id,
        property: prop._id,
        addedBy: req.user._id,
        notes: notes || '',
        position: position !== undefined ? Number(position) : curCount + 1,
        clientInterest,
        matchScore: match.matchScore,
        matchedCriteria: match.matchedCriteria,
      });

      addedItems.push(item);

      await logCRMActivity({
        action: 'property_shortlisted',
        entityType: 'CRMShortlist',
        entityId: item._id,
        performedBy: req.user,
        lead: lead._id,
        property: prop._id,
        metadata: { leadId: lead.leadId, propertyId: prop.leadId },
        req,
      });
    }
  }

  // If lead status is 'contacted' or 'qualified', upgrade to 'shortlisted'
  if (['new', 'contacted', 'qualified', 'matching'].includes(lead.status)) {
    lead.status = 'shortlisted';
    lead.statusHistory.push({
      status: 'shortlisted',
      changedBy: req.user._id,
      changedAt: new Date(),
      notes: 'Properties shortlisted for client',
    });
    await lead.save();
  }

  return res.status(201).json(
    new ApiResponse(
      201,
      { addedCount: addedItems.length, added: addedItems },
      'Properties added to shortlist successfully'
    )
  );
};

/**
 * POST /api/crm/leads/:leadId/shortlist/:propertyId
 */
const addSinglePropertyToShortlist = async (req, res) => {
  req.body.propertyId = req.params.propertyId;
  return addToShortlist(req, res);
};

/**
 * GET /api/crm/leads/:leadId/shortlist
 * Returns all shortlisted properties masked
 */
const getLeadShortlist = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const shortlistItems = await CRMShortlist.find({ lead: lead._id })
    .populate('property')
    .populate('addedBy', 'name staffId role')
    .sort({ position: 1, createdAt: -1 })
    .lean();

  const formatted = shortlistItems
    .map((item) => {
      if (!item.property) return null;
      return {
        _id: item._id,
        shortlistId: item._id,
        property: maskPropertyForTeleCaller(item.property),
        addedBy: item.addedBy,
        notes: item.notes,
        position: item.position,
        clientInterest: item.clientInterest,
        matchScore: item.matchScore,
        matchedCriteria: item.matchedCriteria,
        createdAt: item.createdAt,
      };
    })
    .filter(Boolean);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        leadId: lead.leadId,
        total: formatted.length,
        shortlist: formatted,
      },
      'Shortlist fetched successfully'
    )
  );
};

/**
 * PATCH /api/crm/leads/:leadId/shortlist/:propertyId
 * Update interest, notes, or position of a shortlisted property
 */
const updateShortlistItem = async (req, res) => {
  const { leadId, propertyId } = req.params;
  const { notes, clientInterest, position } = req.body;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const prop = await PropertyLead.findOne({
    $or: [{ _id: propertyId.match(/^[0-9a-fA-F]{24}$/) ? propertyId : null }, { leadId: propertyId }],
  });
  if (!prop) throw new ApiError(404, 'Property not found');

  const item = await CRMShortlist.findOne({ lead: lead._id, property: prop._id });
  if (!item) throw new ApiError(404, 'Property not found in this lead shortlist');

  if (notes !== undefined) item.notes = notes;
  if (clientInterest) item.clientInterest = clientInterest;
  if (position !== undefined) item.position = Number(position);

  await item.save();

  return res
    .status(200)
    .json(new ApiResponse(200, { item }, 'Shortlist item updated successfully'));
};

/**
 * DELETE /api/crm/leads/:leadId/shortlist/:propertyId
 */
const removePropertyFromShortlist = async (req, res) => {
  const { leadId, propertyId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const prop = await PropertyLead.findOne({
    $or: [{ _id: propertyId.match(/^[0-9a-fA-F]{24}$/) ? propertyId : null }, { leadId: propertyId }],
  });
  if (!prop) throw new ApiError(404, 'Property not found');

  await CRMShortlist.findOneAndDelete({ lead: lead._id, property: prop._id });

  await logCRMActivity({
    action: 'property_removed_from_shortlist',
    entityType: 'CRMShortlist',
    entityId: `${lead._id}_${prop._id}`,
    performedBy: req.user,
    lead: lead._id,
    property: prop._id,
    req,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, null, 'Property removed from shortlist'));
};

/**
 * DELETE /api/crm/leads/:leadId/shortlist
 */
const clearLeadShortlist = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  await CRMShortlist.deleteMany({ lead: lead._id });

  return res.status(200).json(new ApiResponse(200, null, 'Shortlist cleared'));
};

/**
 * GET /api/crm/leads/:leadId/shortlist/history
 */
const getShortlistHistory = async (req, res) => {
  return getLeadShortlist(req, res);
};

module.exports = {
  addToShortlist,
  addSinglePropertyToShortlist,
  getLeadShortlist,
  updateShortlistItem,
  removePropertyFromShortlist,
  clearLeadShortlist,
  getShortlistHistory,
};
