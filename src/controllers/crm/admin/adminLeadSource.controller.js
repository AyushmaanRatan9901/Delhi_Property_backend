const CRMLead = require('../../../models/crm/Lead');
const ApiResponse = require('../../../utils/ApiResponse');

const SUPPORTED_LEAD_SOURCES = [
  { id: 'website', name: 'Official Website', type: 'inbound_web', active: true },
  { id: 'facebook', name: 'Facebook Ads', type: 'social_campaign', active: true },
  { id: 'instagram', name: 'Instagram Ads', type: 'social_campaign', active: true },
  { id: 'justdial', name: 'JustDial Enquiries', type: 'portal', active: true },
  { id: 'walk_in', name: 'Office Walk-in', type: 'direct', active: true },
  { id: 'manual', name: 'Direct Telecaller Entry', type: 'outbound', active: true },
  { id: 'campaign', name: 'Marketing Campaign', type: 'campaign', active: true },
  { id: 'advertisement', name: 'Print / Outdoor Ads', type: 'advertisement', active: true },
  { id: 'referral', name: 'Client Referral', type: 'referral', active: true },
  { id: 'other', name: 'Other Source', type: 'miscellaneous', active: true },
];

/**
 * GET /api/admin/crm/lead-sources
 * Get all supported lead sources with their lead counts
 */
const getLeadSources = async (req, res) => {
  const counts = await CRMLead.aggregate([
    { $match: { archived: { $ne: true } } },
    { $group: { _id: '$source', totalLeads: { $sum: 1 }, convertedLeads: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } } } },
  ]);

  const countMap = {};
  counts.forEach((c) => {
    countMap[c._id] = { total: c.totalLeads, converted: c.convertedLeads };
  });

  const sourcesWithStats = SUPPORTED_LEAD_SOURCES.map((source) => ({
    ...source,
    totalLeads: countMap[source.id]?.total || 0,
    convertedLeads: countMap[source.id]?.converted || 0,
    conversionRate: countMap[source.id]?.total
      ? Math.round((countMap[source.id].converted / countMap[source.id].total) * 100)
      : 0,
  }));

  return res.json(new ApiResponse(200, sourcesWithStats, 'Supported lead sources retrieved'));
};

module.exports = {
  getLeadSources,
  SUPPORTED_LEAD_SOURCES,
};
