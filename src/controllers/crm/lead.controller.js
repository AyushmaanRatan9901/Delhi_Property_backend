const CRMLead = require('../../models/crm/Lead');
const CRMLeadRequirement = require('../../models/crm/LeadRequirement');
const CRMLeadNote = require('../../models/crm/LeadNote');
const User = require('../../models/User');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { generateCRMId } = require('../../utils/crmIdGenerator');
const { logCRMActivity } = require('../../services/crm/activity.service');
const { sendCRMNotification } = require('../../services/crm/notification.service');

/**
 * POST /api/crm/leads
 * Create a new CRM Lead with duplicate check on phone
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
    assignedTo,
    notes,
    initialRequirement,
  } = req.body;

  if (!name || !phone) {
    throw new ApiError(400, 'Name and 10-digit Phone number are required');
  }

  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  if (cleanPhone.length !== 10) {
    throw new ApiError(400, 'Please provide a valid 10-digit mobile number');
  }

  // Duplicate Check (Section 34)
  const existingLead = await CRMLead.findOne({
    phone: cleanPhone,
    archived: { $ne: true },
  });

  if (existingLead && !req.body.allowDuplicate) {
    return res.status(409).json({
      success: false,
      message: `Duplicate lead exists with Phone ${cleanPhone}`,
      duplicate: true,
      existingLead: {
        _id: existingLead._id,
        leadId: existingLead.leadId,
        name: existingLead.name,
        phone: existingLead.phone,
        status: existingLead.status,
        assignedTo: existingLead.assignedTo,
        createdAt: existingLead.createdAt,
      },
    });
  }

  const leadId = generateCRMId('CRM-LD');

  // Determine assignment
  let assignedUser = null;
  if (assignedTo) {
    assignedUser = await User.findById(assignedTo);
  } else if (req.user.role === 'tele_caller') {
    // Self-assign if created by tele-caller
    assignedUser = req.user;
  }

  const newLead = await CRMLead.create({
    leadId,
    name: name.trim(),
    phone: cleanPhone,
    email: email ? email.toLowerCase().trim() : undefined,
    alternatePhone: alternatePhone ? alternatePhone.trim() : undefined,
    source,
    requirementType,
    priority,
    assignedTo: assignedUser?._id,
    assignedBy: assignedUser ? req.user._id : undefined,
    assignedAt: assignedUser ? new Date() : undefined,
    createdBy: req.user._id,
    status: 'new',
    statusHistory: [
      {
        status: 'new',
        changedBy: req.user._id,
        changedAt: new Date(),
        notes: 'Lead created in CRM',
      },
    ],
  });

  // Optional: Create initial requirement if provided
  if (initialRequirement && typeof initialRequirement === 'object') {
    await CRMLeadRequirement.create({
      lead: newLead._id,
      version: 1,
      isCurrent: true,
      requirementType: initialRequirement.requirementType || requirementType,
      propertyType: initialRequirement.propertyType || [],
      bhk: initialRequirement.bhk || [],
      localities: initialRequirement.localities || [],
      city: initialRequirement.city || 'Delhi NCR',
      budgetMin: initialRequirement.budgetMin || 0,
      budgetMax: initialRequirement.budgetMax || 0,
      furnishing: initialRequirement.furnishing || 'any',
      notes: initialRequirement.notes || '',
      createdBy: req.user._id,
    });
  }

  // Optional: Create initial note
  if (notes) {
    await CRMLeadNote.create({
      lead: newLead._id,
      content: notes,
      category: 'general',
      createdBy: req.user._id,
    });
  }

  // Audit log
  await logCRMActivity({
    action: 'lead_created',
    entityType: 'CRMLead',
    entityId: newLead._id,
    performedBy: req.user,
    lead: newLead._id,
    metadata: { leadId: newLead.leadId, phone: newLead.phone, source },
    req,
  });

  // Notification if assigned to someone else
  if (assignedUser && assignedUser._id.toString() !== req.user._id.toString()) {
    await sendCRMNotification({
      recipientId: assignedUser._id,
      type: 'lead_assigned',
      title: 'New Lead Assigned',
      message: `Lead ${newLead.name} (${newLead.leadId}) has been assigned to you.`,
      lead: newLead._id,
      referenceId: newLead.leadId,
    });
  }

  return res
    .status(201)
    .json(new ApiResponse(201, { lead: newLead }, 'Lead created successfully'));
};

/**
 * GET /api/crm/leads
 * Paginated list of CRM leads with filters and search
 */
