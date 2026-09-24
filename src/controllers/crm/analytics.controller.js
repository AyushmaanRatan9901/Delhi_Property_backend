const CRMLead = require('../../models/crm/Lead');
const CRMCall = require('../../models/crm/Call');
const CRMSiteVisit = require('../../models/crm/SiteVisit');
const CRMShortlist = require('../../models/crm/Shortlist');
const CRMPropertyShare = require('../../models/crm/PropertyShare');
const CRMHandoff = require('../../models/crm/CRMHandoff');
const User = require('../../models/User');
const ApiResponse = require('../../utils/ApiResponse');

/**
 * Helper to construct date filters
 */
const getDateFilter = (from, to, field = 'createdAt') => {
  if (!from && !to) return {};
  const filter = {};
  filter[field] = {};
  if (from) filter[field].$gte = new Date(from);
  if (to) filter[field].$lte = new Date(to);
  return filter;
};

/**
 * GET /api/crm/analytics/leads
 */
const getLeadAnalytics = async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = getDateFilter(from, to);

  const [totalLeads, sourceStats, statusStats, priorityStats] = await Promise.all([
    CRMLead.countDocuments({ ...dateFilter, archived: { $ne: true } }),
    CRMLead.aggregate([
      { $match: { ...dateFilter, archived: { $ne: true } } },
      { $group: { _id: '$source', count: { $sum: 1 } } },
    ]),
    CRMLead.aggregate([
      { $match: { ...dateFilter, archived: { $ne: true } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    CRMLead.aggregate([
      { $match: { ...dateFilter, archived: { $ne: true } } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalLeads,
        bySource: sourceStats,
        byStatus: statusStats,
        byPriority: priorityStats,
      },
      'Lead analytics fetched'
    )
  );
};

/**
 * GET /api/crm/analytics/calls
 */
const getCallAnalytics = async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = getDateFilter(from, to);

  const [totalCalls, outcomeStats, avgDuration] = await Promise.all([
    CRMCall.countDocuments(dateFilter),
    CRMCall.aggregate([
      { $match: dateFilter },
      { $group: { _id: '$outcome', count: { $sum: 1 } } },
    ]),
    CRMCall.aggregate([
      { $match: { ...dateFilter, duration: { $gt: 0 } } },
      { $group: { _id: null, avgDurationSec: { $avg: '$duration' } } },
    ]),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalCalls,
        byOutcome: outcomeStats,
        avgDurationSeconds: Math.round(avgDuration[0]?.avgDurationSec || 0),
      },
      'Call analytics fetched'
    )
  );
};

/**
 * GET /api/crm/analytics/site-visits
 */
const getSiteVisitAnalytics = async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = getDateFilter(from, to, 'scheduledAt');

  const [totalVisits, statusStats] = await Promise.all([
    CRMSiteVisit.countDocuments(dateFilter),
    CRMSiteVisit.aggregate([
      { $match: dateFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalVisits,
        byStatus: statusStats,
      },
      'Site visit analytics fetched'
    )
  );
};

/**
 * GET /api/crm/analytics/conversions
 */
const getConversionAnalytics = async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = getDateFilter(from, to, 'convertedAt');

  const [convertedCount, lostStats, totalClosed] = await Promise.all([
    CRMLead.countDocuments({ ...dateFilter, status: 'converted' }),
    CRMLead.aggregate([
      { $match: { status: 'lost', ...(from || to ? getDateFilter(from, to, 'updatedAt') : {}) } },
      { $group: { _id: '$lostReason', count: { $sum: 1 } } },
    ]),
    CRMHandoff.countDocuments({ status: 'accepted' }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        convertedCount,
        acceptedHandoffs: totalClosed,
        lostByReason: lostStats,
      },
      'Conversion analytics fetched'
    )
  );
};

/**
 * GET /api/crm/analytics/tele-callers
 */
const getTeleCallerPerformance = async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = getDateFilter(from, to);

  const teleCallers = await User.find({ role: 'tele_caller', isActive: true })
    .select('name staffId phone email')
    .lean();

  const performance = await Promise.all(
    teleCallers.map(async (tc) => {
      const [assignedLeads, callsMade, visitsBooked, handoffsSubmitted] = await Promise.all([
        CRMLead.countDocuments({ assignedTo: tc._id, archived: { $ne: true } }),
        CRMCall.countDocuments({ teleCaller: tc._id, ...dateFilter }),
        CRMSiteVisit.countDocuments({ createdBy: tc._id, ...dateFilter }),
        CRMHandoff.countDocuments({ teleCaller: tc._id, ...dateFilter }),
      ]);

      return {
        teleCaller: tc,
        assignedLeads,
        callsMade,
        visitsBooked,
        handoffsSubmitted,
      };
    })
  );

  return res
    .status(200)
    .json(new ApiResponse(200, { performance }, 'Tele-caller performance metrics fetched'));
};

/**
 * GET /api/crm/analytics/matching
 */
const getMatchingAnalytics = async (req, res) => {
  const totalShortlisted = await CRMShortlist.countDocuments({});
  const clientInterestStats = await CRMShortlist.aggregate([
    { $group: { _id: '$clientInterest', count: { $sum: 1 } } },
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalShortlisted,
        byClientInterest: clientInterestStats,
      },
      'Matching & Shortlist analytics fetched'
    )
  );
};

/**
 * GET /api/crm/analytics/whatsapp
 */
const getWhatsAppAnalytics = async (req, res) => {
  const [totalShares, stats] = await Promise.all([
    CRMPropertyShare.countDocuments({}),
    CRMPropertyShare.aggregate([
      {
        $group: {
          _id: null,
          totalViews: { $sum: '$viewCount' },
        },
      },
    ]),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalShares,
        totalClientViews: stats[0]?.totalViews || 0,
      },
      'WhatsApp sharing analytics fetched'
    )
  );
};

module.exports = {
  getLeadAnalytics,
  getCallAnalytics,
  getSiteVisitAnalytics,
  getConversionAnalytics,
  getTeleCallerPerformance,
  getMatchingAnalytics,
  getWhatsAppAnalytics,
};
