const mongoose = require('mongoose');

const maintenanceSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
    },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title:       { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ['plumbing', 'electrical', 'carpentry', 'painting', 'cleaning', 'other'],
      default: 'other',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
    },
    images: [String],
    resolvedAt: Date,
    ownerNotes: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('MaintenanceRequest', maintenanceSchema);
