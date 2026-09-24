const { PropertyLead } = require('../../models/propertyLeadModel');
const CRMLeadRequirement = require('../../models/crm/LeadRequirement');
const { maskPropertyForTeleCaller } = require('./maskedInventory.service');

/**
 * SMART PROPERTY MATCHING ENGINE
 * 
 * Computes compatibility scores (0-100%) based on:
 * - Listing / Requirement Type (Rent/Sale)
 * - BHK Count & Configuration
 * - Preferred Localities
 * - Budget Range (with 10-15% margin tolerance)
 * - Furnishing state
 * - Property Type
 */

const calculateMatchScore = (property, requirement) => {
  if (!property || !requirement) return { score: 0, matchScore: 0, matchedCriteria: [] };

  let score = 0;
  const matchedCriteria = [];

  // 1. Listing Type Match (30 pts)
  const propListingType = (property.listingType || 'rent').toLowerCase();
  const reqListingType = (requirement.requirementType || requirement.purpose || 'rent').toLowerCase();
  if (propListingType === reqListingType) {
    score += 30;
    matchedCriteria.push('purpose');
    matchedCriteria.push('listing_type');
  }

  // 2. BHK Match (25 pts)
  let propBhk = property.bhk || 0;
  if (!propBhk && property.propertyType) {
    if (property.propertyType.includes('1BHK') || property.propertyType.includes('1 BHK')) propBhk = 1;
    else if (property.propertyType.includes('2BHK') || property.propertyType.includes('2 BHK')) propBhk = 2;
    else if (property.propertyType.includes('3BHK') || property.propertyType.includes('3 BHK')) propBhk = 3;
    else if (property.propertyType.includes('4BHK') || property.propertyType.includes('4 BHK')) propBhk = 4;
  }

  const reqBhkList = Array.isArray(requirement.bhk)
    ? requirement.bhk
    : requirement.bhk
    ? [Number(requirement.bhk)]
    : [];

  if (reqBhkList.length > 0) {
    if (reqBhkList.includes(propBhk)) {
      score += 25;
      matchedCriteria.push('bhk');
    }
  } else {
    // If no specific BHK required, give partial points
    score += 15;
  }

  // 3. Locality Match (25 pts)
  const propLocality = (property.locality || '').toLowerCase().trim();
  const rawLocalities = requirement.preferredLocalities || requirement.localities || [];
  const reqLocalities = (Array.isArray(rawLocalities) ? rawLocalities : [rawLocalities]).map((l) =>
    l.toLowerCase().trim()
  );

  if (reqLocalities.length > 0) {
    const isLocalityMatch = reqLocalities.some(
      (l) => propLocality.includes(l) || l.includes(propLocality)
    );
    if (isLocalityMatch) {
      score += 25;
      matchedCriteria.push('locality');
    }
  } else {
    score += 15;
  }

  // 4. Budget Match (20 pts)
  const price = property.expectedPrice || property.rent?.amount || 0;
  const minBudget = requirement.budget?.min ?? requirement.budgetMin ?? 0;
  const maxBudget = requirement.budget?.max ?? requirement.budgetMax ?? 0;

  if (maxBudget > 0) {
    if (price >= minBudget && price <= maxBudget) {
      score += 20;
      matchedCriteria.push('budget');
    } else if (price <= maxBudget * 1.15) {
      // Within 15% upper tolerance
      score += 10;
      matchedCriteria.push('budget_flexible');
    }
  } else {
    score += 15;
  }

  // 5. Furnishing Match (Bonus up to 10 pts)
  const propFurnishing = (property.furnishing || '').toLowerCase();
  const reqFurnishing = (requirement.furnishing || 'any').toLowerCase();
  if (reqFurnishing === 'any' || propFurnishing === reqFurnishing) {
    score += 10;
    matchedCriteria.push('furnishing');
  }

  const finalScore = Math.min(Math.round(score), 100);

  return {
    score: finalScore,
    matchScore: finalScore,
    matchedCriteria,
  };
};

const findMatchesForLead = async (leadId, options = {}) => {
  const requirement = await CRMLeadRequirement.findOne({
    lead: leadId,
    isCurrent: true,
  });

  // Query verified active properties from inventory
  const filter = {
    status: { $in: ['verified', 'new', 'under_verification'] },
  };

  if (requirement?.requirementType) {
    filter.listingType = new RegExp(`^${requirement.requirementType}$`, 'i');
  }

  const properties = await PropertyLead.find(filter)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .lean();

  const results = properties
    .map((prop) => {
      const match = calculateMatchScore(prop, requirement);
      return {
        property: maskPropertyForTeleCaller(prop),
        matchScore: match.matchScore,
        matchedCriteria: match.matchedCriteria,
      };
    })
    .filter((item) => item.matchScore >= (options.minScore || 30))
    .sort((a, b) => b.matchScore - a.matchScore);

  return results;
};

module.exports = {
  calculateMatchScore,
  findMatchesForLead,
};
