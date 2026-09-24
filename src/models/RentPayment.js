const mongoose = require('mongoose');

const rentPaymentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyLead',
      required: true,
      index: true,
    },
    unitId: {
      type: String,
      trim: true,
      default: 'Unit A',
    },
    unitNumber: {
      type: String,
      trim: true,
      default: 'A-101',
    },
    leaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lease',
      default: null,
    },
    month: {
      type: String, // e.g. "September 2026" or "Sep 2026"
      required: true,
      trim: true,
    },
    year: {
      type: Number,
      required: true,
      default: () => new Date().getFullYear(),
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Amount must be positive'],
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: [0, 'Paid amount must be positive'],
    },
    dueDate: {
      type: Date,
      required: true,
    },
    paidDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['paid', 'pending', 'overdue', 'partially_paid', 'PAID', 'PENDING', 'OVERDUE', 'PARTIAL'],
      default: 'pending',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['upi', 'bank_transfer', 'cash', 'cheque', 'online', 'UPI', 'Bank_Transfer', 'Cash', 'Cheque', 'Online'],
      default: 'upi',
    },
    transactionId: {
      type: String,
      trim: true,
      default: null,
    },
    utrNumber: {
      type: String,
      trim: true,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    disputeNote: {
      type: String,
      trim: true,
      default: null,
    },
    lateFee: {
      type: Number,
      default: 0,
    },
    receiptId: {
      type: String,
      trim: true,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// Compound indexes for fast lookups & unique month constraint per tenant/property
rentPaymentSchema.index({ tenantId: 1, propertyId: 1, month: 1, year: 1 });
rentPaymentSchema.index({ propertyId: 1, status: 1 });
rentPaymentSchema.index({ dueDate: 1, status: 1 });

module.exports = mongoose.models.RentPayment || mongoose.model('RentPayment', rentPaymentSchema);
