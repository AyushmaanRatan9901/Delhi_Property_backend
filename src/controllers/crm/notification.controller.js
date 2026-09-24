const CRMNotification = require('../../models/crm/CRMNotification');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

/**
 * GET /api/crm/notifications
 */
const getNotifications = async (req, res) => {
  const { page = 1, limit = 30, unreadOnly = 'false' } = req.query;

  const filter = { recipient: req.user._id };
  if (unreadOnly === 'true') filter.isRead = false;

  const skip = (Number(page) - 1) * Number(limit);

  const [notifications, total, unreadCount] = await Promise.all([
    CRMNotification.find(filter)
      .populate('lead', 'leadId name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CRMNotification.countDocuments(filter),
    CRMNotification.countDocuments({ recipient: req.user._id, isRead: false }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        notifications,
        unreadCount,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)) || 1,
        },
      },
      'Notifications fetched'
    )
  );
};

/**
 * PATCH /api/crm/notifications/:notificationId/read
 */
const markAsRead = async (req, res) => {
  const { notificationId } = req.params;

  const notification = await CRMNotification.findOneAndUpdate(
    { _id: notificationId, recipient: req.user._id },
    { isRead: true, readAt: new Date() },
    { new: true }
  );

  if (!notification) throw new ApiError(404, 'Notification not found');

  return res
    .status(200)
    .json(new ApiResponse(200, { notification }, 'Notification marked as read'));
};

/**
 * PATCH /api/crm/notifications/read-all
 */
const markAllAsRead = async (req, res) => {
  await CRMNotification.updateMany(
    { recipient: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  return res.status(200).json(new ApiResponse(200, null, 'All notifications marked as read'));
};

/**
 * DELETE /api/crm/notifications/:notificationId
 */
const deleteNotification = async (req, res) => {
  const { notificationId } = req.params;

  await CRMNotification.findOneAndDelete({
    _id: notificationId,
    recipient: req.user._id,
  });

  return res.status(200).json(new ApiResponse(200, null, 'Notification deleted'));
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
