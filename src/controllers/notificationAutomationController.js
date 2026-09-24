const NotificationAutomation = require('../models/NotificationAutomation');
const Notification = require('../models/Notification');
const PropertyLead = require('../models/propertyLeadModel');
const RentPayment = require('../models/RentPayment');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { emitToUser, emitToRole } = require('../config/socket');

/**
 * Standard Initial Automation Rules to Seed
 */
const DEFAULT_RULES = [
  {
    name: 'Rent Reminder (5 Days Before)',
    type: 'rent_reminder',
    enabled: true,
    trigger: {
      event: 'days_before_due',
      daysBefore: 5,
      daysAfter: 0,
      recurringDays: 0,
    },
    titleTemplate: 'Rent Payment Reminder: {{property_name}}',
    messageTemplate:
      'Hello {{tenant_name}}, your rent of {{rent_amount}} for {{property_name}} ({{unit_number}}) is due on {{due_date}}. Pay securely via zero-fee UPI on the app.',
    channels: { inApp: true, push: true, sms: false, email: false },
  },
  {
    name: 'Rent Due Today Alert',
    type: 'rent_due',
    enabled: true,
    trigger: {
      event: 'on_due_date',
      daysBefore: 0,
      daysAfter: 0,
      recurringDays: 0,
    },
    titleTemplate: 'Rent Due Today: {{property_name}}',
    messageTemplate:
      'Hello {{tenant_name}}, your monthly rent of {{rent_amount}} is due today ({{due_date}}). Kindly clear your rent ledger to avoid late charges.',
    channels: { inApp: true, push: true, sms: false, email: false },
  },
  {
    name: 'Rent Overdue Immediate Alert',
    type: 'rent_overdue',
    enabled: true,
    trigger: {
      event: 'days_after_due',
      daysBefore: 0,
      daysAfter: 1,
      recurringDays: 0,
    },
    titleTemplate: '⚠️ Urgent: Rent Payment Overdue',
    messageTemplate:
      'Attention {{tenant_name}}, your rent of {{rent_amount}} for {{property_name}} was due on {{due_date}} and is now overdue. Please clear it immediately.',
    channels: { inApp: true, push: true, sms: false, email: false },
  },
  {
    name: 'Overdue Rent Recurring Follow-Up',
    type: 'overdue_followup',
    enabled: true,
    trigger: {
      event: 'recurring_days_after_due',
      daysBefore: 0,
      daysAfter: 3,
      recurringDays: 3,
    },
    titleTemplate: 'Overdue Rent Follow-up (Action Required)',
    messageTemplate:
      'Hello {{tenant_name}}, outstanding balance of {{outstanding_amount}} remains unpaid for {{property_name}} - {{unit_number}}. Please submit payment receipt or contact property manager.',
    channels: { inApp: true, push: true, sms: false, email: false },
  },
  {
    name: 'Lease Expiry 30-Day Notice',
    type: 'lease_expiry',
    enabled: true,
    trigger: {
      event: 'days_before_lease_expiry',
      daysBefore: 30,
      daysAfter: 0,
      recurringDays: 0,
    },
    titleTemplate: 'Lease Agreement Renewal Notice (30 Days)',
    messageTemplate:
      'Hello {{tenant_name}}, your tenancy agreement for {{property_name}} is set to expire on {{lease_end_date}}. Please submit a renewal request if you wish to extend your lease.',
    channels: { inApp: true, push: true, sms: false, email: false },
  },
  {
    name: 'Lease Expiry Final 7-Day Warning',
    type: 'lease_expiry_warning',
    enabled: true,
    trigger: {
      event: 'days_before_lease_expiry',
      daysBefore: 7,
      daysAfter: 0,
      recurringDays: 0,
    },
    titleTemplate: '🚨 Final Notice: Lease Expiring in 7 Days',
    messageTemplate:
      'Hello {{tenant_name}}, your lease for {{property_name}} ends on {{lease_end_date}}. Please complete your move-out inspection handover or finalize renewal.',
    channels: { inApp: true, push: true, sms: false, email: false },
  },
  {
    name: 'Security Deposit Reminder',
    type: 'security_deposit',
    enabled: true,
    trigger: {
      event: 'days_before_due',
      daysBefore: 3,
      daysAfter: 0,
      recurringDays: 0,
    },
    titleTemplate: 'Security Deposit Confirmation',
    messageTemplate:
      'Hello {{tenant_name}}, your security deposit ledger for {{property_name}} is recorded in your profile document vault.',
    channels: { inApp: true, push: true, sms: false, email: false },
  },
  {
    name: 'Routine Maintenance & Safety Inspection',
    type: 'maintenance_inspection',
    enabled: true,
    trigger: {
      event: 'scheduled_inspection',
      daysBefore: 2,
      daysAfter: 0,
      recurringDays: 0,
    },
    titleTemplate: 'Scheduled Property Safety Audit',
    messageTemplate:
      'Hello {{tenant_name}}, a routine inspection by our certified auditor is scheduled for your unit in {{property_name}} on {{due_date}}.',
    channels: { inApp: true, push: true, sms: false, email: false },
  },
];

