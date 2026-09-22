const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    recipientRole: {
      type: String,
      enum: [
        'tenant',
        'owner',
        'agent',
        'broker',
        'field_staff',
        'verification_staff',
        'admin',
        'super_admin',
        'tele_caller',
      ],
      default: 'super_admin',
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    senderName: {
      type: String,
      default: 'System',
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: [
        'lead_assigned',
        'lead_verified',
        'lead_rejected',
        'lead_updated',
        'lead_submitted',
        'duplicate_detected',
        'inspection_scheduled',
        'inspection_completed',
        'complaint_logged',
        'complaint_resolved',
        'scam_alert',
        'user_created',
        'kyc_submitted',
        'commission_requested',
        'commission_paid',
        'deal_closed',
        'system',
      ],
      default: 'system',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyLead',
      default: null,
    },
    propertyId: {
      type: String,
      default: null,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for high-speed notification queries
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientRole: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipientRole: 1, createdAt: -1 });

// Virtual to provide consistent `id` field
notificationSchema.virtual('id').get(function () {
  return this._id ? this._id.toHexString() : null;
});

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
