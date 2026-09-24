const mongoose = require('mongoose');

const showcaseSchema = new mongoose.Schema(
  {
    showcaseId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      default: 'Office TV Showcase',
      trim: true,
    },
    location: {
      type: String,
      default: 'Main Office Display',
      trim: true,
    },
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CRMLead',
    },
    properties: [
      {
        property: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'PropertyLead',
          required: true,
        },
        order: {
          type: Number,
          default: 0,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    status: {
      type: String,
      enum: ['idle', 'active', 'paused', 'closed'],
      default: 'idle',
      index: true,
    },
    currentPropertyIndex: {
      type: Number,
      default: 0,
    },
    activeBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    lastHeartbeatAt: Date,
    qrCodeToken: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('CRMShowcase', showcaseSchema);
