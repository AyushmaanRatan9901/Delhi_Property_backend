const mongoose = require('mongoose');
const CRMShortlist = require('../../../models/crm/Shortlist');
const CRMLead = require('../../../models/crm/Lead');
const PropertyLead = require('../../../models/propertyLeadModel');
const auditLogService = require('../../../services/crm/auditLog.service');
const ApiResponse = require('../../../utils/ApiResponse');
const ApiError = require('../../../utils/ApiError');

/**
 * GET /api/admin/crm/leads/:leadId/shortlists
 */
const getLeadShortlists = async (req, res) => {
  const { leadId } = req.params;

  const shortlists = await CRMShortlist.find({ lead: leadId })
    .populate('property')
    .populate('teleCaller', 'name email staffId')
    .sort({ createdAt: -1 })
    .lean();

  return res.json(new ApiResponse(200, shortlists, 'Lead shortlisted properties retrieved'));
};

/**
 * GET /api/admin/crm/callers/:callerId/shortlists
 */
const getCallerShortlists = async (req, res) => {
  const { callerId } = req.params;

  const shortlists = await CRMShortlist.find({ teleCaller: callerId })
    .populate('lead', 'leadId name phone requirementType')
    .populate('property')
    .sort({ createdAt: -1 })
    .lean();

  return res.json(new ApiResponse(200, shortlists, 'Caller shortlists retrieved'));
};

/**
 * POST /api/admin/crm/leads/:leadId/shortlists
 */
const addShortlist = async (req, res) => {
  const { leadId } = req.params;
  const { propertyId, notes } = req.body;

  const [lead, property] = await Promise.all([
    CRMLead.findById(leadId),
    PropertyLead.findById(propertyId),
  ]);

  if (!lead) throw new ApiError(404, 'Lead not found');
  if (!property) throw new ApiError(404, 'Property not found');

  const existing = await CRMShortlist.findOne({ lead: lead._id, property: property._id });
  if (existing) {
    return res.json(new ApiResponse(200, existing, 'Property is already in lead shortlist'));
  }

  const shortlist = await CRMShortlist.create({
    lead: lead._id,
    property: property._id,
    teleCaller: req.user._id,
    notes: notes?.trim(),
    status: 'shortlisted',
  });

  await auditLogService.log({
    actor: req.user,
    action: 'PROPERTY_SHORTLISTED',
    entity: 'Shortlist',
    entityId: shortlist._id,
    metadata: { leadId: lead.leadId, propertyId: property.leadId },
    req,
  });

  return res.status(201).json(new ApiResponse(201, shortlist, 'Property added to lead shortlist'));
};

/**
 * PATCH /api/admin/crm/leads/:leadId/shortlists/:propertyId
 */
const updateShortlistStatus = async (req, res) => {
  const { leadId, propertyId } = req.params;
  const { status, notes } = req.body;

  const shortlist = await CRMShortlist.findOne({ lead: leadId, property: propertyId });
  if (!shortlist) throw new ApiError(404, 'Shortlisted property not found');

  if (status) shortlist.status = status;
  if (notes) shortlist.notes = notes;
  await shortlist.save();

  return res.json(new ApiResponse(200, shortlist, 'Shortlist status updated'));
};

/**
 * DELETE /api/admin/crm/leads/:leadId/shortlists/:propertyId
 */
const removeShortlist = async (req, res) => {
  const { leadId, propertyId } = req.params;

  const deleted = await CRMShortlist.findOneAndDelete({ lead: leadId, property: propertyId });
  if (!deleted) throw new ApiError(404, 'Shortlisted entry not found');

  await auditLogService.log({
    actor: req.user,
    action: 'SHORTLIST_REMOVED',
    entity: 'Shortlist',
    entityId: deleted._id,
    metadata: { leadId, propertyId },
    req,
  });

  return res.json(new ApiResponse(200, { success: true }, 'Property removed from shortlist'));
};

module.exports = {
  getLeadShortlists,
  getCallerShortlists,
  addShortlist,
  updateShortlistStatus,
  removeShortlist,
};
