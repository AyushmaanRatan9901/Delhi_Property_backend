const mongoose = require('mongoose');
const CRMShowcase = require('../../../models/crm/Showcase');
const PropertyLead = require('../../../models/propertyLeadModel');
const crmSocketService = require('../../../services/crm/crmSocket.service');
const auditLogService = require('../../../services/crm/auditLog.service');
const { generateCRMId } = require('../../../utils/crmIdGenerator');
const ApiResponse = require('../../../utils/ApiResponse');
const ApiError = require('../../../utils/ApiError');

/**
 * GET /api/admin/crm/tv/showcases
 */
const getAllShowcases = async (req, res) => {
  const showcases = await CRMShowcase.find()
    .populate('properties.property')
    .populate('lead', 'leadId name')
    .populate('activeBy', 'name role')
    .sort({ createdAt: -1 })
    .lean();

  return res.json(new ApiResponse(200, showcases, 'TV Showcases retrieved successfully'));
};

/**
 * GET /api/admin/crm/tv/showcases/:id
 */
const getShowcaseById = async (req, res) => {
  const { id } = req.params;

  let showcase = null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    showcase = await CRMShowcase.findById(id)
      .populate('properties.property')
      .populate('lead', 'leadId name phone')
      .populate('activeBy', 'name role')
      .lean();
  }
  if (!showcase && id) {
    showcase = await CRMShowcase.findOne({ showcaseId: id })
      .populate('properties.property')
      .populate('lead', 'leadId name phone')
      .populate('activeBy', 'name role')
      .lean();
  }

  if (!showcase) throw new ApiError(404, 'TV Showcase not found');

  return res.json(new ApiResponse(200, showcase, 'Showcase details retrieved'));
};

/**
 * POST /api/admin/crm/tv/showcases
 */
const createShowcase = async (req, res) => {
  const { title = 'Main Office Showcase', location = 'Office TV', leadId, propertyIds = [] } = req.body;

  const showcaseId = generateCRMId('TV');

  const formattedProps = propertyIds.map((pId, idx) => ({
    property: pId,
    order: idx,
    addedAt: new Date(),
  }));

  const showcase = await CRMShowcase.create({
    showcaseId,
    title,
    location,
    lead: leadId && mongoose.Types.ObjectId.isValid(leadId) ? leadId : undefined,
    properties: formattedProps,
    status: 'idle',
    activeBy: req.user._id,
  });

  crmSocketService.tvShowcaseUpdate(showcase._id, { status: 'idle', showcase });

  await auditLogService.log({
    actor: req.user,
    action: 'TV_SHOWCASE_CREATED',
    entity: 'Showcase',
    entityId: showcase._id,
    metadata: { showcaseId: showcase.showcaseId, title },
    req,
  });

  return res.status(201).json(new ApiResponse(201, showcase, 'TV Showcase created successfully'));
};

/**
 * PATCH /api/admin/crm/tv/showcases/:id
 */
const updateShowcase = async (req, res) => {
  const { id } = req.params;
  const { title, location, status } = req.body;

  const showcase = await CRMShowcase.findById(id);
  if (!showcase) throw new ApiError(404, 'Showcase not found');

  if (title) showcase.title = title;
  if (location) showcase.location = location;
  if (status) showcase.status = status;

  await showcase.save();

  crmSocketService.tvShowcaseUpdate(showcase._id, { showcase });

  return res.json(new ApiResponse(200, showcase, 'Showcase updated'));
};

/**
 * DELETE /api/admin/crm/tv/showcases/:id
 */
const deleteShowcase = async (req, res) => {
  const { id } = req.params;

  const deleted = await CRMShowcase.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, 'Showcase not found');

  crmSocketService.tvShowcaseRemove(id);

  return res.json(new ApiResponse(200, { success: true }, 'Showcase deleted'));
};

/**
 * POST /api/admin/crm/tv/showcases/:id/properties
 */
