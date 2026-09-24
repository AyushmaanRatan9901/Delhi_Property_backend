const mongoose = require('mongoose');

const handoffSchema = new mongoose.Schema(
  {
    handoffId: {
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
    requirementSummary: mongoose.Schema.Types.Mixed,
    shortlistedProperties: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PropertyLead',
      },
    ],
    siteVisitHistory: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CRMSiteVisit',
      },
    ],
    clientInterest: {
      type: String,
      trim: true,
    },
    teleCallerNotes: {
      type: String,
      trim: true,
    },
    lastCallSummary: String,
    recommendedDeal: {
      property: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PropertyLead',
      },
      offeredPrice: Number,
      expectedClosingDate: Date,
      remarks: String,
    },
    nextAction: String,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'returned', 'cancelled'],
      default: 'pending',
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: Date,
    adminRemarks: String,
  },
  { timestamps: true }
);

handoffSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('CRMHandoff', handoffSchema);
