const mongoose = require('mongoose');

const crmActivitySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      index: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    performerName: String,
    performerRole: String,
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CRMLead',
      index: true,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyLead',
      index: true,
    },
    metadata: mongoose.Schema.Types.Mixed,
    ip: String,
    userAgent: String,
  },
  { timestamps: true }
);

crmActivitySchema.index({ lead: 1, createdAt: -1 });
crmActivitySchema.index({ performedBy: 1, createdAt: -1 });
crmActivitySchema.index({ createdAt: -1 });

module.exports = mongoose.model('CRMActivity', crmActivitySchema);
