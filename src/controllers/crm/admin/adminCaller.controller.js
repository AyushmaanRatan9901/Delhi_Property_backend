const mongoose = require('mongoose');
const User = require('../../../models/User');
const CRMLead = require('../../../models/crm/Lead');
const CRMCall = require('../../../models/crm/Call');
const CRMFollowUp = require('../../../models/crm/FollowUp');
const CRMSiteVisit = require('../../../models/crm/SiteVisit');
const CRMShortlist = require('../../../models/crm/Shortlist');
const CRMPropertyShare = require('../../../models/crm/PropertyShare');
const CRMHandoff = require('../../../models/crm/CRMHandoff');
const CRMActivity = require('../../../models/crm/CRMActivity');
const CRMAuditLog = require('../../../models/crm/AuditLog');
const auditLogService = require('../../../services/crm/auditLog.service');
const crmSocketService = require('../../../services/crm/crmSocket.service');
const ApiResponse = require('../../../utils/ApiResponse');
const ApiError = require('../../../utils/ApiError');
const { generateCRMId } = require('../../../utils/crmIdGenerator');

/**
 * Helper to compute single caller performance stats
 */
const computeCallerStats = async (callerId, dateQuery = {}) => {
  const cId = new mongoose.Types.ObjectId(callerId);

  const [
    totalLeads,
    newLeads,
    calls,
    connectedCalls,
    notReachableCalls,
    followUps,
    completedFollowUps,
    siteVisits,
    completedVisits,
    shortlists,
    whatsappShares,
    handoffs,
    conversions,
    lostLeads,
    pendingFollowUps,
    pendingVisits,
    lastActivity,
  ] = await Promise.all([
    CRMLead.countDocuments({ assignedTo: cId, archived: { $ne: true }, ...dateQuery }),
    CRMLead.countDocuments({ assignedTo: cId, status: 'new', archived: { $ne: true }, ...dateQuery }),
    CRMCall.countDocuments({ teleCaller: cId, ...dateQuery }),
    CRMCall.countDocuments({ teleCaller: cId, outcome: { $in: ['connected', 'interested', 'site_visit_requested'] }, ...dateQuery }),
    CRMCall.countDocuments({ teleCaller: cId, outcome: { $in: ['not_reachable', 'busy', 'wrong_number'] }, ...dateQuery }),
    CRMFollowUp.countDocuments({ assignedTo: cId, ...dateQuery }),
    CRMFollowUp.countDocuments({ assignedTo: cId, status: 'completed', ...dateQuery }),
    CRMSiteVisit.countDocuments({ createdBy: cId, ...dateQuery }),
    CRMSiteVisit.countDocuments({ createdBy: cId, status: { $in: ['completed', 'visit_completed'] }, ...dateQuery }),
    CRMShortlist.countDocuments({ teleCaller: cId, ...dateQuery }),
    CRMPropertyShare.countDocuments({ teleCaller: cId, ...dateQuery }),
    CRMHandoff.countDocuments({ teleCaller: cId, ...dateQuery }),
    CRMLead.countDocuments({ assignedTo: cId, status: 'converted', ...dateQuery }),
    CRMLead.countDocuments({ assignedTo: cId, status: 'lost', ...dateQuery }),
    CRMFollowUp.countDocuments({ assignedTo: cId, status: 'pending' }),
    CRMSiteVisit.countDocuments({ createdBy: cId, status: { $in: ['requested', 'confirmed', 'agent_assigned'] } }),
    CRMActivity.findOne({ performedBy: cId }).sort({ createdAt: -1 }),
  ]);

  return {
    totalLeads,
    newLeads,
    calls,
    connectedCalls,
    notReachable: notReachableCalls,
    followUps,
    completedFollowUps,
    siteVisits,
    completedVisits,
    shortlists,
    whatsappShares,
    handoffs,
    conversions,
    lostLeads,
    pendingFollowUps,
    pendingVisits,
    currentWorkload: pendingFollowUps + pendingVisits,
    lastActivityAt: lastActivity?.createdAt || null,
  };
};

