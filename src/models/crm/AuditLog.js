const mongoose = require('mongoose');

const crmAuditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actorName: {
      type: String,
      trim: true,
    },
    actorRole: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    entity: {
      type: String,
      required: true,
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ip: String,
    userAgent: String,
  },
  { timestamps: true }
);

// Compound indexes for optimal audit log filtering
crmAuditLogSchema.index({ actor: 1, createdAt: -1 });
crmAuditLogSchema.index({ actorRole: 1, createdAt: -1 });
crmAuditLogSchema.index({ entity: 1, entityId: 1 });
crmAuditLogSchema.index({ action: 1, createdAt: -1 });
crmAuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CRMAuditLog', crmAuditLogSchema);
