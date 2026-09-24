const mongoose = require('mongoose');
const PropertyLead = require('../../../models/propertyLeadModel');
const CRMLead = require('../../../models/crm/Lead');
const CRMLeadRequirement = require('../../../models/crm/LeadRequirement');
const { calculateMatchScore } = require('../../../services/crm/matching.service');
const ApiResponse = require('../../../utils/ApiResponse');
const ApiError = require('../../../utils/ApiError');

/**
 * GET /api/admin/crm/inventory
 * Super Admin full inventory visibility (includes owner details, verification, commission, etc.)
 */
const getInventory = async (req, res) => {
  const {
    status,
    listingType,
    propertyType,
    city,
    locality,
    search,
    minPrice,
    maxPrice,
    page = 1,
    limit = 20,
    sort = 'createdAt',
    sortBy = 'desc',
  } = req.query;

  const query = { isDeleted: false };

  if (status && status !== 'ALL') query.status = status.toLowerCase();
  if (listingType && listingType !== 'ALL') query.listingType = listingType.toLowerCase();
  if (propertyType && propertyType !== 'ALL') query.propertyType = propertyType;
  if (city) query['address.city'] = { $regex: city, $options: 'i' };
  if (locality) query.locality = { $regex: locality, $options: 'i' };

  if (minPrice || maxPrice) {
    query.expectedPrice = {};
    if (minPrice) query.expectedPrice.$gte = Number(minPrice);
    if (maxPrice) query.expectedPrice.$lte = Number(maxPrice);
  }

  if (search?.trim()) {
    const s = search.trim();
    query.$or = [
      { leadId: { $regex: s, $options: 'i' } },
      { ownerName: { $regex: s, $options: 'i' } },
      { ownerPhone: { $regex: s, $options: 'i' } },
      { locality: { $regex: s, $options: 'i' } },
      { 'address.fullAddress': { $regex: s, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sortDirection = sortBy === 'asc' ? 1 : -1;

  const [properties, total] = await Promise.all([
    PropertyLead.find(query)
      .populate('assignedAgent', 'name phone staffId')
      .populate('verifiedBy', 'name staffId')
      .sort({ [sort]: sortDirection })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    PropertyLead.countDocuments(query),
  ]);

  return res.json(
    new ApiResponse(200, properties, 'Admin inventory retrieved successfully', {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    })
  );
};

/**
 * GET /api/admin/crm/inventory/:propertyId
 */
const getInventoryById = async (req, res) => {
  const { propertyId } = req.params;

  let property = null;
  if (mongoose.Types.ObjectId.isValid(propertyId)) {
    property = await PropertyLead.findById(propertyId)
      .populate('assignedAgent', 'name phone staffId')
      .populate('verifiedBy', 'name staffId')
      .lean();
  }
  if (!property && propertyId) {
    property = await PropertyLead.findOne({ leadId: propertyId })
      .populate('assignedAgent', 'name phone staffId')
      .populate('verifiedBy', 'name staffId')
      .lean();
  }

  if (!property) throw new ApiError(404, 'Property not found in inventory');

  return res.json(new ApiResponse(200, property, 'Property details retrieved successfully'));
};

/**
 * GET /api/admin/crm/inventory/:propertyId/media
 */
const getInventoryMedia = async (req, res) => {
  const { propertyId } = req.params;
  const property = await PropertyLead.findById(propertyId).select('photos videos videoLink virtualTourLink').lean();
  if (!property) throw new ApiError(404, 'Property not found');

  return res.json(new ApiResponse(200, {
    photos: property.photos || [],
    videos: property.videos || [],
    videoLink: property.videoLink,
    virtualTourLink: property.virtualTourLink,
  }, 'Property media retrieved'));
};

/**
 * POST /api/admin/crm/property-matching/search
 * Search matching properties based on criteria
 */
const searchPropertyMatches = async (req, res) => {
  const {
    purpose = 'rent',
    bhk,
    budgetMin = 0,
    budgetMax = 99999999,
    localities = [],
    furnishing = 'any',
    limit = 20,
  } = req.body;

  const query = {
    isDeleted: false,
    status: { $in: ['verified', 'available', 'active', 'new'] },
    listingType: purpose.toLowerCase(),
  };

  const properties = await PropertyLead.find(query).limit(100).lean();

  const criteria = {
    purpose,
    bhk: Array.isArray(bhk) ? bhk : bhk ? [Number(bhk)] : [],
    budget: { min: Number(budgetMin), max: Number(budgetMax) },
    preferredLocalities: Array.isArray(localities) ? localities : localities ? [localities] : [],
    furnishing,
  };

  const matches = properties
    .map((prop) => {
      const { score, matchedCriteria } = calculateMatchScore(prop, criteria);
      return {
        property,
        propertyId: prop._id,
        leadId: prop.leadId,
        matchScore: score,
        matchedCriteria,
      };
    })
    .filter((m) => m.matchScore > 20)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, Number(limit));

  return res.json(new ApiResponse(200, matches, 'Matching properties retrieved'));
};

/**
 * GET /api/admin/crm/leads/:leadId/matches
 * Get deterministic property matches for a specific lead
 */
const getLeadMatches = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findById(leadId);
  if (!lead) throw new ApiError(404, 'Lead not found');

  const requirement = await CRMLeadRequirement.findOne({ lead: lead._id }).lean();

  const criteria = {
    purpose: requirement?.purpose || lead.requirementType || 'rent',
    bhk: requirement?.bhk || [],
    budget: requirement?.budget || { min: 0, max: 100000 },
    preferredLocalities: requirement?.preferredLocalities || [],
    furnishing: requirement?.furnishing || 'any',
  };

  const properties = await PropertyLead.find({
    isDeleted: false,
    status: { $in: ['verified', 'available', 'active', 'new'] },
    listingType: criteria.purpose.toLowerCase(),
  }).limit(100).lean();

  const matches = properties
    .map((prop) => {
      const { score, matchedCriteria } = calculateMatchScore(prop, criteria);
      return {
        property: prop,
        propertyId: prop._id,
        leadId: prop.leadId,
        matchScore: score,
        matchedCriteria,
      };
    })
    .filter((m) => m.matchScore > 20)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 30);

  return res.json(new ApiResponse(200, matches, 'Lead matching inventory retrieved successfully'));
};

module.exports = {
  getInventory,
  getInventoryById,
  getInventoryMedia,
  searchPropertyMatches,
  getLeadMatches,
};