const getLeads = async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search,
    status,
    source,
    priority,
    requirementType,
    assignedTo,
    createdFrom,
    createdTo,
    archived = 'false',
  } = req.query;

  const filter = {};

  // Scope: Tele-callers by default see assigned leads or all unassigned if allowed
  if (req.user.role === 'tele_caller') {
    if (assignedTo) {
      filter.assignedTo = assignedTo;
    } else {
      filter.$or = [{ assignedTo: req.user._id }, { assignedTo: null }];
    }
  } else if (assignedTo) {
    filter.assignedTo = assignedTo;
  }

  if (archived === 'true') {
    filter.archived = true;
  } else {
    filter.archived = { $ne: true };
  }

  if (status && status !== 'ALL') {
    filter.status = status.toLowerCase();
  }

  if (source && source !== 'ALL') {
    filter.source = source.toLowerCase();
  }

  if (priority && priority !== 'ALL') {
    filter.priority = priority.toLowerCase();
  }

  if (requirementType && requirementType !== 'ALL') {
    filter.requirementType = requirementType.toLowerCase();
  }

  if (createdFrom || createdTo) {
    filter.createdAt = {};
    if (createdFrom) filter.createdAt.$gte = new Date(createdFrom);
    if (createdTo) filter.createdAt.$lte = new Date(createdTo);
  }

  if (search && search.trim()) {
    const q = search.trim();
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
      { leadId: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [leads, total] = await Promise.all([
    CRMLead.find(filter)
      .populate('assignedTo', 'name phone role staffId profilePhoto')
      .populate('createdBy', 'name role staffId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CRMLead.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        leads,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)) || 1,
        },
      },
      'Leads fetched successfully'
    )
  );
};

/**
 * GET /api/crm/leads/:leadId
 * Fetch full lead details with active requirement, notes, and metrics
 */
const getLeadById = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  })
    .populate('assignedTo', 'name phone role staffId profilePhoto')
    .populate('createdBy', 'name role staffId')
    .populate('assignmentHistory.assignedTo', 'name staffId')
    .populate('assignmentHistory.assignedBy', 'name staffId');

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  // Fetch requirement and notes
  const [currentRequirement, notesCount] = await Promise.all([
    CRMLeadRequirement.findOne({ lead: lead._id, isCurrent: true }).lean(),
    CRMLeadNote.countDocuments({ lead: lead._id }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        lead,
        requirement: currentRequirement || null,
        stats: { notesCount },
      },
      'Lead details fetched successfully'
    )
  );
};

/**
 * PATCH /api/crm/leads/:leadId
 * Update lead profile details
 */
const updateLead = async (req, res) => {
  const { leadId } = req.params;
  const { name, phone, email, alternatePhone, source, requirementType, priority } = req.body;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  if (name) lead.name = name.trim();
  if (phone) {
    const clean = phone.replace(/\D/g, '').slice(-10);
    if (clean.length === 10) lead.phone = clean;
  }
  if (email !== undefined) lead.email = email ? email.toLowerCase().trim() : undefined;
  if (alternatePhone !== undefined) lead.alternatePhone = alternatePhone;
  if (source) lead.source = source;
  if (requirementType) lead.requirementType = requirementType;
  if (priority) lead.priority = priority;

  await lead.save();

  await logCRMActivity({
    action: 'lead_updated',
    entityType: 'CRMLead',
    entityId: lead._id,
    performedBy: req.user,
    lead: lead._id,
    metadata: req.body,
    req,
  });

  return res.status(200).json(new ApiResponse(200, { lead }, 'Lead updated successfully'));
};

/**
 * PATCH /api/crm/leads/:leadId/status
 * Change lead status with validation and history logging
 */
