const CRMLead = require('../../models/crm/Lead');
const CRMCall = require('../../models/crm/Call');
const CRMSiteVisit = require('../../models/crm/SiteVisit');
const CRMFollowUp = require('../../models/crm/FollowUp');
const CRMHandoff = require('../../models/crm/CRMHandoff');
const CRMActivity = require('../../models/crm/CRMActivity');
const CRMNotification = require('../../models/crm/CRMNotification');
const ApiResponse = require('../../utils/ApiResponse');

/**
 * GET /api/crm/dashboard
 * Aggregates CRM statistics for the dashboard
 */
const getDashboardStats = async (req, res) => {
  const userId = req.user._id;
  const isSuperAdminOrAdmin = ['super_admin', 'admin'].includes(req.user.role);

  // Scope leads if tele_caller
  const leadFilter = isSuperAdminOrAdmin ? { archived: { $ne: true } } : { assignedTo: userId, archived: { $ne: true } };

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const [
    newLeads,
    contactedLeads,
    qualifiedLeads,
    matchingLeads,
    shortlistedLeads,
    convertedLeads,
    lostLeads,
    pendingFollowups,
    overdueFollowups,
    callsToday,
    upcomingVisits,
    completedVisits,
    pendingHandoffs,
  ] = await Promise.all([
    CRMLead.countDocuments({ ...leadFilter, status: 'new' }),
    CRMLead.countDocuments({ ...leadFilter, status: 'contacted' }),
    CRMLead.countDocuments({ ...leadFilter, status: 'qualified' }),
    CRMLead.countDocuments({ ...leadFilter, status: 'matching' }),
    CRMLead.countDocuments({ ...leadFilter, status: 'shortlisted' }),
    CRMLead.countDocuments({ ...leadFilter, status: 'converted' }),
    CRMLead.countDocuments({ ...leadFilter, status: 'lost' }),
    CRMFollowUp.countDocuments({
      ...(isSuperAdminOrAdmin ? {} : { assignedTo: userId }),
      status: 'pending',
      scheduledAt: { $gte: startOfToday, $lte: endOfToday },
    }),
    CRMFollowUp.countDocuments({
      ...(isSuperAdminOrAdmin ? {} : { assignedTo: userId }),
      status: 'pending',
      scheduledAt: { $lt: startOfToday },
    }),
    CRMCall.countDocuments({
      ...(isSuperAdminOrAdmin ? {} : { teleCaller: userId }),
      createdAt: { $gte: startOfToday, $lte: endOfToday },
    }),
    CRMSiteVisit.countDocuments({
      status: { $in: ['requested', 'confirmed', 'agent_assigned'] },
      scheduledAt: { $gte: startOfToday },
    }),
    CRMSiteVisit.countDocuments({
      status: 'completed',
    }),
    CRMHandoff.countDocuments({
      status: 'pending',
    }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        newLeads,
        contactedLeads,
        qualifiedLeads,
        matchingLeads,
        shortlistedLeads,
        convertedLeads,
        lostLeads,
        pendingFollowups,
        overdueFollowups,
        callsToday,
        upcomingVisits,
        completedVisits,
        pendingHandoffs,
        totalActiveLeads:
          newLeads + contactedLeads + qualifiedLeads + matchingLeads + shortlistedLeads,
      },
      'Dashboard analytics fetched successfully'
    )
  );
};

/**
 * GET /api/crm/dashboard/activity
 */
const getDashboardActivity = async (req, res) => {
  const isSuperAdminOrAdmin = ['super_admin', 'admin'].includes(req.user.role);
  const filter = isSuperAdminOrAdmin ? {} : { performedBy: req.user._id };

  const activities = await CRMActivity.find(filter)
    .populate('performedBy', 'name role staffId profilePhoto')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return res.status(200).json(
    new ApiResponse(200, { activities }, 'Recent activity logs fetched successfully')
  );
};

/**
 * GET /api/crm/dashboard/followups
 */
const getDashboardFollowups = async (req, res) => {
  const isSuperAdminOrAdmin = ['super_admin', 'admin'].includes(req.user.role);
  const filter = {
    ...(isSuperAdminOrAdmin ? {} : { assignedTo: req.user._id }),
    status: { $in: ['pending', 'snoozed'] },
  };

  const followups = await CRMFollowUp.find(filter)
    .populate('lead', 'leadId name phone requirementType priority status')
    .populate('assignedTo', 'name role staffId')
    .sort({ scheduledAt: 1 })
    .limit(30)
    .lean();

  return res.status(200).json(
    new ApiResponse(200, { followups }, 'Dashboard follow-ups fetched successfully')
  );
};

/**
 * GET /api/crm/dashboard/calls
 */
const getDashboardCalls = async (req, res) => {
  const isSuperAdminOrAdmin = ['super_admin', 'admin'].includes(req.user.role);
  const filter = isSuperAdminOrAdmin ? {} : { teleCaller: req.user._id };

  const calls = await CRMCall.find(filter)
    .populate('lead', 'leadId name phone requirementType')
    .populate('teleCaller', 'name staffId')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return res.status(200).json(
    new ApiResponse(200, { calls }, 'Recent calls fetched successfully')
  );
};

/**
 * GET /api/crm/dashboard/site-visits
 */
const getDashboardSiteVisits = async (req, res) => {
  const visits = await CRMSiteVisit.find({
    status: { $in: ['requested', 'confirmed', 'agent_assigned', 'client_reached', 'in_progress'] },
  })
    .populate('lead', 'leadId name phone')
    .populate('property', 'leadId title propertyType locality')
    .populate('assignedFieldAgent', 'name phone staffId')
    .sort({ scheduledAt: 1 })
    .limit(20)
    .lean();

  return res.status(200).json(
    new ApiResponse(200, { siteVisits: visits }, 'Upcoming site visits fetched successfully')
  );
};

/**
 * GET /api/crm/dashboard/notifications
 */
const getDashboardNotifications = async (req, res) => {
  const notifications = await CRMNotification.find({
    recipient: req.user._id,
  })
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  return res.status(200).json(
    new ApiResponse(200, { notifications }, 'Dashboard notifications fetched successfully')
  );
};

module.exports = {
  getDashboardStats,
  getDashboardActivity,
  getDashboardFollowups,
  getDashboardCalls,
  getDashboardSiteVisits,
  getDashboardNotifications,
};
