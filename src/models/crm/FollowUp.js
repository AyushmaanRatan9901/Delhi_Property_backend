const mongoose = require('mongoose');

const FOLLOWUP_TYPES = ['call', 'whatsapp', 'site_visit', 'follow_up', 'other'];
const FOLLOWUP_STATUSES = ['pending', 'completed', 'cancelled', 'snoozed', 'overdue'];

const followUpSchema = new mongoose.Schema(
  {
    followupId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CRMLead',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: FOLLOWUP_TYPES,
      default: 'call',
      index: true,
    },
    scheduledAt: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: FOLLOWUP_STATUSES,
      default: 'pending',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    notes: {
      type: String,
      trim: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    completedAt: Date,
    completionNotes: String,
    snoozedUntil: Date,
    snoozeCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

followUpSchema.index({ assignedTo: 1, status: 1, scheduledAt: 1 });
followUpSchema.index({ lead: 1, scheduledAt: -1 });

module.exports = mongoose.model('CRMFollowUp', followUpSchema);
