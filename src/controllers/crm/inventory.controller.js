const { PropertyLead } = require('../../models/propertyLeadModel');
const {
  maskPropertyForTeleCaller,
  maskPropertiesList,
} = require('../../services/crm/maskedInventory.service');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { logCRMActivity } = require('../../services/crm/activity.service');

/**
 * Helper to build query filter for inventory
 */
const buildInventoryFilter = (query) => {
  const {
    type,
    propertyType,
    bhk,
    locality,
    city,
    minPrice,
    maxPrice,
    minArea,
    maxArea,
    furnishing,
    verified,
    videoAvailable,
    siteVisitAvailable,
    availability,
  } = query;

  const filter = {};

  if (type) {
    filter.listingType = new RegExp(`^${type}$`, 'i');
  }

  if (propertyType && propertyType !== 'ALL') {
    filter.propertyType = new RegExp(propertyType, 'i');
  }

  if (bhk) {
    const bhkNum = Number(bhk);
    if (!isNaN(bhkNum)) {
      filter.$or = [
        { bhk: bhkNum },
        { propertyType: new RegExp(`${bhkNum}\\s*BHK`, 'i') },
      ];
    }
  }

  if (locality) {
    filter.locality = { $regex: locality.trim(), $options: 'i' };
  }

  if (city) {
    filter['address.city'] = { $regex: city.trim(), $options: 'i' };
  }

  if (minPrice || maxPrice) {
    filter.expectedPrice = {};
    if (minPrice) filter.expectedPrice.$gte = Number(minPrice);
    if (maxPrice) filter.expectedPrice.$lte = Number(maxPrice);
  }

  if (minArea || maxArea) {
    filter.builtUpArea = {};
    if (minArea) filter.builtUpArea.$gte = Number(minArea);
    if (maxArea) filter.builtUpArea.$lte = Number(maxArea);
  }

  if (furnishing && furnishing !== 'ALL') {
    filter.furnishing = furnishing.toLowerCase();
  }

  if (verified === 'true') {
    filter.status = 'verified';
  }

  if (videoAvailable === 'true') {
    filter['videos.0'] = { $exists: true };
  }

  if (availability === 'true' || siteVisitAvailable === 'true') {
    filter.status = { $in: ['verified', 'new', 'under_verification'] };
  }

  return filter;
};

/**
 * GET /api/crm/inventory
 * Strict masked property directory for Tele-callers
 */
const getInventory = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const filter = buildInventoryFilter(req.query);

  const skip = (Number(page) - 1) * Number(limit);

  const [properties, total] = await Promise.all([
    PropertyLead.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    PropertyLead.countDocuments(filter),
  ]);

  const masked = maskPropertiesList(properties);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        properties: masked,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)) || 1,
        },
      },
      'Inventory fetched successfully with PII masked'
    )
  );
};

/**
 * GET /api/crm/inventory/available
 */
const getAvailableInventory = async (req, res) => {
  req.query.availability = 'true';
  return getInventory(req, res);
};

/**
 * GET /api/crm/inventory/verified
 */
const getVerifiedInventory = async (req, res) => {
  req.query.verified = 'true';
  return getInventory(req, res);
};

/**
 * GET /api/crm/inventory/:propertyId
 * Get a single property with strict PII masking
 */
const getPropertyById = async (req, res) => {
  const { propertyId } = req.params;

  const prop = await PropertyLead.findOne({
    $or: [{ _id: propertyId.match(/^[0-9a-fA-F]{24}$/) ? propertyId : null }, { leadId: propertyId }],
  }).lean();

  if (!prop) {
    throw new ApiError(404, 'Property not found in inventory');
  }

  const masked = maskPropertyForTeleCaller(prop);

  await logCRMActivity({
    action: 'property_viewed',
    entityType: 'PropertyLead',
    entityId: prop._id,
    performedBy: req.user,
    property: prop._id,
    metadata: { propertyId: masked.propertyId, locality: masked.locality },
    req,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { property: masked }, 'Property details fetched successfully'));
};

/**
 * GET /api/crm/inventory/:propertyId/media
 */
const getPropertyMedia = async (req, res) => {
  const { propertyId } = req.params;

  const prop = await PropertyLead.findOne({
    $or: [{ _id: propertyId.match(/^[0-9a-fA-F]{24}$/) ? propertyId : null }, { leadId: propertyId }],
  }).lean();

  if (!prop) throw new ApiError(404, 'Property not found');

  const masked = maskPropertyForTeleCaller(prop);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        propertyId: masked.propertyId,
        images: masked.images,
        videos: masked.videos,
        coverPhoto: masked.coverPhoto,
      },
      'Property media fetched'
    )
  );
};

/**
 * GET /api/crm/inventory/:propertyId/videos
 */
const getPropertyVideos = async (req, res) => {
  const { propertyId } = req.params;
  const prop = await PropertyLead.findOne({
    $or: [{ _id: propertyId.match(/^[0-9a-fA-F]{24}$/) ? propertyId : null }, { leadId: propertyId }],
  }).lean();

  if (!prop) throw new ApiError(404, 'Property not found');
  const masked = maskPropertyForTeleCaller(prop);

  return res
    .status(200)
    .json(new ApiResponse(200, { propertyId: masked.propertyId, videos: masked.videos }, 'Videos fetched'));
};

/**
 * GET /api/crm/inventory/:propertyId/images
 */
const getPropertyImages = async (req, res) => {
  const { propertyId } = req.params;
  const prop = await PropertyLead.findOne({
    $or: [{ _id: propertyId.match(/^[0-9a-fA-F]{24}$/) ? propertyId : null }, { leadId: propertyId }],
  }).lean();

  if (!prop) throw new ApiError(404, 'Property not found');
  const masked = maskPropertyForTeleCaller(prop);

  return res
    .status(200)
    .json(new ApiResponse(200, { propertyId: masked.propertyId, images: masked.images }, 'Images fetched'));
};

/**
 * GET /api/crm/inventory/:propertyId/amenities
 */
const getPropertyAmenities = async (req, res) => {
  const { propertyId } = req.params;
  const prop = await PropertyLead.findOne({
    $or: [{ _id: propertyId.match(/^[0-9a-fA-F]{24}$/) ? propertyId : null }, { leadId: propertyId }],
  }).lean();

  if (!prop) throw new ApiError(404, 'Property not found');
  const masked = maskPropertyForTeleCaller(prop);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        propertyId: masked.propertyId,
        amenities: masked.amenities,
        furnishing: masked.furnishing,
        features: masked.features,
      },
      'Amenities fetched'
    )
  );
};

/**
 * GET /api/crm/inventory/:propertyId/access
 */
const getPropertyAccess = async (req, res) => {
  const isSuperAdminOrAdmin = ['super_admin', 'admin'].includes(req.user.role);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        canViewProperty: true,
        canViewOwner: isSuperAdminOrAdmin,
        canViewTenant: isSuperAdminOrAdmin,
        canEditProperty: isSuperAdminOrAdmin,
        canDeleteProperty: isSuperAdminOrAdmin,
        canApproveProperty: isSuperAdminOrAdmin,
        canViewCommission: isSuperAdminOrAdmin,
      },
      'Access permissions fetched'
    )
  );
};

module.exports = {
  getInventory,
  getAvailableInventory,
  getVerifiedInventory,
  getPropertyById,
  getPropertyMedia,
  getPropertyVideos,
  getPropertyImages,
  getPropertyAmenities,
  getPropertyAccess,
};
