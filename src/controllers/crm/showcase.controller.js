const CRMShowcase = require('../../models/crm/Showcase');
const { PropertyLead } = require('../../models/propertyLeadModel');
const { maskPropertiesList } = require('../../services/crm/maskedInventory.service');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { generateCRMId } = require('../../utils/crmIdGenerator');
const { logCRMActivity } = require('../../services/crm/activity.service');

/**
 * POST /api/crm/showcase
 * Create a new TV Showcase session
 */
const createShowcase = async (req, res) => {
  const { title, location, leadId, propertyIds } = req.body;

  const showcaseId = generateCRMId('SHOW');

  const properties = [];
  if (Array.isArray(propertyIds)) {
    propertyIds.forEach((pid, idx) => {
      properties.push({ property: pid, order: idx });
    });
  }

  const showcase = await CRMShowcase.create({
    showcaseId,
    title: title || 'Office TV Showcase',
    location: location || 'Main Office Display',
    lead: leadId || undefined,
    properties,
    status: 'active',
    activeBy: req.user._id,
    lastHeartbeatAt: new Date(),
  });

  return res.status(201).json(
    new ApiResponse(201, { showcase }, 'TV Showcase session created successfully')
  );
};

/**
 * GET /api/crm/showcase/:showcaseId
 */
const getShowcaseById = async (req, res) => {
  const { showcaseId } = req.params;

  const showcase = await CRMShowcase.findOne({ showcaseId })
    .populate('lead', 'leadId name requirementType')
    .populate('properties.property')
    .populate('activeBy', 'name staffId')
    .lean();

  if (!showcase) throw new ApiError(404, 'Showcase session not found');

  // Mask all properties in showcase
  showcase.properties = showcase.properties.map((item) => ({
    ...item,
    property: maskPropertiesList([item.property])[0] || null,
  }));

  return res
    .status(200)
    .json(new ApiResponse(200, { showcase }, 'Showcase session fetched'));
};

/**
 * PATCH /api/crm/showcase/:showcaseId
 */
const updateShowcase = async (req, res) => {
  const { showcaseId } = req.params;
  const { title, location, status, currentPropertyIndex } = req.body;

  const showcase = await CRMShowcase.findOne({ showcaseId });
  if (!showcase) throw new ApiError(404, 'Showcase session not found');

  if (title) showcase.title = title;
  if (location) showcase.location = location;
  if (status) showcase.status = status;
  if (currentPropertyIndex !== undefined) showcase.currentPropertyIndex = Number(currentPropertyIndex);

  await showcase.save();

  return res.status(200).json(new ApiResponse(200, { showcase }, 'Showcase updated'));
};

/**
 * POST /api/crm/showcase/:showcaseId/properties/:propertyId
 */
const addPropertyToShowcase = async (req, res) => {
  const { showcaseId, propertyId } = req.params;

  const [showcase, prop] = await Promise.all([
    CRMShowcase.findOne({ showcaseId }),
    PropertyLead.findOne({
      $or: [{ _id: propertyId.match(/^[0-9a-fA-F]{24}$/) ? propertyId : null }, { leadId: propertyId }],
    }),
  ]);

  if (!showcase) throw new ApiError(404, 'Showcase session not found');
  if (!prop) throw new ApiError(404, 'Property not found');

  // Check if already in showcase
  const exists = showcase.properties.some(
    (item) => item.property.toString() === prop._id.toString()
  );

  if (!exists) {
    showcase.properties.push({
      property: prop._id,
      order: showcase.properties.length,
      addedAt: new Date(),
    });
    await showcase.save();
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { showcase }, 'Property added to TV showcase'));
};

/**
 * DELETE /api/crm/showcase/:showcaseId/properties/:propertyId
 */
const removePropertyFromShowcase = async (req, res) => {
  const { showcaseId, propertyId } = req.params;

  const showcase = await CRMShowcase.findOne({ showcaseId });
  if (!showcase) throw new ApiError(404, 'Showcase session not found');

  showcase.properties = showcase.properties.filter(
    (item) => item.property.toString() !== propertyId
  );
  await showcase.save();

  return res
    .status(200)
    .json(new ApiResponse(200, { showcase }, 'Property removed from showcase'));
};

/**
 * PATCH /api/crm/showcase/:showcaseId/properties/order
 */
