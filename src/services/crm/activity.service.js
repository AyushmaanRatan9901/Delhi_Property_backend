const CRMActivity = require('../../models/crm/CRMActivity');

/**
 * CRM ACTIVITY AUDIT SERVICE
 * Records every significant CRM action for tracking and compliance.
 */
const logCRMActivity = async ({
  action,
  entityType,
  entityId,
  performedBy,
  performerName,
  performerRole,
  lead = null,
  property = null,
  metadata = {},
  req = null,
}) => {
  try {
    const ip = req?.ip || req?.headers?.['x-forwarded-for'] || '';
    const userAgent = req?.headers?.['user-agent'] || '';

    const activity = await CRMActivity.create({
      action,
      entityType,
      entityId: String(entityId),
      performedBy: performedBy?._id || performedBy,
      performerName: performerName || performedBy?.name || 'CRM Staff',
      performerRole: performerRole || performedBy?.role || 'tele_caller',
      lead,
      property,
      metadata,
      ip,
      userAgent,
    });

    return activity;
  } catch (err) {
    console.error('⚠️ [CRMActivity] Error recording activity:', err.message);
    return null;
  }
};

module.exports = { logCRMActivity };
