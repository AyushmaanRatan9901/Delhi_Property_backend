const mongoose = require('mongoose');

const leaseSchema = new mongoose.Schema(
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
    startDate: { type: Date, required: true },
    endDate:   { type: Date, required: true },
    rentAmount:   { type: Number, required: true },
    depositAmount:{ type: Number, default: 0 },
    status: {
      type: String,
      enum: ['active', 'expired', 'terminated', 'pending'],
      default: 'pending',
    },
    documents: [String],
    terms: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lease', leaseSchema);