/**
 * GET /api/admin/crm/callers
 * List all tele-callers with their live performance stats
 */
const getAllCallers = async (req, res) => {
  const {
    dateFrom,
    dateTo,
    status,
    search,
    page = 1,
    limit = 20,
    sort = 'name',
  } = req.query;

  const query = { role: 'tele_caller' };

  if (status === 'active') query.isActive = true;
  else if (status === 'inactive') query.isActive = false;

  if (search?.trim()) {
    const s = search.trim();
    query.$or = [
      { name: { $regex: s, $options: 'i' } },
      { phone: { $regex: s, $options: 'i' } },
      { email: { $regex: s, $options: 'i' } },
      { staffId: { $regex: s, $options: 'i' } },
    ];
  }

  const dateQuery = {};
  if (dateFrom || dateTo) {
    dateQuery.createdAt = {};
    if (dateFrom) dateQuery.createdAt.$gte = new Date(dateFrom);
    if (dateTo) dateQuery.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }

  const skip = (Number(page) - 1) * Number(limit);
  const total = await User.countDocuments(query);
  const callers = await User.find(query)
    .sort({ [sort]: 1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  // Attach performance stats for each caller
  const items = await Promise.all(
    callers.map(async (caller) => {
      const stats = await computeCallerStats(caller._id, dateQuery);
      return {
        caller: {
          id: caller._id,
          staffId: caller.staffId,
          name: caller.name,
          phone: caller.phone,
          email: caller.email,
          status: caller.isActive ? 'active' : 'inactive',
          designation: caller.designation || 'Tele-caller',
          joiningDate: caller.joiningDate || caller.createdAt,
          lastLogin: caller.lastLogin,
        },
        statistics: stats,
        lastActivityAt: stats.lastActivityAt,
        currentWorkload: stats.currentWorkload,
        pendingFollowUps: stats.pendingFollowUps,
        pendingSiteVisits: stats.pendingVisits,
      };
    })
  );

  return res.json(
    new ApiResponse(200, items, 'Tele-callers retrieved successfully', {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    })
  );
};

/**
 * GET /api/admin/crm/callers/:id
 * Retrieve complete caller overview & breakdown
 */
const getCallerById = async (req, res) => {
  const { id } = req.params;

  let caller = null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    caller = await User.findById(id).lean();
  }
  if (!caller && id) {
    caller = await User.findOne({ staffId: id }).lean();
  }

  if (!caller || caller.role !== 'tele_caller') {
    throw new ApiError(404, 'Tele-caller not found');
  }

  const cId = caller._id;

  // Lead status breakdown
  const [leadStatusAgg, stats, recentActivities, recentCalls, upcomingFollowUps, upcomingVisits, recentHandoffs] =
    await Promise.all([
      CRMLead.aggregate([
        { $match: { assignedTo: cId, archived: { $ne: true } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      computeCallerStats(cId),
      CRMActivity.find({ performedBy: cId }).sort({ createdAt: -1 }).limit(10).lean(),
      CRMCall.find({ teleCaller: cId })
        .populate('lead', 'leadId name phone')
        .sort({ startedAt: -1 })
        .limit(10)
        .lean(),
      CRMFollowUp.find({ assignedTo: cId, status: 'pending' })
        .populate('lead', 'leadId name phone')
        .sort({ scheduledAt: 1 })
        .limit(10)
        .lean(),
      CRMSiteVisit.find({ createdBy: cId, status: { $in: ['requested', 'confirmed', 'agent_assigned'] } })
        .populate('lead', 'leadId name phone')
        .populate('property', 'locality leadId title')
        .sort({ scheduledAt: 1 })
        .limit(10)
        .lean(),
      CRMHandoff.find({ teleCaller: cId })
        .populate('lead', 'leadId name phone')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

  const leadStatusDistribution = {};
  leadStatusAgg.forEach((item) => {
    leadStatusDistribution[item._id] = item.count;
  });

  const responseData = {
    profile: {
      id: caller._id,
      staffId: caller.staffId,
      name: caller.name,
      phone: caller.phone,
      email: caller.email,
      role: caller.role,
      status: caller.isActive ? 'active' : 'inactive',
      designation: caller.designation || 'Tele-caller',
      joiningDate: caller.joiningDate || caller.createdAt,
      lastLogin: caller.lastLogin,
    },
    assignedLeadCount: stats.totalLeads,
    leadStatusDistribution,
    statistics: stats,
    recentActivities,
    recentCalls,
    upcomingFollowUps,
    upcomingSiteVisits: upcomingVisits,
    recentHandoffs,
  };

  return res.json(new ApiResponse(200, responseData, 'Tele-caller details retrieved successfully'));
};

/**
 * POST /api/admin/crm/callers
 * Create a new tele-caller user
 */
const createCaller = async (req, res) => {
  const { name, phone, email, designation, joiningDate } = req.body;

  if (!name || !phone) {
    throw new ApiError(400, 'Name and phone are required to register a tele-caller');
  }

  const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
  const existingUser = await User.findOne({ phone: cleanPhone });
  if (existingUser) {
    throw new ApiError(409, `User with phone ${cleanPhone} already exists`);
  }

  const staffId = `TC-${Math.floor(1000 + Math.random() * 9000)}`;

  const newCaller = await User.create({
    name: name.trim(),
    phone: cleanPhone,
    email: email?.trim()?.toLowerCase(),
    role: 'tele_caller',
    staffId,
    designation: designation || 'Tele-caller / CRM Staff',
    joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
    isActive: true,
    createdBy: req.user._id,
  });

  await auditLogService.log({
    actor: req.user,
    action: 'CALLER_CREATED',
    entity: 'User',
    entityId: newCaller._id,
    metadata: { staffId, name: newCaller.name, phone: newCaller.phone },
    req,
  });

  return res.status(201).json(
    new ApiResponse(201, newCaller, 'Tele-caller created successfully')
  );
};

/**
 * PATCH /api/admin/crm/callers/:id
 * Update caller details
 */
const updateCaller = async (req, res) => {
  const { id } = req.params;
  const { name, phone, email, designation } = req.body;

  const caller = await User.findById(id);
  if (!caller || caller.role !== 'tele_caller') {
    throw new ApiError(404, 'Tele-caller not found');
  }

  if (name) caller.name = name.trim();
  if (email) caller.email = email.trim().toLowerCase();
  if (designation) caller.designation = designation.trim();
  if (phone) {
    const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
    const existing = await User.findOne({ phone: cleanPhone, _id: { $ne: id } });
    if (existing) throw new ApiError(409, 'Phone number already in use by another account');
    caller.phone = cleanPhone;
  }

  await caller.save();

  await auditLogService.log({
    actor: req.user,
    action: 'CALLER_UPDATED',
    entity: 'User',
    entityId: caller._id,
    metadata: { name: caller.name, phone: caller.phone },
    req,
  });

  return res.json(new ApiResponse(200, caller, 'Tele-caller profile updated successfully'));
};

/**
 * PATCH /api/admin/crm/callers/:id/status
 * Activate, Deactivate, or Suspend caller
 */
const updateCallerStatus = async (req, res) => {
  const { id } = req.params;
  const { status, isActive } = req.body;

  const caller = await User.findById(id);
  if (!caller || caller.role !== 'tele_caller') {
    throw new ApiError(404, 'Tele-caller not found');
  }

  const newStatus = status === 'active' || isActive === true;
  caller.isActive = newStatus;
  await caller.save();

  crmSocketService.callerStatusChanged(caller._id, newStatus ? 'active' : 'inactive');

  await auditLogService.log({
    actor: req.user,
    action: 'CALLER_STATUS_CHANGED',
    entity: 'User',
    entityId: caller._id,
    metadata: { status: newStatus ? 'active' : 'inactive' },
    req,
  });

  return res.json(
    new ApiResponse(200, { id: caller._id, isActive: caller.isActive }, `Tele-caller status set to ${newStatus ? 'active' : 'inactive'}`)
  );
};

const activateCaller = async (req, res) => {
  req.body = { isActive: true };
  return updateCallerStatus(req, res);
};

const deactivateCaller = async (req, res) => {
  req.body = { isActive: false };
  return updateCallerStatus(req, res);
};

/**
 * Specific sub-resource getters for a caller
 */
const getCallerPerformance = async (req, res) => {
  const { id } = req.params;
  const stats = await computeCallerStats(id);
  return res.json(new ApiResponse(200, stats, 'Caller performance statistics retrieved'));
};

const getCallerActivity = async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [activities, total] = await Promise.all([
    CRMActivity.find({ performedBy: id }).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    CRMActivity.countDocuments({ performedBy: id }),
  ]);

  return res.json(
    new ApiResponse(200, activities, 'Caller activities retrieved', {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    })
  );
};

const getCallerLeads = async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20, status } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const query = { assignedTo: id, archived: { $ne: true } };
  if (status) query.status = status.toLowerCase();

  const [leads, total] = await Promise.all([
    CRMLead.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    CRMLead.countDocuments(query),
  ]);

  return res.json(
    new ApiResponse(200, leads, 'Caller assigned leads retrieved', {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    })
  );
};

const getCallerCalls = async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [calls, total] = await Promise.all([
    CRMCall.find({ teleCaller: id }).populate('lead', 'leadId name phone').sort({ startedAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    CRMCall.countDocuments({ teleCaller: id }),
  ]);

  return res.json(
    new ApiResponse(200, calls, 'Caller call logs retrieved', {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    })
  );
};

const getCallerFollowUps = async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20, status } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const query = { assignedTo: id };
  if (status) query.status = status;

  const [followups, total] = await Promise.all([
    CRMFollowUp.find(query).populate('lead', 'leadId name phone').sort({ scheduledAt: 1 }).skip(skip).limit(Number(limit)).lean(),
    CRMFollowUp.countDocuments(query),
  ]);

  return res.json(
    new ApiResponse(200, followups, 'Caller follow-ups retrieved', {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    })
  );
};

const getCallerSiteVisits = async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [visits, total] = await Promise.all([
    CRMSiteVisit.find({ createdBy: id })
      .populate('lead', 'leadId name phone')
      .populate('property', 'leadId locality title')
      .populate('assignedFieldAgent', 'name phone')
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CRMSiteVisit.countDocuments({ createdBy: id }),
  ]);

  return res.json(
    new ApiResponse(200, visits, 'Caller site visits retrieved', {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    })
  );
};

const getCallerShortlists = async (req, res) => {
  const { id } = req.params;
  const shortlists = await CRMShortlist.find({ teleCaller: id })
    .populate('lead', 'leadId name phone')
    .populate('property', 'leadId locality expectedPrice propertyType')
    .sort({ createdAt: -1 })
    .lean();

  return res.json(new ApiResponse(200, shortlists, 'Caller shortlists retrieved'));
};

const getCallerHandoffs = async (req, res) => {
  const { id } = req.params;
  const handoffs = await CRMHandoff.find({ teleCaller: id })
    .populate('lead', 'leadId name phone')
    .sort({ createdAt: -1 })
    .lean();

  return res.json(new ApiResponse(200, handoffs, 'Caller handoffs retrieved'));
};

module.exports = {
  getAllCallers,
  getCallerById,
  createCaller,
  updateCaller,
  updateCallerStatus,
  activateCaller,
  deactivateCaller,
  getCallerPerformance,
  getCallerActivity,
  getCallerLeads,
  getCallerCalls,
  getCallerFollowUps,
  getCallerSiteVisits,
  getCallerShortlists,
  getCallerHandoffs,
};
