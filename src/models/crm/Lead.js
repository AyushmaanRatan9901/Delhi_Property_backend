const mongoose = require('mongoose');

const LEAD_SOURCES = [
  'website',
  'facebook',
  'instagram',
  'justdial',
  'walk_in',
  'manual',
  'campaign',
  'advertisement',
  'referral',
  'other',
];

const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'matching',
  'shortlisted',
  'site_visit',
  'negotiation',
  'converted',
  'lost',
];

const LEAD_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const leadSchema = new mongoose.Schema(
  {
    leadId: {
      type: String,
      unique: true,
      required: true,
      index: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Lead name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Lead phone number is required'],
      trim: true,
      index: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    alternatePhone: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      enum: LEAD_SOURCES,
      default: 'manual',
      index: true,
    },
    requirementType: {
      type: String,
      enum: ['rent', 'sale', 'mortgage'],
      default: 'rent',
    },
    status: {
      type: String,
      enum: LEAD_STATUSES,
      default: 'new',
      index: true,
    },
    priority: {
      type: String,
      enum: LEAD_PRIORITIES,
      default: 'medium',
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedAt: Date,
    assignmentHistory: [
      {
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        assignedAt: { type: Date, default: Date.now },
        reason: String,
      },
    ],
    statusHistory: [
      {
        status: { type: String, enum: LEAD_STATUSES },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        changedAt: { type: Date, default: Date.now },
        notes: String,
      },
    ],
    lastContactedAt: Date,
    nextFollowUpAt: {
      type: Date,
      index: true,
    },
    archived: {
      type: Boolean,
      default: false,
      index: true,
    },
    archivedAt: Date,
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    lostReason: {
      type: String,
      enum: [
        'budget_too_low',
        'location_not_available',
        'not_interested',
        'found_elsewhere',
        'duplicate',
        'wrong_number',
        'no_response',
        'requirement_changed',
        'other',
      ],
    },
    lostNotes: String,
    convertedAt: Date,
    convertedDealDetails: mongoose.Schema.Types.Mixed,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound indexes for fast searching and filtering
leadSchema.index({ name: 'text', phone: 'text', leadId: 'text' });
leadSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });
leadSchema.index({ assignedTo: 1, nextFollowUpAt: 1 });
leadSchema.index({ source: 1, createdAt: -1 });
leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ archived: 1, createdAt: -1 });

module.exports = mongoose.model('CRMLead', leadSchema);