const reorderShowcaseProperties = async (req, res) => {
  const { showcaseId } = req.params;
  const { propertyOrders } = req.body; // array of { propertyId, order }

  const showcase = await CRMShowcase.findOne({ showcaseId });
  if (!showcase) throw new ApiError(404, 'Showcase session not found');

  if (Array.isArray(propertyOrders)) {
    propertyOrders.forEach(({ propertyId, order }) => {
      const target = showcase.properties.find(
        (item) => item.property.toString() === propertyId
      );
      if (target) target.order = Number(order);
    });
    showcase.properties.sort((a, b) => a.order - b.order);
    await showcase.save();
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { showcase }, 'Properties reordered'));
};

/**
 * PATCH /api/crm/showcase/:showcaseId/activate
 */
const activateShowcase = async (req, res) => {
  const { showcaseId } = req.params;
  const showcase = await CRMShowcase.findOne({ showcaseId });
  if (!showcase) throw new ApiError(404, 'Showcase not found');

  showcase.status = 'active';
  showcase.activeBy = req.user._id;
  await showcase.save();

  return res.status(200).json(new ApiResponse(200, { showcase }, 'Showcase activated'));
};

/**
 * PATCH /api/crm/showcase/:showcaseId/pause
 */
const pauseShowcase = async (req, res) => {
  const { showcaseId } = req.params;
  const showcase = await CRMShowcase.findOne({ showcaseId });
  if (!showcase) throw new ApiError(404, 'Showcase not found');

  showcase.status = 'paused';
  await showcase.save();

  return res.status(200).json(new ApiResponse(200, { showcase }, 'Showcase paused'));
};

/**
 * PATCH /api/crm/showcase/:showcaseId/close
 */
const closeShowcase = async (req, res) => {
  const { showcaseId } = req.params;
  const showcase = await CRMShowcase.findOne({ showcaseId });
  if (!showcase) throw new ApiError(404, 'Showcase not found');

  showcase.status = 'closed';
  await showcase.save();

  return res.status(200).json(new ApiResponse(200, { showcase }, 'Showcase closed'));
};

/**
 * GET /api/crm/showcase/:showcaseId/display
 * TV Screen Feed Endpoint — Strictly masked, zero PII, zero commission data
 */
const getTVDisplayFeed = async (req, res) => {
  const { showcaseId } = req.params;

  const showcase = await CRMShowcase.findOne({ showcaseId })
    .populate('properties.property')
    .lean();

  if (!showcase) throw new ApiError(404, 'Showcase display feed not found');

  const maskedProperties = showcase.properties
    .filter((item) => Boolean(item.property))
    .map((item) => ({
      order: item.order,
      property: maskPropertiesList([item.property])[0],
    }));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        showcaseId: showcase.showcaseId,
        title: showcase.title,
        location: showcase.location,
        status: showcase.status,
        currentPropertyIndex: showcase.currentPropertyIndex,
        totalItems: maskedProperties.length,
        properties: maskedProperties,
      },
      'TV Display Feed loaded'
    )
  );
};

/**
 * POST /api/crm/showcase/:showcaseId/heartbeat
 */
const recordHeartbeat = async (req, res) => {
  const { showcaseId } = req.params;
  await CRMShowcase.findOneAndUpdate(
    { showcaseId },
    { lastHeartbeatAt: new Date() }
  );
  return res.status(200).json(new ApiResponse(200, { status: 'alive' }, 'Heartbeat recorded'));
};

/**
 * GET /api/crm/showcase/:showcaseId/qr
 */
const getShowcaseQR = async (req, res) => {
  const { showcaseId } = req.params;
  const showcase = await CRMShowcase.findOne({ showcaseId });
  if (!showcase) throw new ApiError(404, 'Showcase not found');

  const displayUrl = `${process.env.TV_SHOWCASE_URL || 'https://dpe.properties/showcase'}/${showcase.showcaseId}`;

  return res.status(200).json(
    new ApiResponse(200, { showcaseId, displayUrl }, 'Showcase QR URL generated')
  );
};

module.exports = {
  createShowcase,
  getShowcaseById,
  updateShowcase,
  addPropertyToShowcase,
  removePropertyFromShowcase,
  reorderShowcaseProperties,
  activateShowcase,
  pauseShowcase,
  closeShowcase,
  getTVDisplayFeed,
  recordHeartbeat,
  getShowcaseQR,
};
