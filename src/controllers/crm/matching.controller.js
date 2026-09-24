const { PropertyLead } = require('../../models/propertyLeadModel');
const CRMLead = require('../../models/crm/Lead');
const CRMLeadRequirement = require('../../models/crm/LeadRequirement');
const {
  findMatchesForLead,
  calculateMatchScore,
} = require('../../services/crm/matching.service');
const { maskPropertyForTeleCaller } = require('../../services/crm/maskedInventory.service');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

/**
 * GET /api/crm/leads/:leadId/matches
 * Get ranked matching properties for a lead
 */
const getMatchesForLead = async (req, res) => {
  const { leadId } = req.params;
  const { limit = 30, minScore = 20 } = req.query;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const matches = await findMatchesForLead(lead._id, {
    limit: Number(limit),
    minScore: Number(minScore),
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        leadId: lead.leadId,
        matchCount: matches.length,
        matches,
      },
      'Matching properties computed successfully'
    )
  );
};

/**
 * POST /api/crm/matching/search
 * Match against custom requirement criteria on the fly
 */
const searchMatchingProperties = async (req, res) => {
  const {
    requirementType = 'rent',
    bhk,
    localities = [],
    budgetMin = 0,
    budgetMax = 0,
    furnishing = 'any',
    limit = 30,
    minScore = 20,
  } = req.body;

  const requirement = {
    requirementType,
    bhk: Array.isArray(bhk) ? bhk.map(Number) : bhk ? [Number(bhk)] : [],
    localities: Array.isArray(localities) ? localities : [localities],
    budgetMin: Number(budgetMin),
    budgetMax: Number(budgetMax),
    furnishing,
  };

  const properties = await PropertyLead.find({
    status: { $in: ['verified', 'new', 'under_verification'] },
    listingType: new RegExp(`^${requirementType}$`, 'i'),
  })
    .sort({ createdAt: -1 })
    .limit(Number(limit) * 2)
    .lean();

  const matches = properties
    .map((prop) => {
      const match = calculateMatchScore(prop, requirement);
      return {
        property: maskPropertyForTeleCaller(prop),
        matchScore: match.matchScore,
        matchedCriteria: match.matchedCriteria,
      };
    })
    .filter((item) => item.matchScore >= Number(minScore))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, Number(limit));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        matchCount: matches.length,
        matches,
      },
      'Matches calculated successfully'
    )
  );
};

/**
 * GET /api/crm/leads/:leadId/matches/:propertyId
 * Get specific match score and breakdown between a lead and a property
 */
const getSpecificPropertyMatch = async (req, res) => {
  const { leadId, propertyId } = req.params;

  const [lead, property] = await Promise.all([
    CRMLead.findOne({
      $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
    }),
    PropertyLead.findOne({
      $or: [{ _id: propertyId.match(/^[0-9a-fA-F]{24}$/) ? propertyId : null }, { leadId: propertyId }],
    }).lean(),
  ]);

  if (!lead) throw new ApiError(404, 'Lead not found');
  if (!property) throw new ApiError(404, 'Property not found');

  const requirement = await CRMLeadRequirement.findOne({
    lead: lead._id,
    isCurrent: true,
  });

  const match = calculateMatchScore(property, requirement);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        property: maskPropertyForTeleCaller(property),
        matchScore: match.matchScore,
        matchedCriteria: match.matchedCriteria,
      },
      'Match details calculated'
    )
  );
};

/**
 * POST /api/crm/leads/:leadId/matches/refresh
 */
const refreshMatches = async (req, res) => {
  return getMatchesForLead(req, res);
};

module.exports = {
  getMatchesForLead,
  searchMatchingProperties,
  getSpecificPropertyMatch,
  refreshMatches,
};
