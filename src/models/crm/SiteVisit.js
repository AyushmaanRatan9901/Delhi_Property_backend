const mongoose = require('mongoose');

const SITE_VISIT_STATUSES = [
  'requested',
  'confirmed',
  'agent_assigned',
  'client_reached',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
];

const siteVisitSchema = new mongoose.Schema(
  {
    visitId: {
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
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyLead',
      required: true,
      index: true,
    },
    scheduledAt: {
      type: Date,
      required: true,
      index: true,
    },
    numberOfVisitors: {
      type: Number,
      default: 1,
      min: 1,
    },
    assignedFieldAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    meetingLocation: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: SITE_VISIT_STATUSES,
      default: 'requested',
      index: true,
    },
    statusHistory: [
      {
        status: { type: String, enum: SITE_VISIT_STATUSES },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        changedAt: { type: Date, default: Date.now },
        notes: String,
      },
    ],
    feedback: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CRMSiteVisitFeedback',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

siteVisitSchema.index({ lead: 1, scheduledAt: -1 });
siteVisitSchema.index({ assignedFieldAgent: 1, scheduledAt: -1 });

module.exports = mongoose.model('CRMSiteVisit', siteVisitSchema);
