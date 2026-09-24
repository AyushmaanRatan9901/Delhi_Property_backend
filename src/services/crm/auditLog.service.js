/**
 * CRMAuditLog Service
 * Records all critical administrative and tele-caller events with role isolation & metadata sanitization.
 */

const CRMAuditLog = require('../../models/crm/AuditLog');
const CRMActivity = require('../../models/crm/CRMActivity');

const SENSITIVE_FIELDS = ['password', 'token', 'jwt', 'otp', 'aadhaarCard', 'panCard', 'secret'];

const sanitizeMetadata = (data) => {
  if (!data || typeof data !== 'object') return data;
  const copy = Array.isArray(data) ? [...data] : { ...data };

  for (const key of Object.keys(copy)) {
    if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field))) {
      copy[key] = '[REDACTED]';
    } else if (typeof copy[key] === 'object' && copy[key] !== null) {
      copy[key] = sanitizeMetadata(copy[key]);
    }
  }
  return copy;
};

class AuditLogService {
  /**
   * Records an audit log entry
   */
  async log({
    actor,
    actorName,
    actorRole,
    action,
    entity,
    entityId,
    metadata = {},
    req = null,
  }) {
    try {
      const ip = req?.ip || req?.headers?.['x-forwarded-for'] || '127.0.0.1';
      const userAgent = req?.headers?.['user-agent'] || 'API Client';

      const sanitizedMeta = sanitizeMetadata(metadata);

      const auditRecord = await CRMAuditLog.create({
        actor: actor?._id || actor,
        actorName: actorName || actor?.name || 'Authorized Staff',
        actorRole: actorRole || actor?.role || 'admin',
        action,
        entity,
        entityId: String(entityId || ''),
        metadata: sanitizedMeta,
        ip,
        userAgent,
      });

      // Also maintain unified CRMActivity for backward compatibility
      await CRMActivity.create({
        action,
        entityType: entity,
        entityId: String(entityId || ''),
        performedBy: actor?._id || actor,
        performerName: actorName || actor?.name || 'Staff',
        performerRole: actorRole || actor?.role || 'admin',
        metadata: sanitizedMeta,
        ip,
        userAgent,
      }).catch(() => {});

      return auditRecord;
    } catch (err) {
      console.error('[AuditLogService] Error saving audit log:', err.message);
      return null;
    }
  }
}

module.exports = new AuditLogService();
