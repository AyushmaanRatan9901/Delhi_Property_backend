const Notification = require('../models/Notification');
const PropertyLead = require('../models/propertyLeadModel');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { emitToUser, emitToRole, broadcast } = require('../config/socket');

/**
 * Utility Helper: Create Notification in Database and Push Real-Time via Socket.io
 */
const createAndSendNotification = async ({
  recipient = null,
  recipientRole = 'super_admin',
  sender = null,
  senderName = 'System',
  title,
  message,
  type = 'system',
  priority = 'medium',
  leadId = null,
  propertyId = null,
  data = {},
}) => {
  try {
    const notif = await Notification.create({
      recipient,
      recipientRole,
      sender,
      senderName,
      title,
      message,
      type,
      priority,
      leadId,
      propertyId,
      data,
      isRead: false,
    });

    // Format for socket payload matching frontend expectations
    const socketPayload = {
      _id: notif._id,
      id: notif._id.toString(),
      title: notif.title,
      message: notif.message,
      type: notif.type,
      priority: notif.priority,
      leadId: notif.leadId,
      lead: data?.lead || null,
      data: notif.data,
      createdAt: notif.createdAt.toISOString(),
      read: false,
      isRead: false,
    };

    if (recipient) {
      emitToUser(recipient.toString(), 'notification:new', socketPayload);
    }
    if (recipientRole) {
      emitToRole(recipientRole, 'notification:new', socketPayload);
    }
    // Also broadcast to super_admin role for all platform notifications
    if (recipientRole !== 'super_admin') {
      emitToRole('super_admin', 'notification:new', socketPayload);
    }

    return notif;
  } catch (err) {
    console.error('❌ Error creating/sending notification:', err.message);
    return null;
  }
};

/**
 * Auto-Sync & Backfill Real Data into Notifications from existing MongoDB records
 */
