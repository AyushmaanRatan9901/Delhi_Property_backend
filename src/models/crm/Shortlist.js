const mongoose = require('mongoose');

const shortlistSchema = new mongoose.Schema(
  {
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
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    notes: String,
    position: {
      type: Number,
      default: 0,
    },
    clientInterest: {
      type: String,
      enum: [
        'pending',
        'viewed',
        'liked',
        'disliked',
        'site_visit_requested',
        'negotiating',
        'finalized',
      ],
      default: 'pending',
    },
    matchScore: {
      type: Number,
      default: 0,
    },
    matchedCriteria: [String],
  },
  { timestamps: true }
);

// Prevent duplicate properties in a single lead's shortlist
shortlistSchema.index({ lead: 1, property: 1 }, { unique: true });
shortlistSchema.index({ lead: 1, position: 1 });

module.exports = mongoose.model('CRMShortlist', shortlistSchema);
