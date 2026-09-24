const mongoose = require('mongoose');
const CRMLead = require('../../../models/crm/Lead');
const CRMCall = require('../../../models/crm/Call');
const CRMFollowUp = require('../../../models/crm/FollowUp');
const CRMSiteVisit = require('../../../models/crm/SiteVisit');
const CRMHandoff = require('../../../models/crm/CRMHandoff');
const User = require('../../../models/User');
const ApiResponse = require('../../../utils/ApiResponse');
const ApiError = require('../../../utils/ApiError');

/**
 * GET /api/admin/crm/dashboard
 * Super Admin CRM Dashboard Aggregation
 */
const getCRMDashboardStats = async (req, res) => {
  const {
    dateFrom,
    dateTo,
    teleCallerId,
    status,
    source,
    priority,
    locality,
    requirementType,
  } = req.query;

  // Build filter query for leads
  const leadQuery = { archived: { $ne: true } };

  if (dateFrom || dateTo) {
    leadQuery.createdAt = {};
    if (dateFrom) leadQuery.createdAt.$gte = new Date(dateFrom);
    if (dateTo) leadQuery.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }

  if (teleCallerId && mongoose.Types.ObjectId.isValid(teleCallerId)) {
    leadQuery.assignedTo = new mongoose.Types.ObjectId(teleCallerId);
  }

  if (status) leadQuery.status = status.toLowerCase();
  if (source) leadQuery.source = source.toLowerCase();
  if (priority) leadQuery.priority = priority.toLowerCase();
  if (requirementType) leadQuery.requirementType = requirementType.toLowerCase();

  // Time boundaries for Today
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  // Parallel Aggregation
  const [
    leadStatusCounts,
    totalLeadsCount,
    callsTodayCount,
    followUpsTodayCount,
    overdueFollowUpsCount,
    siteVisitsTodayCount,
    pendingHandoffsCount,
    callerCounts,
  ] = await Promise.all([
    // 1. Group leads by status
    CRMLead.aggregate([
      { $match: leadQuery },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    // 2. Total leads matching criteria
    CRMLead.countDocuments(leadQuery),

    // 3. Calls today
    CRMCall.countDocuments({
      createdAt: { $gte: startOfToday, $lte: endOfToday },
      ...(teleCallerId && mongoose.Types.ObjectId.isValid(teleCallerId)
        ? { teleCaller: new mongoose.Types.ObjectId(teleCallerId) }
        : {}),
    }),

    // 4. Follow-ups due today
    CRMFollowUp.countDocuments({
      scheduledAt: { $gte: startOfToday, $lte: endOfToday },
      ...(teleCallerId && mongoose.Types.ObjectId.isValid(teleCallerId)
        ? { assignedTo: new mongoose.Types.ObjectId(teleCallerId) }
        : {}),
    }),

    // 5. Overdue follow-ups
    CRMFollowUp.countDocuments({
      scheduledAt: { $lt: startOfToday },
      status: 'pending',
      ...(teleCallerId && mongoose.Types.ObjectId.isValid(teleCallerId)
        ? { assignedTo: new mongoose.Types.ObjectId(teleCallerId) }
        : {}),
    }),

    // 6. Site visits scheduled today
    CRMSiteVisit.countDocuments({
      scheduledAt: { $gte: startOfToday, $lte: endOfToday },
    }),

    // 7. Pending handoffs to Super Admin
    CRMHandoff.countDocuments({
      status: 'pending',
      ...(teleCallerId && mongoose.Types.ObjectId.isValid(teleCallerId)
        ? { teleCaller: new mongoose.Types.ObjectId(teleCallerId) }
        : {}),
    }),

    // 8. Active vs Inactive Tele-callers
    User.aggregate([
      { $match: { role: 'tele_caller' } },
      { $group: { _id: '$isActive', count: { $sum: 1 } } },
    ]),
  ]);

  // Map lead status counts
  const statusMap = {};
  leadStatusCounts.forEach((item) => {
    statusMap[item._id] = item.count;
  });

  // Map caller counts
  let activeCallers = 0;
  let inactiveCallers = 0;
  callerCounts.forEach((item) => {
    if (item._id === true) activeCallers = item.count;
    else inactiveCallers = item.count;
  });

  const dashboardData = {
    totalLeads: totalLeadsCount,
    newLeads: statusMap['new'] || 0,
    contactedLeads: statusMap['contacted'] || 0,
    qualifiedLeads: statusMap['qualified'] || 0,
    matchingLeads: statusMap['matching'] || 0,
    shortlistedLeads: statusMap['shortlisted'] || 0,
    siteVisitLeads: statusMap['site_visit'] || 0,
    negotiationLeads: statusMap['negotiation'] || 0,
    convertedLeads: statusMap['converted'] || 0,
    lostLeads: statusMap['lost'] || 0,

    callsToday: callsTodayCount,
    followUpsToday: followUpsTodayCount,
    overdueFollowUps: overdueFollowUpsCount,
    siteVisitsToday: siteVisitsTodayCount,
    pendingHandoffs: pendingHandoffsCount,

    activeCallers,
    inactiveCallers,
    totalCallers: activeCallers + inactiveCallers,
  };

  return res.json(
    new ApiResponse(200, dashboardData, 'Super Admin CRM Dashboard metrics retrieved successfully')
  );
};

module.exports = {
  getCRMDashboardStats,
};