const autoSeedRealDataNotifications = async () => {
  try {
    const count = await Notification.countDocuments();
    if (count > 0) return; // Already initialized

    console.log('🔄 Initializing real database event notifications...');

    // 1. Fetch real Property Leads
    const leads = await PropertyLead.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('createdBy', 'name role phone')
      .populate('assignedTo', 'name role phone')
      .lean();

    const notifDocs = [];

    for (const lead of leads) {
      const propTitle =
        lead.title || lead.locality || lead.propertyDetails?.address?.city || lead.leadId || 'Property';
      const loc = lead.locality || lead.city || 'Delhi NCR';
      const amt = Number(lead.expectedPrice || lead.rentAmount || lead.price || 0);

      // Lead Submission Event
      notifDocs.push({
        recipientRole: 'super_admin',
        title: `📋 New Property Lead Submitted: ${propTitle}`,
        message: `Lead #${lead.leadId || lead._id.toString().slice(-6)} in ${loc} submitted with expected price ₹${amt.toLocaleString('en-IN')}.`,
        type: 'lead_submitted',
        priority: amt > 100000 ? 'high' : 'medium',
        leadId: lead._id,
        propertyId: lead.propertyId || lead.leadId,
        data: {
          leadId: lead.leadId || lead._id.toString().slice(-6),
          propertyTitle: propTitle,
          locality: loc,
          city: lead.city || 'Delhi',
          amount: amt,
          userName: lead.createdBy?.name || lead.ownerName || 'Agent',
          phone: lead.createdBy?.phone || lead.ownerPhone || '',
          staffName: lead.assignedStaffName || lead.assignedTo?.name || null,
        },
        createdAt: lead.createdAt || new Date(),
        isRead: false,
      });

      // If Assigned to Staff
      if (lead.assignedTo || lead.assignedStaffName) {
        notifDocs.push({
          recipient: lead.assignedTo?._id || lead.assignedTo,
          recipientRole: 'verification_staff',
          title: `🛡️ Lead Assigned for Physical Verification`,
          message: `Property "${propTitle}" assigned to ${lead.assignedStaffName || 'Staff'} for on-site inspection.`,
          type: 'lead_assigned',
          priority: 'high',
          leadId: lead._id,
          data: {
            leadId: lead.leadId || lead._id.toString().slice(-6),
            propertyTitle: propTitle,
            locality: loc,
            staffName: lead.assignedStaffName || 'Field Staff',
            amount: amt,
          },
          createdAt: lead.assignedAt || lead.createdAt || new Date(),
          isRead: false,
        });
      }

      // If Verified
      if (lead.status === 'verified' || lead.verifiedAt) {
        notifDocs.push({
          recipientRole: 'super_admin',
          title: `✅ Physical Inspection Completed & Verified`,
          message: `Property "${propTitle}" in ${loc} verified on-site by ${lead.verifiedStaffName || 'Staff'}.`,
          type: 'lead_verified',
          priority: 'medium',
          leadId: lead._id,
          data: {
            leadId: lead.leadId || lead._id.toString().slice(-6),
            propertyTitle: propTitle,
            locality: loc,
            staffName: lead.verifiedStaffName || 'Staff',
            amount: amt,
          },
          createdAt: lead.verifiedAt || new Date(),
          isRead: true,
        });
      }

      // If Complaints / Fraud
      if (Array.isArray(lead.complaints) && lead.complaints.length > 0) {
        for (const c of lead.complaints) {
          const isFraud = ['fake_scam', 'scam_alert', 'owner_fraud', 'misleading_media', 'invalid_address'].includes(c.category);
          notifDocs.push({
            recipientRole: 'super_admin',
            title: isFraud ? `🚨 URGENT FRAUD ALERT: Fake / Scam Lead Reported` : `⚠️ Maintenance Complaint Logged: ${c.title}`,
            message: `Staff ${c.assignedStaffName || 'Inspector'} reported: "${c.description || c.title}" on ${propTitle}.`,
            type: isFraud ? 'scam_alert' : 'complaint_logged',
            priority: isFraud ? 'urgent' : 'high',
            leadId: lead._id,
            data: {
              leadId: lead.leadId || lead._id.toString().slice(-6),
              propertyTitle: propTitle,
              locality: loc,
              ticketId: c.ticketId,
              complaintCategory: c.category,
              notes: c.description,
              staffName: c.assignedStaffName,
            },
            createdAt: c.createdAt || new Date(),
            isRead: false,
          });
        }
      }

      // If Commission / Deal
      if (lead.commission && lead.commission.amount > 0) {
        notifDocs.push({
          recipientRole: 'super_admin',
          title: `💰 Commission Payout Ready for Approval: ₹${Number(lead.commission.amount).toLocaleString('en-IN')}`,
          message: `Commission of ₹${Number(lead.commission.amount).toLocaleString('en-IN')} ready on lead ${lead.leadId || propTitle}.`,
          type: 'commission_requested',
          priority: 'high',
          leadId: lead._id,
          data: {
            leadId: lead.leadId || lead._id.toString().slice(-6),
            propertyTitle: propTitle,
            locality: loc,
            amount: Number(lead.commission.amount),
            userName: lead.commission.agentName || 'Agent',
            paymentMode: 'Bank Transfer / IMPS',
          },
          createdAt: lead.updatedAt || new Date(),
          isRead: false,
        });
      }
    }

    // 2. Fetch Users
    const users = await User.find().sort({ createdAt: -1 }).limit(10).lean();
    for (const u of users) {
      notifDocs.push({
        recipientRole: 'super_admin',
        title: `👤 New User Created: ${u.name} (${u.role.replace('_', ' ').toUpperCase()})`,
        message: `${u.name} registered with phone ${u.phone || 'N/A'} (ID: ${u.staffId || u._id.toString().slice(-6)}).`,
        type: 'user_created',
        priority: 'normal',
        data: {
          userId: u._id.toString(),
          userName: u.name,
          userRole: u.role,
          phone: u.phone,
          locality: u.address?.city || 'Delhi NCR',
        },
        createdAt: u.createdAt || new Date(),
        isRead: true,
      });
    }

    if (notifDocs.length > 0) {
      await Notification.insertMany(notifDocs);
      console.log(`✅ Auto-seeded ${notifDocs.length} real notifications!`);
    }
  } catch (err) {
    console.error('Error auto-seeding real notifications:', err.message);
  }
};

/**
 * GET /api/v1/notifications
 * @desc Get paginated notifications and unread count for the authenticated user / SuperAdmin
 */
