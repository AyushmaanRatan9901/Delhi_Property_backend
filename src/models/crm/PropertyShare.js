const mongoose = require('mongoose');

const propertyShareSchema = new mongoose.Schema(
  {
    shareId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    secureToken: {
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
    properties: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PropertyLead',
      },
    ],
    channel: {
      type: String,
      enum: ['whatsapp', 'web', 'sms', 'email'],
      default: 'whatsapp',
    },
    sharedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    notes: String,
    viewCount: {
      type: Number,
      default: 0,
    },
    firstOpenedAt: Date,
    lastOpenedAt: Date,
    propertyTracking: [
      {
        property: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'PropertyLead',
        },
        videoViews: {
          type: Number,
          default: 0,
        },
        lastVideoViewedAt: Date,
        clientFeedback: {
          type: String,
          enum: ['none', 'interested', 'rejected', 'requested_visit'],
          default: 'none',
        },
        feedbackAt: Date,
        feedbackNotes: String,
      },
    ],
    expiresAt: {
      type: Date,
      index: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CRMPropertyShare', propertyShareSchema);
