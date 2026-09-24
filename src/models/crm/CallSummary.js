const mongoose = require('mongoose');

const callSummarySchema = new mongoose.Schema(
  {
    call: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CRMCall',
      required: true,
      index: true,
    },
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CRMLead',
      required: true,
      index: true,
    },
    customerRequirement: {
      type: String,
      trim: true,
    },
    bhk: Number,
    locality: [String],
    budget: {
      min: Number,
      max: Number,
    },
    purpose: {
      type: String,
      enum: ['rent', 'sale', 'mortgage', 'investment', 'other'],
      default: 'rent',
    },
    furnishing: String,
    preferredDate: String,
    interestLevel: {
      type: String,
      enum: ['high', 'medium', 'low', 'not_interested'],
      default: 'medium',
    },
    objections: [String],
    nextAction: String,
    summary: {
      type: String,
      required: true,
    },
    transcript: String,
    rawAIResponse: mongoose.Schema.Types.Mixed,
    isAppliedToRequirement: {
      type: Boolean,
      default: false,
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CRMCallSummary', callSummarySchema);