const getMyNotifications = async (req, res) => {
  const userId = req.user._id;
  const userRole = req.user.role;
  const { page = 1, limit = 100, isRead, type, category, panelSource, search } = req.query;

  // Auto-backfill real notifications if empty
  await autoSeedRealDataNotifications();

  let query = {};

  if (userRole === 'super_admin') {
    // Super Admin receives all system, admin, and role notifications
    query = {};
  } else if (userRole === 'admin') {
    query = {
      $or: [
        { recipient: userId },
        { recipientRole: 'admin' },
        { recipientRole: 'super_admin' },
        { recipientRole: 'verification_staff' },
      ],
    };
  } else {
    query = {
      $or: [{ recipient: userId }, { recipientRole: userRole }],
    };
  }

  if (isRead !== undefined && isRead !== 'all') {
    query.isRead = isRead === 'true' || isRead === true;
  }

  if (type && type !== 'ALL') {
    query.type = type;
  }

  if (search && search.trim()) {
    const sRegex = new RegExp(search.trim(), 'i');
    query.$or = [
      { title: sRegex },
      { message: sRegex },
      { 'data.leadId': sRegex },
      { 'data.propertyTitle': sRegex },
      { 'data.userName': sRegex },
      { 'data.locality': sRegex },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('leadId', 'title leadId locality city propertyType rentAmount price status images photos')
      .populate('sender', 'name role avatar phone')
      .lean(),
    Notification.countDocuments(query),
    Notification.countDocuments({
      ...query,
      isRead: false,
    }),
  ]);

  // Normalize objects for frontend consistency
  const normalized = notifications.map((n) => {
    let cat = 'SYSTEM';
    if (n.type === 'scam_alert' || n.type?.includes('complaint')) cat = 'FRAUD_COMPLAINT';
    else if (n.type?.includes('commission') || n.type?.includes('payout')) cat = 'COMMISSION_PAYOUT';
    else if (n.type?.includes('inspection') || n.type === 'lead_verified') cat = 'PROPERTY_VERIFICATION';
    else if (n.type?.includes('lead') || n.type?.includes('duplicate')) cat = 'LEAD';
    else if (n.type?.includes('user') || n.type?.includes('kyc')) cat = 'USER';

    let panel = 'SYSTEM_ADMIN';
    if (n.recipientRole === 'verification_staff' || n.sender?.role === 'field_staff') panel = 'VERIFICATION_STAFF';
    else if (n.sender?.role === 'agent' || n.sender?.role === 'broker') panel = 'BROKER_AGENT';
    else if (n.sender?.role === 'tenant') panel = 'TENANT';
    else if (n.sender?.role === 'owner') panel = 'OWNER';

    return {
      _id: n._id,
      id: n._id.toString(),
      title: n.title,
      message: n.message,
      type: n.type,
      category: cat,
      panelSource: panel,
      priority: (n.priority || 'medium').toUpperCase(),
      leadId: n.leadId?._id || n.leadId,
      lead: n.leadId || n.data?.lead || null,
      data: n.data || {},
      meta: {
        ...(n.data || {}),
        leadId: n.data?.leadId || n.leadId?.leadId,
        propertyTitle: n.data?.propertyTitle || n.leadId?.title,
        locality: n.data?.locality || n.leadId?.locality,
        city: n.data?.city || n.leadId?.city,
        amount: n.data?.amount || n.leadId?.rentAmount || n.leadId?.price,
        staffName: n.data?.staffName || n.sender?.name,
      },
      createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : new Date().toISOString(),
      read: Boolean(n.isRead),
      isRead: Boolean(n.isRead),
      actionRequired: n.priority === 'urgent' || n.priority === 'high' || n.type === 'scam_alert',
      actionType:
        n.type === 'scam_alert'
          ? 'INVESTIGATE_FRAUD'
          : n.type === 'commission_requested'
          ? 'APPROVE_PAYOUT'
          : n.type === 'lead_submitted'
          ? 'REVIEW_LEAD'
          : n.type === 'lead_verified'
          ? 'VIEW_PROPERTY'
          : 'INSPECT_USER',
      readAt: n.readAt,
    };
  });

  return res.json(
    new ApiResponse(
      200,
      {
        notifications: normalized,
        unreadCount,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
      'Notifications fetched successfully'
    )
  );
};

/**
 * PATCH /api/v1/notifications/:id/read
 * @desc Mark a single notification as read
 */
const markNotificationRead = async (req, res) => {
  const { id } = req.params;

  const notif = await Notification.findById(id);

  if (!notif) {
    throw new ApiError(404, 'Notification not found');
  }

  notif.isRead = true;
  notif.readAt = new Date();
  await notif.save();

  const unreadCount = await Notification.countDocuments({
    isRead: false,
  });

  return res.json(
    new ApiResponse(
      200,
      {
        notification: {
          ...notif.toObject(),
          id: notif._id.toString(),
          read: true,
          isRead: true,
        },
        unreadCount,
      },
      'Notification marked as read'
    )
  );
};

/**
 * PATCH /api/v1/notifications/mark-all-read
 * @desc Mark all notifications as read
 */
const markAllNotificationsRead = async (req, res) => {
  const result = await Notification.updateMany(
    { isRead: false },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
      },
    }
  );

  return res.json(
    new ApiResponse(
      200,
      { modifiedCount: result.modifiedCount, unreadCount: 0 },
      'All notifications marked as read'
    )
  );
};

/**
 * DELETE /api/v1/notifications/:id
 * @desc Delete a single notification
 */
const deleteNotification = async (req, res) => {
  const { id } = req.params;

  const notif = await Notification.findByIdAndDelete(id);

  if (!notif) {
    throw new ApiError(404, 'Notification not found');
  }

  const unreadCount = await Notification.countDocuments({
    isRead: false,
  });

  return res.json(
    new ApiResponse(
      200,
      { unreadCount },
      'Notification deleted successfully'
    )
  );
};

/**
 * DELETE /api/v1/notifications/clear-all
 * @desc Clear all notifications
 */
const clearAllNotifications = async (req, res) => {
  await Notification.deleteMany({});

  return res.json(
    new ApiResponse(
      200,
      { unreadCount: 0 },
      'All notifications cleared successfully'
    )
  );
};

module.exports = {
  createAndSendNotification,
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
  autoSeedRealDataNotifications,
};
