const mongoose = require('mongoose');

const leadNoteSchema = new mongoose.Schema(
  {
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CRMLead',
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: [true, 'Note content is required'],
      trim: true,
    },
    category: {
      type: String,
      enum: ['general', 'call', 'meeting', 'preference', 'objection', 'budget', 'urgency'],
      default: 'general',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

leadNoteSchema.index({ lead: 1, createdAt: -1 });

module.exports = mongoose.model('CRMLeadNote', leadNoteSchema);
