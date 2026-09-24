const mongoose = require('mongoose');

const leadRequirementSchema = new mongoose.Schema(
  {
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CRMLead',
      required: true,
      index: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    isCurrent: {
      type: Boolean,
      default: true,
      index: true,
    },
    requirementType: {
      type: String,
      enum: ['rent', 'sale', 'mortgage'],
      default: 'rent',
    },
    propertyType: [
      {
        type: String,
        enum: [
          'apartment',
          'independent_house',
          'villa',
          'builder_floor',
          'plot',
          'commercial',
          'other',
          '1BHK',
          '2BHK',
          '3BHK',
          'PG / Studio',
          'shop',
          'office',
        ],
      },
    ],
    bhk: [{ type: Number }],
    localities: [{ type: String, trim: true }],
    city: {
      type: String,
      default: 'Delhi NCR',
      trim: true,
    },
    budgetMin: {
      type: Number,
      default: 0,
      min: 0,
    },
    budgetMax: {
      type: Number,
      default: 0,
      min: 0,
    },
    preferredAreaMin: {
      type: Number,
      min: 0,
    },
    preferredAreaMax: {
      type: Number,
      min: 0,
    },
    furnishing: {
      type: String,
      enum: ['furnished', 'semi_furnished', 'unfurnished', 'fully_furnished', 'any'],
      default: 'any',
    },
    possessionDate: Date,
    preferredFloor: String,
    preferredAmenities: [String],
    additionalRequirements: String,
    notes: String,
    source: {
      type: String,
      enum: ['manual', 'ai_call_summary', 'web_form', 'imported'],
      default: 'manual',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

leadRequirementSchema.index({ lead: 1, isCurrent: 1 });

module.exports = mongoose.model('CRMLeadRequirement', leadRequirementSchema);