const addPropertiesToShowcase = async (req, res) => {
  const { id } = req.params;
  const { propertyId, propertyIds = [] } = req.body;

  const showcase = await CRMShowcase.findById(id);
  if (!showcase) throw new ApiError(404, 'Showcase not found');

  const toAdd = propertyId ? [propertyId] : propertyIds;

  toAdd.forEach((pId) => {
    const exists = showcase.properties.some((p) => p.property.toString() === pId.toString());
    if (!exists) {
      showcase.properties.push({
        property: pId,
        order: showcase.properties.length,
        addedAt: new Date(),
      });
    }
  });

  await showcase.save();

  crmSocketService.tvShowcaseUpdate(showcase._id, { properties: showcase.properties });

  return res.json(new ApiResponse(200, showcase, 'Properties added to TV showcase'));
};

/**
 * DELETE /api/admin/crm/tv/showcases/:id/properties/:propertyId
 */
const removePropertyFromShowcase = async (req, res) => {
  const { id, propertyId } = req.params;

  const showcase = await CRMShowcase.findById(id);
  if (!showcase) throw new ApiError(404, 'Showcase not found');

  showcase.properties = showcase.properties.filter(
    (p) => p.property.toString() !== propertyId.toString()
  );

  await showcase.save();

  crmSocketService.tvShowcaseUpdate(showcase._id, { properties: showcase.properties });

  return res.json(new ApiResponse(200, showcase, 'Property removed from showcase'));
};

/**
 * POST /api/admin/crm/tv/showcases/:id/play
 */
const playShowcase = async (req, res) => {
  const { id } = req.params;
  const { propertyIndex = 0 } = req.body;

  const showcase = await CRMShowcase.findById(id);
  if (!showcase) throw new ApiError(404, 'Showcase not found');

  showcase.status = 'active';
  showcase.currentPropertyIndex = propertyIndex;
  showcase.activeBy = req.user._id;
  await showcase.save();

  crmSocketService.tvShowcasePlay(showcase._id, propertyIndex);

  return res.json(new ApiResponse(200, showcase, 'Showcase playback started'));
};

/**
 * POST /api/admin/crm/tv/showcases/:id/next
 */
const nextShowcaseProperty = async (req, res) => {
  const { id } = req.params;

  const showcase = await CRMShowcase.findById(id);
  if (!showcase) throw new ApiError(404, 'Showcase not found');

  const maxIndex = Math.max(0, showcase.properties.length - 1);
  showcase.currentPropertyIndex =
    showcase.currentPropertyIndex >= maxIndex ? 0 : showcase.currentPropertyIndex + 1;
  await showcase.save();

  crmSocketService.tvShowcaseNext(showcase._id, showcase.currentPropertyIndex);

  return res.json(new ApiResponse(200, { currentPropertyIndex: showcase.currentPropertyIndex }, 'Advanced to next slide'));
};

/**
 * POST /api/admin/crm/tv/showcases/:id/previous
 */
const previousShowcaseProperty = async (req, res) => {
  const { id } = req.params;

  const showcase = await CRMShowcase.findById(id);
  if (!showcase) throw new ApiError(404, 'Showcase not found');

  const maxIndex = Math.max(0, showcase.properties.length - 1);
  showcase.currentPropertyIndex =
    showcase.currentPropertyIndex <= 0 ? maxIndex : showcase.currentPropertyIndex - 1;
  await showcase.save();

  crmSocketService.tvShowcasePrevious(showcase._id, showcase.currentPropertyIndex);

  return res.json(new ApiResponse(200, { currentPropertyIndex: showcase.currentPropertyIndex }, 'Moved to previous slide'));
};

module.exports = {
  getAllShowcases,
  getShowcaseById,
  createShowcase,
  updateShowcase,
  deleteShowcase,
  addPropertiesToShowcase,
  removePropertyFromShowcase,
  playShowcase,
  nextShowcaseProperty,
  previousShowcaseProperty,
};
