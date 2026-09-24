const CRMActivity = require('../../models/crm/CRMActivity');
const CRMLead = require('../../models/crm/Lead');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

/**
 * GET /api/crm/activity
 */
const getAllActivity = async (req, res) => {
  const { page = 1, limit = 30, action, entityType, performedBy } = req.query;

  const filter = {};
  if (action) filter.action = action;
  if (entityType) filter.entityType = entityType;
  if (performedBy) filter.performedBy = performedBy;

  if (req.user.role === 'tele_caller') {
    filter.performedBy = req.user._id;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [activities, total] = await Promise.all([
    CRMActivity.find(filter)
      .populate('performedBy', 'name staffId role profilePhoto')
      .populate('lead', 'leadId name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CRMActivity.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        activities,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)) || 1,
        },
      },
      'Activity logs fetched successfully'
    )
  );
};

/**
 * GET /api/crm/leads/:leadId/activity
 */
const getActivityForLead = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const activities = await CRMActivity.find({ lead: lead._id })
    .populate('performedBy', 'name staffId role')
    .sort({ createdAt: -1 })
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, { activities }, 'Lead activity trail fetched'));
};

/**
 * GET /api/crm/activity/:activityId
 */
const getActivityById = async (req, res) => {
  const { activityId } = req.params;

  const activity = await CRMActivity.findById(activityId)
    .populate('performedBy', 'name staffId role')
    .populate('lead')
    .lean();

  if (!activity) throw new ApiError(404, 'Activity log entry not found');

  return res.status(200).json(new ApiResponse(200, { activity }, 'Activity log fetched'));
};

module.exports = {
  getAllActivity,
  getActivityForLead,
  getActivityById,
};
