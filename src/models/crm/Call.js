const mongoose = require('mongoose');

const CALL_OUTCOMES = [
  'connected',
  'not_reachable',
  'busy',
  'call_later',
  'interested',
  'not_interested',
  'requirement_changed',
  'wrong_number',
  'site_visit_requested',
  'in_progress',
];

const callSchema = new mongoose.Schema(
  {
    callId: {
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
    teleCaller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    endedAt: Date,
    duration: {
      type: Number,
      default: 0, // seconds
    },
    outcome: {
      type: String,
      enum: CALL_OUTCOMES,
      default: 'in_progress',
      index: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    recording: {
      url: String,
      duration: Number,
      storageProvider: { type: String, default: 'cloud' },
      fileSize: Number,
      mimeType: String,
      uploadedAt: Date,
    },
    summary: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CRMCallSummary',
    },
    followUpScheduled: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CRMFollowUp',
    },
  },
  { timestamps: true }
);

callSchema.index({ lead: 1, createdAt: -1 });
callSchema.index({ teleCaller: 1, startedAt: -1 });

module.exports = mongoose.model('CRMCall', callSchema);