const updateLeadStatus = async (req, res) => {
  const { leadId } = req.params;
  const { status, notes } = req.body;

  const validStatuses = [
    'new',
    'contacted',
    'qualified',
    'matching',
    'shortlisted',
    'site_visit',
    'negotiation',
    'converted',
    'lost',
  ];

  if (!status || !validStatuses.includes(status.toLowerCase())) {
    throw new ApiError(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  const oldStatus = lead.status;
  lead.status = status.toLowerCase();

  lead.statusHistory.push({
    status: lead.status,
    changedBy: req.user._id,
    changedAt: new Date(),
    notes: notes || `Status changed from ${oldStatus} to ${lead.status}`,
  });

  await lead.save();

  await logCRMActivity({
    action: 'status_changed',
    entityType: 'CRMLead',
    entityId: lead._id,
    performedBy: req.user,
    lead: lead._id,
    metadata: { oldStatus, newStatus: lead.status, notes },
    req,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { lead }, `Status updated to '${lead.status}' successfully`));
};

/**
 * GET /api/crm/leads/:leadId/status-history
 */
const getLeadStatusHistory = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  }).populate('statusHistory.changedBy', 'name role staffId');

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, { history: lead.statusHistory || [] }, 'Status history fetched')
    );
};

/**
 * PATCH /api/crm/leads/:leadId/assign
 * Assign or reassign lead to a tele_caller
 */
const assignLead = async (req, res) => {
  const { leadId } = req.params;
  const { assignedTo, reason } = req.body;

  if (!assignedTo) {
    throw new ApiError(400, 'assignedTo user ID is required');
  }

  const targetUser = await User.findById(assignedTo);
  if (!targetUser) {
    throw new ApiError(404, 'Target staff user not found');
  }

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  lead.assignedTo = targetUser._id;
  lead.assignedBy = req.user._id;
  lead.assignedAt = new Date();

  lead.assignmentHistory.push({
    assignedTo: targetUser._id,
    assignedBy: req.user._id,
    assignedAt: new Date(),
    reason: reason || 'Assigned by administrator',
  });

  await lead.save();

  await logCRMActivity({
    action: 'lead_assigned',
    entityType: 'CRMLead',
    entityId: lead._id,
    performedBy: req.user,
    lead: lead._id,
    metadata: { assignedTo: targetUser._id, assignedToName: targetUser.name, reason },
    req,
  });

  await sendCRMNotification({
    recipientId: targetUser._id,
    type: 'lead_assigned',
    title: 'Lead Assigned',
    message: `Lead ${lead.name} (${lead.leadId}) has been assigned to you.`,
    lead: lead._id,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, { lead }, `Lead assigned to ${targetUser.name} successfully`)
    );
};

/**
 * GET /api/crm/leads/assigned
 */
const getAssignedLeads = async (req, res) => {
  const leads = await CRMLead.find({
    assignedTo: req.user._id,
    archived: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'Assigned leads fetched successfully'));
};

/**
 * GET /api/crm/leads/unassigned
 */
const getUnassignedLeads = async (req, res) => {
  const leads = await CRMLead.find({
    $or: [{ assignedTo: null }, { assignedTo: { $exists: false } }],
    archived: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'Unassigned leads fetched successfully'));
};

/**
 * PATCH /api/crm/leads/:leadId/archive
 */
const archiveLead = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });

  if (!lead) throw new ApiError(404, 'Lead not found');

  lead.archived = true;
  lead.archivedAt = new Date();
  lead.archivedBy = req.user._id;
  await lead.save();

  return res
    .status(200)
    .json(new ApiResponse(200, { lead }, 'Lead archived successfully'));
};

/**
 * PATCH /api/crm/leads/:leadId/restore
 */
const restoreLead = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });

  if (!lead) throw new ApiError(404, 'Lead not found');

  lead.archived = false;
  lead.archivedAt = null;
  lead.archivedBy = null;
  await lead.save();

  return res
    .status(200)
    .json(new ApiResponse(200, { lead }, 'Lead restored successfully'));
};

/**
 * DELETE /api/crm/leads/:leadId
 */
const deleteLead = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });

  if (!lead) throw new ApiError(404, 'Lead not found');

  await CRMLead.findByIdAndDelete(lead._id);

  return res
    .status(200)
    .json(new ApiResponse(200, null, 'Lead deleted successfully'));
};

module.exports = {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  updateLeadStatus,
  getLeadStatusHistory,
  assignLead,
  getAssignedLeads,
  getUnassignedLeads,
  archiveLead,
  restoreLead,
  deleteLead,
};
