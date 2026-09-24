const mongoose = require('mongoose');
const CRMLead = require('../../../models/crm/Lead');
const CRMLeadRequirement = require('../../../models/crm/LeadRequirement');
const CRMLeadNote = require('../../../models/crm/LeadNote');
const CRMCall = require('../../../models/crm/Call');
const CRMFollowUp = require('../../../models/crm/FollowUp');
const CRMSiteVisit = require('../../../models/crm/SiteVisit');
const CRMShortlist = require('../../../models/crm/Shortlist');
const CRMPropertyShare = require('../../../models/crm/PropertyShare');
const CRMHandoff = require('../../../models/crm/CRMHandoff');
const CRMActivity = require('../../../models/crm/CRMActivity');
const User = require('../../../models/User');
const auditLogService = require('../../../services/crm/auditLog.service');
const crmSocketService = require('../../../services/crm/crmSocket.service');
const notificationService = require('../../../services/crm/notification.service');
const { generateCRMId } = require('../../../utils/crmIdGenerator');
const ApiResponse = require('../../../utils/ApiResponse');
const ApiError = require('../../../utils/ApiError');

/**
 * GET /api/admin/crm/leads
 * Get all leads with advanced filtering, searching, and pagination
 */
const getAllLeads = async (req, res) => {
  const {
    caller,
    status,
    priority,
    source,
    requirementType,
    search,
    dateFrom,
    dateTo,
    page = 1,
    limit = 20,
    sort = 'createdAt',
    sortBy = 'desc',
    unassigned,
  } = req.query;

  const query = { archived: { $ne: true } };

  if (unassigned === 'true') {
    query.assignedTo = { $exists: false };
  } else if (caller && mongoose.Types.ObjectId.isValid(caller)) {
    query.assignedTo = new mongoose.Types.ObjectId(caller);
  }

  if (status && status !== 'ALL') query.status = status.toLowerCase();
  if (priority) query.priority = priority.toLowerCase();
  if (source) query.source = source.toLowerCase();
  if (requirementType) query.requirementType = requirementType.toLowerCase();

  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo) query.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }

  if (search?.trim()) {
    const s = search.trim();
    query.$or = [
      { name: { $regex: s, $options: 'i' } },
      { phone: { $regex: s, $options: 'i' } },
      { email: { $regex: s, $options: 'i' } },
      { leadId: { $regex: s, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sortDirection = sortBy === 'asc' ? 1 : -1;

  const [leads, total] = await Promise.all([
    CRMLead.find(query)
      .populate('assignedTo', 'name phone email staffId')
      .populate('assignedBy', 'name role')
      .sort({ [sort]: sortDirection })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CRMLead.countDocuments(query),
  ]);

  return res.json(
    new ApiResponse(200, leads, 'Leads retrieved successfully', {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    })
  );
};

/**
 * GET /api/admin/crm/leads/unassigned
 * Retrieve leads currently awaiting tele-caller assignment
 */
const getUnassignedLeads = async (req, res) => {
  req.query.unassigned = 'true';
  return getAllLeads(req, res);
};

/**
 * GET /api/admin/crm/leads/:leadId
 * Full lead overview with 360-degree timeline
 */
const getLeadById = async (req, res) => {
  const { leadId } = req.params;

  let lead = null;
  if (mongoose.Types.ObjectId.isValid(leadId)) {
    lead = await CRMLead.findById(leadId)
      .populate('assignedTo', 'name phone email staffId')
      .populate('assignedBy', 'name role')
      .lean();
  }
  if (!lead && leadId) {
    lead = await CRMLead.findOne({ leadId })
      .populate('assignedTo', 'name phone email staffId')
      .populate('assignedBy', 'name role')
      .lean();
  }

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  const lId = lead._id;

  // Retrieve full timeline items in parallel
  const [
    requirements,
    notes,
    calls,
    followUps,
    siteVisits,
    shortlists,
    shares,
    handoffs,
    activities,
  ] = await Promise.all([
    CRMLeadRequirement.findOne({ lead: lId }).lean(),
    CRMLeadNote.find({ lead: lId }).populate('author', 'name role').sort({ createdAt: -1 }).lean(),
    CRMCall.find({ lead: lId }).populate('teleCaller', 'name phone staffId').sort({ startedAt: -1 }).lean(),
    CRMFollowUp.find({ lead: lId }).populate('assignedTo', 'name phone').sort({ scheduledAt: -1 }).lean(),
    CRMSiteVisit.find({ lead: lId })
      .populate('property', 'leadId locality address expectedPrice propertyType')
      .populate('assignedFieldAgent', 'name phone')
      .sort({ scheduledAt: -1 })
      .lean(),
    CRMShortlist.find({ lead: lId })
      .populate('property', 'leadId locality address expectedPrice propertyType')
      .populate('teleCaller', 'name')
      .sort({ createdAt: -1 })
      .lean(),
    CRMPropertyShare.find({ lead: lId }).populate('teleCaller', 'name').sort({ createdAt: -1 }).lean(),
    CRMHandoff.find({ lead: lId }).populate('teleCaller', 'name phone').sort({ createdAt: -1 }).lean(),
    CRMActivity.find({ lead: lId }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);

  const leadDetail = {
    ...lead,
    requirementDetails: requirements,
    notes,
    calls,
    followUps,
    siteVisits,
    shortlists,
    whatsappShares: shares,
    handoffs,
    timeline: activities,
  };

  return res.json(new ApiResponse(200, leadDetail, 'Lead profile and complete timeline retrieved successfully'));
};

/**
 * POST /api/admin/crm/leads
 * Create a new lead directly by Super Admin
 */
const createLead = async (req, res) => {
  const {
    name,
    phone,
    email,
    alternatePhone,
    source = 'manual',
    requirementType = 'rent',
    priority = 'medium',
    status = 'new',
    assignedTo,
    budgetMin,
    budgetMax,
    bhk,
    preferredLocalities,
    furnishing,
    remarks,
  } = req.body;

  if (!name || !phone) {
    throw new ApiError(400, 'Lead name and phone number are required');
  }

  const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
  const leadId = generateCRMId('LD');

  const newLead = await CRMLead.create({
    leadId,
    name: name.trim(),
    phone: cleanPhone,
    email: email?.trim()?.toLowerCase(),
    alternatePhone: alternatePhone ? alternatePhone.replace(/[^0-9]/g, '').slice(-10) : undefined,
    source,
    requirementType,
    status,
    priority,
    assignedTo: assignedTo && mongoose.Types.ObjectId.isValid(assignedTo) ? assignedTo : undefined,
    assignedBy: assignedTo ? req.user._id : undefined,
    assignedAt: assignedTo ? new Date() : undefined,
    createdBy: req.user._id,
    assignmentHistory: assignedTo
      ? [{ assignedTo, assignedBy: req.user._id, assignedAt: new Date(), reason: 'Initial assignment' }]
      : [],
    statusHistory: [{ status, changedBy: req.user._id, changedAt: new Date(), notes: 'Created by Admin' }],
  });

  // Save requirement if provided
  if (budgetMin || budgetMax || bhk || preferredLocalities || furnishing) {
    await CRMLeadRequirement.create({
      lead: newLead._id,
      purpose: requirementType,
      bhk: Array.isArray(bhk) ? bhk : bhk ? [Number(bhk)] : [],
      budget: { min: Number(budgetMin || 0), max: Number(budgetMax || 0) },
      preferredLocalities: Array.isArray(preferredLocalities)
        ? preferredLocalities
        : preferredLocalities
        ? [preferredLocalities]
        : [],
      furnishing: furnishing || 'any',
      additionalNotes: remarks,
    });
  }

  if (remarks) {
    await CRMLeadNote.create({
      lead: newLead._id,
      author: req.user._id,
      note: remarks,
      type: 'general',
    });
  }

  crmSocketService.leadNew(newLead);

  await auditLogService.log({
    actor: req.user,
    action: 'LEAD_CREATED',
    entity: 'Lead',
    entityId: newLead._id,
    metadata: { leadId: newLead.leadId, name: newLead.name, phone: newLead.phone },
    req,
  });

  return res.status(201).json(new ApiResponse(201, newLead, 'Lead created successfully'));
};

/**
 * PATCH /api/admin/crm/leads/:leadId
 * Update lead basic info
 */
const updateLead = async (req, res) => {
  const { leadId } = req.params;
  const lead = await CRMLead.findById(leadId);
  if (!lead) throw new ApiError(404, 'Lead not found');

  const { name, phone, email, alternatePhone, source, requirementType, priority } = req.body;

  if (name) lead.name = name.trim();
  if (email) lead.email = email.trim().toLowerCase();
  if (source) lead.source = source;
  if (requirementType) lead.requirementType = requirementType;
  if (priority) lead.priority = priority;
  if (phone) lead.phone = phone.replace(/[^0-9]/g, '').slice(-10);
  if (alternatePhone) lead.alternatePhone = alternatePhone.replace(/[^0-9]/g, '').slice(-10);

  await lead.save();

  crmSocketService.leadUpdated(lead);

  await auditLogService.log({
    actor: req.user,
    action: 'LEAD_UPDATED',
    entity: 'Lead',
    entityId: lead._id,
    metadata: { name: lead.name, priority: lead.priority },
    req,
  });

  return res.json(new ApiResponse(200, lead, 'Lead updated successfully'));
};

/**
 * PATCH /api/admin/crm/leads/:leadId/status
 * Change lead status with history tracking
 */
const updateLeadStatus = async (req, res) => {
  const { leadId } = req.params;
  const { status, notes, lostReason, convertedDealDetails } = req.body;

  const lead = await CRMLead.findById(leadId);
  if (!lead) throw new ApiError(404, 'Lead not found');

  const oldStatus = lead.status;
  lead.status = status.toLowerCase();

  lead.statusHistory.push({
    status: lead.status,
    changedBy: req.user._id,
    changedAt: new Date(),
    notes: notes || `Status changed from ${oldStatus} to ${lead.status}`,
  });

  if (status === 'lost') {
    lead.lostReason = lostReason || 'other';
    lead.lostNotes = notes;
  } else if (status === 'converted') {
    lead.convertedAt = new Date();
    lead.convertedDealDetails = convertedDealDetails || {};
  }

  await lead.save();

  crmSocketService.leadStatusChanged(lead, oldStatus, lead.status);

  await auditLogService.log({
    actor: req.user,
    action: 'LEAD_STATUS_CHANGED',
    entity: 'Lead',
    entityId: lead._id,
    metadata: { from: oldStatus, to: lead.status, notes },
    req,
  });

  return res.json(new ApiResponse(200, lead, `Lead status changed to ${lead.status}`));
};

/**
 * PATCH /api/admin/crm/leads/:leadId/priority
 */
const updateLeadPriority = async (req, res) => {
  const { leadId } = req.params;
  const { priority } = req.body;

  const lead = await CRMLead.findById(leadId);
  if (!lead) throw new ApiError(404, 'Lead not found');

  const oldPriority = lead.priority;
  lead.priority = priority.toLowerCase();
  await lead.save();

  crmSocketService.leadUpdated(lead);

  await auditLogService.log({
    actor: req.user,
    action: 'LEAD_PRIORITY_CHANGED',
    entity: 'Lead',
    entityId: lead._id,
    metadata: { from: oldPriority, to: lead.priority },
    req,
  });

  return res.json(new ApiResponse(200, lead, `Lead priority updated to ${lead.priority}`));
};

/**
 * PATCH /api/admin/crm/leads/:leadId/requirement
 */
const updateLeadRequirement = async (req, res) => {
  const { leadId } = req.params;
  const lead = await CRMLead.findById(leadId);
  if (!lead) throw new ApiError(404, 'Lead not found');

  const { purpose, bhk, budgetMin, budgetMax, preferredLocalities, furnishing, additionalNotes } = req.body;

  let requirement = await CRMLeadRequirement.findOne({ lead: lead._id });
  if (!requirement) {
    requirement = new CRMLeadRequirement({ lead: lead._id });
  }

  if (purpose) requirement.purpose = purpose;
  if (bhk) requirement.bhk = Array.isArray(bhk) ? bhk : [Number(bhk)];
  if (budgetMin !== undefined || budgetMax !== undefined) {
    requirement.budget = {
      min: Number(budgetMin ?? requirement.budget?.min ?? 0),
      max: Number(budgetMax ?? requirement.budget?.max ?? 0),
    };
  }
  if (preferredLocalities) {
    requirement.preferredLocalities = Array.isArray(preferredLocalities) ? preferredLocalities : [preferredLocalities];
  }
  if (furnishing) requirement.furnishing = furnishing;
  if (additionalNotes) requirement.additionalNotes = additionalNotes;

  await requirement.save();

  await auditLogService.log({
    actor: req.user,
    action: 'LEAD_REQUIREMENT_UPDATED',
    entity: 'LeadRequirement',
    entityId: requirement._id,
    metadata: { leadId: lead.leadId },
    req,
  });

  return res.json(new ApiResponse(200, requirement, 'Lead requirement updated successfully'));
};

/**
 * PATCH /api/admin/crm/leads/:leadId/assign
 * Assign lead to a Tele-caller
 */
const assignLead = async (req, res) => {
  const { leadId } = req.params;
  const { teleCallerId, reason } = req.body;

  const [lead, caller] = await Promise.all([
    CRMLead.findById(leadId),
    User.findById(teleCallerId),
  ]);

  if (!lead) throw new ApiError(404, 'Lead not found');
  if (!caller || caller.role !== 'tele_caller') throw new ApiError(404, 'Tele-caller not found');

  lead.assignedTo = caller._id;
  lead.assignedBy = req.user._id;
  lead.assignedAt = new Date();

  lead.assignmentHistory.push({
    assignedTo: caller._id,
    assignedBy: req.user._id,
    assignedAt: new Date(),
    reason: reason || 'Assigned by Super Admin',
  });

  await lead.save();

  await notificationService.notifyLeadAssigned({
    teleCallerId: caller._id,
    leadId: lead._id,
    leadCustomId: lead.leadId,
    leadName: lead.name,
  });

  crmSocketService.leadAssigned(lead, caller._id);

  await auditLogService.log({
    actor: req.user,
    action: 'LEAD_ASSIGNED',
    entity: 'Lead',
    entityId: lead._id,
    metadata: { callerName: caller.name, callerId: caller._id, leadId: lead.leadId },
    req,
  });

  return res.json(new ApiResponse(200, lead, `Lead assigned to ${caller.name}`));
};

/**
 * PATCH /api/admin/crm/leads/:leadId/reassign
 * Reassign lead to another Tele-caller
 */
const reassignLead = async (req, res) => {
  const { leadId } = req.params;
  const { teleCallerId, reason } = req.body;

  const [lead, newCaller] = await Promise.all([
    CRMLead.findById(leadId),
    User.findById(teleCallerId),
  ]);

  if (!lead) throw new ApiError(404, 'Lead not found');
  if (!newCaller || newCaller.role !== 'tele_caller') throw new ApiError(404, 'Tele-caller not found');

  const previousCallerId = lead.assignedTo;
  lead.assignedTo = newCaller._id;
  lead.assignedBy = req.user._id;
  lead.assignedAt = new Date();

  lead.assignmentHistory.push({
    assignedTo: newCaller._id,
    assignedBy: req.user._id,
    assignedAt: new Date(),
    reason: reason || 'Reassigned by Super Admin',
  });

  await lead.save();

  await notificationService.notifyLeadAssigned({
    teleCallerId: newCaller._id,
    leadId: lead._id,
    leadCustomId: lead.leadId,
    leadName: lead.name,
  });

  crmSocketService.leadReassigned(lead, previousCallerId, newCaller._id);

  await auditLogService.log({
    actor: req.user,
    action: 'LEAD_REASSIGNED',
    entity: 'Lead',
    entityId: lead._id,
    metadata: { previousCallerId, newCallerId: newCaller._id, callerName: newCaller.name },
    req,
  });

  return res.json(new ApiResponse(200, lead, `Lead successfully reassigned to ${newCaller.name}`));
};

/**
 * POST /api/admin/crm/leads/:leadId/archive
 */
const archiveLead = async (req, res) => {
  const { leadId } = req.params;
  const lead = await CRMLead.findById(leadId);
  if (!lead) throw new ApiError(404, 'Lead not found');

  lead.archived = true;
  lead.archivedAt = new Date();
  lead.archivedBy = req.user._id;
  await lead.save();

  await auditLogService.log({
    actor: req.user,
    action: 'LEAD_ARCHIVED',
    entity: 'Lead',
    entityId: lead._id,
    metadata: { leadId: lead.leadId },
    req,
  });

  return res.json(new ApiResponse(200, { id: lead._id, archived: true }, 'Lead archived successfully'));
};

module.exports = {
  getAllLeads,
  getUnassignedLeads,
  getLeadById,
  createLead,
  updateLead,
  updateLeadStatus,
  updateLeadPriority,
  updateLeadRequirement,
  assignLead,
  reassignLead,
  archiveLead,
};