/**
 * Helper: Interpolate dynamic template tags
 */
const interpolateTemplate = (templateStr, vars = {}) => {
  if (!templateStr) return '';
  return templateStr
    .replace(/\{\{tenant_name\}\}/gi, vars.tenant_name || 'Resident')
    .replace(/\{\{property_name\}\}/gi, vars.property_name || 'Property')
    .replace(/\{\{unit_number\}\}/gi, vars.unit_number || 'Unit')
    .replace(/\{\{rent_amount\}\}/gi, vars.rent_amount || '₹0')
    .replace(/\{\{due_date\}\}/gi, vars.due_date || 'N/A')
    .replace(/\{\{paid_date\}\}/gi, vars.paid_date || 'N/A')
    .replace(/\{\{outstanding_amount\}\}/gi, vars.outstanding_amount || vars.rent_amount || '₹0')
    .replace(/\{\{lease_start_date\}\}/gi, vars.lease_start_date || 'N/A')
    .replace(/\{\{lease_end_date\}\}/gi, vars.lease_end_date || 'N/A');
};

/**
 * GET /api/v1/notification-automations
 * @desc Get all notification automation rules (auto-seeds defaults if empty)
 */
const getNotificationAutomations = async (req, res) => {
  let rules = await NotificationAutomation.find().sort({ createdAt: 1 }).lean();

  if (rules.length === 0) {
    const seeded = await NotificationAutomation.insertMany(DEFAULT_RULES);
    rules = seeded.map((s) => s.toObject());
  }

  return res.json(
    new ApiResponse(200, rules, 'Notification automation rules retrieved successfully')
  );
};

/**
 * POST /api/v1/notification-automations
 * @desc Create new notification automation rule
 */
const createNotificationAutomation = async (req, res) => {
  const { name, type, enabled, trigger, titleTemplate, messageTemplate, channels } = req.body;

  if (!name || !type || !titleTemplate || !messageTemplate) {
    throw new ApiError(400, 'Name, type, titleTemplate, and messageTemplate are required');
  }

  const rule = await NotificationAutomation.create({
    name,
    type,
    enabled: enabled !== undefined ? enabled : true,
    trigger: trigger || { event: 'days_before_due', daysBefore: 5 },
    titleTemplate,
    messageTemplate,
    channels: channels || { inApp: true, push: true, sms: false, email: false },
    createdBy: req.user._id,
  });

  return res.json(
    new ApiResponse(201, rule, 'Notification automation rule created successfully')
  );
};

/**
 * PATCH /api/v1/notification-automations/:id
 * @desc Update notification automation rule
 */
const updateNotificationAutomation = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const rule = await NotificationAutomation.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });

  if (!rule) {
    throw new ApiError(404, 'Notification automation rule not found');
  }

  return res.json(
    new ApiResponse(200, rule, 'Notification automation rule updated successfully')
  );
};

/**
 * PATCH /api/v1/notification-automations/:id/toggle
 * @desc Enable or disable an automation rule
 */
const toggleAutomationRule = async (req, res) => {
  const { id } = req.params;

  const rule = await NotificationAutomation.findById(id);
  if (!rule) {
    throw new ApiError(404, 'Notification automation rule not found');
  }

  rule.enabled = !rule.enabled;
  await rule.save();

  return res.json(
    new ApiResponse(
      200,
      rule,
      `Automation rule ${rule.enabled ? 'Enabled' : 'Disabled'} successfully`
    )
  );
};

/**
 * POST /api/v1/notifications/send-manual
 * @desc Superadmin sends manual rent reminder with reviewable template interpolation
 */
