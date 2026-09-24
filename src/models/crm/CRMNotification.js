const mongoose = require('mongoose');

const NOTIFICATION_TYPES = [
  'new_lead',
  'lead_assigned',
  'followup_due',
  'followup_overdue',
  'site_visit_confirmed',
  'site_visit_cancelled',
  'client_viewed_property',
  'client_interested',
  'new_matching_property',
  'handoff_accepted',
  'handoff_returned',
  'general',
];

const crmNotificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CRMLead',
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyLead',
    },
    referenceId: String,
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: Date,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
  },
  { timestamps: true }
);

crmNotificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('CRMNotification', crmNotificationSchema);
