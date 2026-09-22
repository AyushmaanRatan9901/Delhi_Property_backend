const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    lease: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lease',
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
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
    },
    amount:      { type: Number, required: true },
    dueDate:     { type: Date, required: true },
    paidDate:    { type: Date },
    month:       { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'paid', 'overdue', 'partial'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'upi', 'bank_transfer', 'cheque', 'online'],
      default: 'cash',
    },
    transactionId: String,
    notes: String,
    lateFee: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
