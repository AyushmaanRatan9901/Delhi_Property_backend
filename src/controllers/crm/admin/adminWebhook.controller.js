const crypto = require('crypto');
const CRMLead = require('../../../models/crm/Lead');
const CRMLeadRequirement = require('../../../models/crm/LeadRequirement');
const CRMLeadNote = require('../../../models/crm/LeadNote');
const User = require('../../../models/User');
const crmSocketService = require('../../../services/crm/crmSocket.service');
const auditLogService = require('../../../services/crm/auditLog.service');
const { generateCRMId } = require('../../../utils/crmIdGenerator');
const ApiResponse = require('../../../utils/ApiResponse');
const ApiError = require('../../../utils/ApiError');

/**
 * POST /api/crm/webhooks/leads/:source
 * Ingest incoming leads securely from external sources (Website, FB Lead Ads, JustDial, etc.)
 */
const handleExternalLeadWebhook = async (req, res) => {
  const { source } = req.params;
  const signature = req.headers['x-crm-signature'] || req.headers['x-hub-signature-256'];
  const webhookSecret = process.env.CRM_WEBHOOK_SECRET || 'crm_default_secret_key';

  // If secret validation is required for external endpoints
  if (process.env.NODE_ENV === 'production' && process.env.CRM_REQUIRE_WEBHOOK_SIG === 'true') {
    if (!signature) {
      throw new ApiError(401, 'Missing x-crm-signature header');
    }
    const hmac = crypto.createHmac('sha256', webhookSecret);
    const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');
    if (signature !== digest && signature !== digest.replace('sha256=', '')) {
      throw new ApiError(401, 'Invalid webhook signature');
    }
  }

  const {
    name,
    phone,
    email,
    alternatePhone,
    requirementType = 'rent',
    priority = 'medium',
    budgetMin,
    budgetMax,
    bhk,
    preferredLocalities,
    furnishing,
    remarks,
    externalLeadId,
  } = req.body;

  if (!name || !phone) {
    throw new ApiError(400, 'Name and phone are required for lead ingestion');
  }

  const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);

  // Duplicate Check: Look up recent active lead with same phone
  const existingLead = await CRMLead.findOne({
    phone: cleanPhone,
    archived: { $ne: true },
    status: { $nin: ['converted', 'lost'] },
  });

  if (existingLead) {
    // Append note instead of creating duplicate
    await CRMLeadNote.create({
      lead: existingLead._id,
      note: `Received duplicate enquiry from source "${source}": ${remarks || 'No notes'}`,
      type: 'general',
    });

    return res.status(200).json(
      new ApiResponse(200, { leadId: existingLead.leadId, duplicate: true }, 'Duplicate enquiry recorded against existing lead')
    );
  }

  // Find a system or admin user to assign createdBy
  const adminUser = await User.findOne({ role: 'super_admin' }) || await User.findOne({ role: 'admin' });
  const leadId = generateCRMId('LD');

  const newLead = await CRMLead.create({
    leadId,
    name: name.trim(),
    phone: cleanPhone,
    email: email?.trim()?.toLowerCase(),
    alternatePhone: alternatePhone ? alternatePhone.replace(/[^0-9]/g, '').slice(-10) : undefined,
    source: source.toLowerCase(),
    requirementType: requirementType.toLowerCase(),
    status: 'new',
    priority: priority.toLowerCase(),
    createdBy: adminUser?._id || new mongoose.Types.ObjectId(),
    statusHistory: [
      {
        status: 'new',
        changedAt: new Date(),
        notes: `Auto-ingested via webhook from source "${source}"${externalLeadId ? ` (Ref: ${externalLeadId})` : ''}`,
      },
    ],
  });

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
      note: `Initial enquiry notes: ${remarks}`,
      type: 'general',
    });
  }

  crmSocketService.leadNew(newLead);

  return res.status(201).json(
    new ApiResponse(201, { leadId: newLead.leadId, status: 'new' }, 'Lead successfully ingested from external source')
  );
};

module.exports = {
  handleExternalLeadWebhook,
};
