const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Property title is required'],
      trim: true,
    },
    description: String,
    type: {
      type: String,
      enum: ['apartment', 'house', 'villa', 'room', 'shop', 'office'],
      required: true,
    },
    address: {
      street: { type: String, required: true },
      city:   { type: String, required: true },
      state:  { type: String, required: true },
      pincode:{ type: String, required: true },
    },
    rent: {
      amount:    { type: Number, required: true },
      currency:  { type: String, default: 'INR' },
      frequency: { type: String, enum: ['monthly', 'quarterly', 'yearly'], default: 'monthly' },
    },
    deposit: { type: Number, default: 0 },
    bedrooms:  { type: Number, default: 0 },
    bathrooms: { type: Number, default: 0 },
    area: { type: Number },
    amenities: [String],
    images: [String],
    isAvailable: { type: Boolean, default: true },
    currentTenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Property', propertySchema);
