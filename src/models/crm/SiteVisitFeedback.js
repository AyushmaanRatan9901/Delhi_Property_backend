const mongoose = require('mongoose');

const siteVisitFeedbackSchema = new mongoose.Schema(
  {
    siteVisit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CRMSiteVisit',
      required: true,
      unique: true,
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
    },
    outcome: {
      type: String,
      enum: [
        'interested',
        'not_interested',
        'need_more_options',
        'negotiation',
        'follow_up',
      ],
      required: [true, 'Feedback outcome is required'],
    },
    clientImpression: {
      type: String,
      enum: ['excellent', 'good', 'average', 'poor'],
    },
    budgetFit: {
      type: String,
      enum: ['perfect', 'slightly_high', 'too_expensive', 'within_budget'],
    },
    locationFit: {
      type: String,
      enum: ['loved', 'acceptable', 'too_far', 'rejected'],
    },
    feedbackNotes: {
      type: String,
      trim: true,
    },
    objections: [String],
    nextAction: String,
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CRMSiteVisitFeedback', siteVisitFeedbackSchema);
