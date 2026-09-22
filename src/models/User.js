const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const ROLES = ['super_admin', 'admin', 'field_agent', 'dealer', 'broker', 'field_staff', 'tele_caller', 'owner', 'tenant'];

const userSchema = new mongoose.Schema(
  {
    // ── Core identity ────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      match: [/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'],
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    role: {
      type: String,
      enum: ROLES,
      required: [true, 'Role is required'],
    },
    staffId: {
      type: String,
      unique: true,
      sparse: true,
    },

    // ── Personal ─────────────────────────────────────────────
    profilePhoto: String,
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
    },
    alternatePhone: {
      type: String,
      match: [/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'],
    },

    // ── Address ──────────────────────────────────────────────
    address: {
      street: String,
      city: String,
      state: String,
      pincode: {
        type: String,
        match: [/^\d{6}$/, 'Enter a valid 6-digit pincode'],
      },
    },

    // ── Professional ─────────────────────────────────────────
    designation: String,
    joiningDate: Date,

    // ── Field Agent specific ─────────────────────────────────
    locality: [{ type: String, trim: true }],
    commissionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    commissionWallet: {
      balance: { type: Number, default: 0 },
      pendingBalance: { type: Number, default: 0 },
    },
    bankDetails: {
      bankName: { type: String, trim: true },
      accountHolder: { type: String, trim: true },
      accountHolderName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      ifsc: { type: String, trim: true, uppercase: true },
      ifscCode: { type: String, trim: true, uppercase: true },
      upiId: { type: String, trim: true },
    },
    upiId: {
      type: String,
      trim: true,
    },

    // ── KYC & Verification Documents ─────────────────────────
    kyc: {
      aadhaarDoc: { type: String, trim: true },
      panDoc: { type: String, trim: true },
      aadhaarNumber: { type: String, trim: true },
      panNumber: { type: String, trim: true, uppercase: true },
      status: {
        type: String,
        enum: ['NOT_UPLOADED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED'],
        default: 'NOT_UPLOADED',
      },
      rejectionReason: { type: String, trim: true },
      verifiedAt: Date,
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      submittedAt: Date,
    },
    aadhaarCard: { type: String, trim: true },
    panCard: { type: String, trim: true },
    aadhaarNumber: { type: String, trim: true },
    panNumber: { type: String, trim: true, uppercase: true },

    // ── Admin internal (hidden from users) ───────────────────
    notes: {
      type: String,
      select: false,
    },

    // ── OTP login ────────────────────────────────────────────
    otp: {
      code: { type: String, select: false },
      expiresAt: { type: Date, select: false },
    },

    // ── System ───────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    lastLogin: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

userSchema.methods.generateToken = function () {
  return jwt.sign(
    { id: this._id, role: this.role, staffId: this.staffId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
