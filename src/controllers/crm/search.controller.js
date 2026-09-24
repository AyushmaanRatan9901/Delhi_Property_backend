const CRMLead = require('../../models/crm/Lead');
const { PropertyLead } = require('../../models/propertyLeadModel');
const CRMSiteVisit = require('../../models/crm/SiteVisit');
const CRMPropertyShare = require('../../models/crm/PropertyShare');
const { maskPropertiesList } = require('../../services/crm/maskedInventory.service');
const ApiResponse = require('../../utils/ApiResponse');

/**
 * GET /api/crm/search?q=
 * Global Omnibar Search across Leads, Properties, Site Visits, and WhatsApp Shares
 */
const globalSearch = async (req, res) => {
  const { q } = req.query;

  if (!q || !q.trim()) {
    return res.status(200).json(
      new ApiResponse(
        200,
        { leads: [], properties: [], siteVisits: [], shares: [] },
        'Empty search query'
      )
    );
  }

  const query = q.trim();
  const regex = new RegExp(query, 'i');

  const [leads, properties, siteVisits, shares] = await Promise.all([
    CRMLead.find({
      $or: [{ name: regex }, { phone: regex }, { leadId: regex }, { email: regex }],
      archived: { $ne: true },
    })
      .limit(10)
      .lean(),

    PropertyLead.find({
      $or: [{ leadId: regex }, { title: regex }, { locality: regex }, { propertyType: regex }],
    })
      .limit(10)
      .lean(),

    CRMSiteVisit.find({ visitId: regex })
      .populate('lead', 'leadId name phone')
      .populate('property', 'leadId title locality')
      .limit(10)
      .lean(),

    CRMPropertyShare.find({ shareId: regex })
      .populate('lead', 'leadId name')
      .limit(10)
      .lean(),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        leads,
        properties: maskPropertiesList(properties),
        siteVisits,
        shares,
      },
      'Search results fetched'
    )
  );
};

module.exports = { globalSearch };