const sendManualRentReminder = async (req, res) => {
  const {
    tenantId,
    propertyId,
    leadId,
    title,
    message,
    amount,
    dueDate,
    type = 'rent_reminder',
    priority = 'high',
  } = req.body;

  if (!tenantId || !title || !message) {
    throw new ApiError(400, 'tenantId, title, and message are required');
  }

  // Find tenant user
  let tenantUser = null;
  if (mongoose.Types.ObjectId.isValid(tenantId)) {
    tenantUser = await User.findById(tenantId).lean();
  }

  // Find property lead
  let lead = null;
  const propRef = leadId || propertyId;
  if (propRef && mongoose.Types.ObjectId.isValid(propRef)) {
    lead = await PropertyLead.findById(propRef).lean();
  }

  const propTitle = lead?.title || lead?.locality || 'Property';
  const unitNum =
    lead?.unitNumber ||
    lead?.propertyDetails?.flatNumber ||
    (lead?.propertyDetails?.address?.flatNo ? `Flat ${lead.propertyDetails.address.flatNo}` : 'Unit A');

  // Interpolate dynamic variables
  const templateVars = {
    tenant_name: tenantUser?.name || lead?.deal?.tenantName || 'Resident',
    property_name: propTitle,
    unit_number: unitNum,
    rent_amount: amount ? `₹${Number(amount).toLocaleString('en-IN')}` : `₹${Number(lead?.deal?.finalPrice || 18000).toLocaleString('en-IN')}`,
    due_date: dueDate ? new Date(dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '05 Sep 2026',
    outstanding_amount: amount ? `₹${Number(amount).toLocaleString('en-IN')}` : '₹18,000',
  };

  const finalTitle = interpolateTemplate(title, templateVars);
  const finalMessage = interpolateTemplate(message, templateVars);

  const recipientId = tenantUser?._id || (mongoose.Types.ObjectId.isValid(tenantId) ? tenantId : null);

  const notif = await Notification.create({
    recipient: recipientId,
    recipientRole: 'tenant',
    sender: req.user._id,
    senderName: req.user.name || 'Super Admin',
    title: finalTitle,
    message: finalMessage,
    type,
    priority,
    leadId: lead?._id || null,
    propertyId: propRef ? String(propRef) : null,
    tenantId: recipientId,
    data: {
      propertyName: propTitle,
      unitNumber: unitNum,
      amount: amount || lead?.deal?.finalPrice,
      dueDate: dueDate || new Date(),
      leadId: lead?.leadId || lead?._id,
    },
    isRead: false,
  });

  const socketPayload = {
    _id: notif._id,
    id: notif._id.toString(),
    title: notif.title,
    message: notif.message,
    type: notif.type,
    priority: notif.priority,
    leadId: notif.leadId,
    data: notif.data,
    createdAt: notif.createdAt.toISOString(),
    isRead: false,
    read: false,
  };

  if (recipientId) {
    emitToUser(recipientId.toString(), 'notification:new', socketPayload);
  }
  emitToRole('tenant', 'notification:new', socketPayload);
  emitToRole('super_admin', 'notification:new', socketPayload);

  return res.json(
    new ApiResponse(
      200,
      notif,
      `Rent reminder successfully dispatched to ${templateVars.tenant_name}!`
    )
  );
};

/**
 * POST /api/v1/notifications/send-custom
 * @desc Superadmin dispatches custom notification to any user or role
 */
const sendCustomNotification = async (req, res) => {
  const {
    recipientId,
    recipientRole = 'tenant',
    propertyId,
    leadId,
    type = 'custom',
    title,
    message,
    priority = 'medium',
  } = req.body;

  if (!title || !message) {
    throw new ApiError(400, 'Title and message are required');
  }

  let lead = null;
  const propRef = leadId || propertyId;
  if (propRef && mongoose.Types.ObjectId.isValid(propRef)) {
    lead = await PropertyLead.findById(propRef).lean();
  }

  const notif = await Notification.create({
    recipient: recipientId && mongoose.Types.ObjectId.isValid(recipientId) ? recipientId : null,
    recipientRole: recipientRole || 'tenant',
    sender: req.user._id,
    senderName: req.user.name || 'Super Admin',
    title: title.trim(),
    message: message.trim(),
    type,
    priority,
    leadId: lead?._id || null,
    propertyId: propRef ? String(propRef) : null,
    data: {
      propertyTitle: lead?.title || lead?.locality,
      locality: lead?.locality,
    },
    isRead: false,
  });

  const socketPayload = {
    _id: notif._id,
    id: notif._id.toString(),
    title: notif.title,
    message: notif.message,
    type: notif.type,
    priority: notif.priority,
    leadId: notif.leadId,
    data: notif.data,
    createdAt: notif.createdAt.toISOString(),
    isRead: false,
  };

  if (recipientId) {
    emitToUser(recipientId.toString(), 'notification:new', socketPayload);
  } else if (recipientRole) {
    emitToRole(recipientRole, 'notification:new', socketPayload);
  }
  emitToRole('super_admin', 'notification:new', socketPayload);

  return res.json(
    new ApiResponse(200, notif, 'Custom notification successfully sent!')
  );
};

/**
 * GET /api/v1/notifications/history
 * @desc Superadmin views sent notifications log with delivery statuses
 */
const getNotificationHistory = async (req, res) => {
  const { page = 1, limit = 50, type, search } = req.query;

  const query = {};
  if (type && type !== 'ALL') {
    query.type = type;
  }
  if (search && search.trim()) {
    const sRegex = new RegExp(search.trim(), 'i');
    query.$or = [
      { title: sRegex },
      { message: sRegex },
      { 'data.propertyName': sRegex },
      { 'data.propertyTitle': sRegex },
      { 'data.userName': sRegex },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [notifications, total] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('recipient', 'name phone email role')
      .populate('sender', 'name role')
      .populate('leadId', 'title locality propertyType')
      .lean(),
    Notification.countDocuments(query),
  ]);

  const history = notifications.map((n) => ({
    id: n._id.toString(),
    recipientName: n.recipient?.name || n.data?.userName || (n.recipientRole ? `All ${n.recipientRole.toUpperCase()}` : 'Resident'),
    recipientPhone: n.recipient?.phone || n.data?.phone || 'N/A',
    recipientRole: n.recipient?.role || n.recipientRole || 'tenant',
    type: n.type || 'system',
    title: n.title,
    message: n.message,
    property: n.leadId?.title || n.data?.propertyName || n.data?.propertyTitle || 'Delhi Property',
    sentAt: n.createdAt ? new Date(n.createdAt).toISOString() : new Date().toISOString(),
    status: 'Sent',
    priority: n.priority || 'medium',
    isRead: Boolean(n.isRead),
  }));

  return res.json(
    new ApiResponse(
      200,
      {
        history,
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
      'Notification history retrieved successfully'
    )
  );
};

/**
 * POST /api/v1/notification-automations/run-cron
 * @desc Background Automated Rent Workflow Engine (Runs hourly/daily with idempotency deduplication)
 */
const runAutomatedRentWorkflow = async (req, res) => {
  const enabledRules = await NotificationAutomation.find({ enabled: true }).lean();
  if (enabledRules.length === 0) {
    if (res) return res.json(new ApiResponse(200, { sentCount: 0 }, 'No active automation rules'));
    return { sentCount: 0 };
  }

  const occupiedLeads = await PropertyLead.find({
    isDeleted: false,
    $or: [
      { status: 'rented' },
      { 'deal.isClosed': true },
      { 'deal.tenantName': { $exists: true, $ne: '' } },
      { 'deal.tenantId': { $exists: true, $ne: null } },
    ],
  })
    .populate('deal.tenantId', 'name phone email')
    .lean();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthName = now.toLocaleDateString('en-IN', { month: 'short' });
  const currentMonthStr = `${currentMonthName} ${currentYear}`;
  let totalDispatched = 0;

  for (const lead of occupiedLeads) {
    const deal = lead.deal || {};
    const tenantUser = deal.tenantId || {};
    const tenantId = tenantUser._id || lead.deal?.tenantId;
    const tenantName = deal.tenantName || tenantUser.name || 'Resident';
    const rentAmount = Number(deal.finalPrice || lead.expectedPrice || 18000);
    const propTitle = lead.title || `${lead.propertyType} in ${lead.locality || 'Delhi'}`;
    const unitNumber =
      lead.unitNumber ||
      lead.propertyDetails?.flatNumber ||
      (lead.propertyDetails?.address?.flatNo ? `Flat ${lead.propertyDetails.address.flatNo}` : 'Unit A-101');

    // Due date standard: 5th of current month
    const dueDate = new Date(currentYear, now.getMonth(), 5);
    const diffTime = dueDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // > 0 means before due date, < 0 means after due date

    // Check if current month rent is already paid in rentLedger
    const ledgerEntry = Array.isArray(lead.rentLedger)
      ? lead.rentLedger.find((l) => l.month && l.month.toLowerCase().includes(currentMonthName.toLowerCase()))
      : null;
    const isPaid = ledgerEntry?.status === 'PAID' || ledgerEntry?.status === 'paid';

    // 1. Check for Overdue status update
    if (!isPaid && diffDays < 0 && lead.status === 'rented') {
      // Mark lead rent ledger entry as overdue if not already
      if (ledgerEntry && ledgerEntry.status !== 'OVERDUE') {
        await PropertyLead.updateOne(
          { _id: lead._id, 'rentLedger._id': ledgerEntry._id },
          { $set: { 'rentLedger.$.status': 'OVERDUE' } }
        );
      }
    }

    // 2. Evaluate each enabled rule
    for (const rule of enabledRules) {
      let shouldTrigger = false;
      let periodKey = currentMonthStr;

      if (rule.type === 'rent_reminder' && !isPaid) {
        // Trigger if today is within rule.trigger.daysBefore of due date
        if (diffDays === (rule.trigger.daysBefore || 5)) {
          shouldTrigger = true;
        }
      } else if (rule.type === 'rent_due' && !isPaid) {
        // Trigger on the due date (diffDays === 0)
        if (diffDays === 0) {
          shouldTrigger = true;
        }
      } else if (rule.type === 'rent_overdue' && !isPaid) {
        // Trigger 1 day after due date (diffDays === -1)
        if (diffDays === -(rule.trigger.daysAfter || 1)) {
          shouldTrigger = true;
        }
      } else if (rule.type === 'overdue_followup' && !isPaid) {
        // Trigger recurring every X days (e.g. 3, 6, 9 days overdue)
        const daysOverdue = Math.abs(diffDays);
        if (diffDays < 0 && daysOverdue % (rule.trigger.recurringDays || 3) === 0) {
          shouldTrigger = true;
          periodKey = `${currentMonthStr}_day${daysOverdue}`;
        }
      } else if (rule.type === 'lease_expiry') {
        const leaseStart = deal.leaseStartDate || lead.createdAt || new Date('2026-01-01');
        const leaseEnd = new Date(new Date(leaseStart).setMonth(new Date(leaseStart).getMonth() + (deal.leaseDurationMonths || 11)));
        const daysToLeaseEnd = Math.ceil((leaseEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysToLeaseEnd === (rule.trigger.daysBefore || 30)) {
          shouldTrigger = true;
          periodKey = `lease_30d_${leaseEnd.toISOString().slice(0, 10)}`;
        }
      }

      if (shouldTrigger && tenantId) {
        const deduplicationKey = `${tenantId}_${lead._id}_${rule.type}_${periodKey}`;

        // Idempotency check: verify notification with this unique key has not already been generated
        const existing = await Notification.findOne({ deduplicationKey });
        if (!existing) {
          const templateVars = {
            tenant_name: tenantName,
            property_name: propTitle,
            unit_number: unitNumber,
            rent_amount: `₹${rentAmount.toLocaleString('en-IN')}`,
            due_date: dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
            outstanding_amount: `₹${rentAmount.toLocaleString('en-IN')}`,
          };

          const finalTitle = interpolateTemplate(rule.titleTemplate, templateVars);
          const finalMessage = interpolateTemplate(rule.messageTemplate, templateVars);

          const notif = await Notification.create({
            recipient: tenantId,
            recipientRole: 'tenant',
            sender: null,
            senderName: 'Automated Billing Desk',
            title: finalTitle,
            message: finalMessage,
            type: rule.type,
            priority: rule.type.includes('overdue') ? 'urgent' : 'high',
            leadId: lead._id,
            propertyId: lead._id.toString(),
            tenantId,
            automationId: rule._id,
            deduplicationKey,
            data: {
              propertyName: propTitle,
              unitNumber,
              amount: rentAmount,
              dueDate: dueDate.toISOString(),
            },
            isRead: false,
          });

          emitToUser(tenantId.toString(), 'notification:new', notif);
          totalDispatched++;

          // Update rule sent count & last run time
          await NotificationAutomation.updateOne(
            { _id: rule._id },
            { $inc: { sentCount: 1 }, $set: { lastRunAt: now } }
          );
        }
      }
    }
  }

  const result = {
    success: true,
    totalDispatched,
    evaluatedProperties: occupiedLeads.length,
    timestamp: now.toISOString(),
  };

  if (res) {
    return res.json(
      new ApiResponse(200, result, `Automated rent workflow executed. ${totalDispatched} notifications dispatched.`)
    );
  }
  return result;
};

module.exports = {
  getNotificationAutomations,
  createNotificationAutomation,
  updateNotificationAutomation,
  toggleAutomationRule,
  sendManualRentReminder,
  sendCustomNotification,
  getNotificationHistory,
  runAutomatedRentWorkflow,
};
