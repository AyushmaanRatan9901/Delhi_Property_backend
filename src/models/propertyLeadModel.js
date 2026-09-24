const mongoose = require('mongoose');

const LEAD_STATUS = [
  'new',
  'assigned',
  'under_verification',
  'verified',
  'rented',
  'sold',
  'rejected',
  'cancelled',
];

const PROPERTY_TYPES = [
  '1BHK',
  '2BHK',
  '3BHK',
  'PG / Studio',
  'Independent House',
  'Commercial Shop',
  'apartment',
  'house',
  'villa',
  'room',
  'pg',
  'commercial',
  'plot',
  'shop',
  'office',
  'other',
];

const LISTING_TYPES = ['rent', 'sale', 'RENT', 'SALE'];
const COMMISSION_STATUS = ['pending', 'approved', 'paid', 'rejected', 'cancelled'];
const FURNISHING_TYPES = ['unfurnished', 'semi_furnished', 'fully_furnished'];

// Sub-schema for photos
const propertyPhotoSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: [true, 'Photo URL is required'],
      trim: true,
    },
    caption: {
      type: String,
      trim: true,
    },
    isCover: {
      type: Boolean,
      default: false,
    },
    uploadedBy: {
      type: String, // 'agent' | 'staff'
      default: 'agent',
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const propertyLeadSchema = new mongoose.Schema(
  {
    // ── Unique Tracking ID ──────────────────────────────────────
    leadId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    // ── Submitting Field Agent (Creator) ───────────────────────
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Submitting agent is required'],
      index: true,
    },
    agentName: {
      type: String,
      trim: true,
    },
    agentPhone: {
      type: String,
      trim: true,
    },
    agentStaffId: {
      type: String,
      trim: true,
    },

    // ── Admin Assignment to Field Staff ─────────────────────────
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    assignedStaffName: {
      type: String,
      trim: true,
    },
    assignedStaffPhone: {
      type: String,
      trim: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedAt: Date,
    assignmentNotes: String,

    // ── Property Specifications ─────────────────────────────────
    title: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    propertyType: {
      type: String,
      required: [true, 'Property type is required'],
    },
    listingType: {
      type: String,
      required: [true, 'Listing type (RENT or SALE) is required'],
      default: 'rent',
    },
    expectedPrice: {
      type: Number,
      required: [true, 'Expected rent or sale price is required'],
      min: [0, 'Price must be a positive number'],
    },
    securityDeposit: {
      type: Number,
      default: 0,
    },
    maintenanceCharge: {
      type: Number,
      default: 0,
    },
    furnishing: {
      type: String,
      enum: FURNISHING_TYPES,
      default: 'unfurnished',
    },
    availableFrom: {
      type: Date,
      default: Date.now,
    },

    // ── Owner Contact Details (PII Safeguarded) ────────────────
    ownerName: {
      type: String,
      required: [true, 'Owner name is required'],
      trim: true,
    },
    ownerPhone: {
      type: String,
      required: [true, 'Owner phone number is required'],
      trim: true,
    },
    ownerEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    alternatePhone: {
      type: String,
      trim: true,
    },
    ownerAadhaarLast4: {
      type: String,
      trim: true,
    },
    ownerPanCard: {
      type: String,
      trim: true,
      uppercase: true,
    },
    ownerAddress: {
      houseNo: String,
      street: String,
      landmark: String,
      city: String,
      state: String,
      pincode: String,
      fullAddress: String,
    },
    ownerBankDetails: {
      accountHolderName: String,
      bankName: String,
      accountNumber: String,
      ifscCode: String,
      accountType: { type: String, default: 'Savings' },
      upiId: String,
    },
    ownerKYC: {
      status: {
        type: String,
        enum: ['pending', 'verified', 'rejected', 'not_submitted'],
        default: 'not_submitted',
      },
      aadhaarFrontUrl: String,
      aadhaarBackUrl: String,
      panCardUrl: String,
      ownershipProofUrl: String,
      electricityBillUrl: String,
      verifiedAt: Date,
      verificationNotes: String,
    },
    ownerNotes: {
      type: String,
      trim: true,
    },

    // ── Location & GPS Pin ──────────────────────────────────────
    locality: {
      type: String,
      required: [true, 'Locality is required'],
      trim: true,
      index: true,
    },
    address: {
      street: String,
      landmark: String,
      city: { type: String, default: 'Delhi NCR' },
      state: { type: String, default: 'Delhi' },
      pincode: String,
      fullAddress: String,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        index: '2dsphere',
      },
    },
    gpsDetails: {
      latitude: Number,
      longitude: Number,
      accuracy: Number,
      capturedAt: { type: Date, default: Date.now },
      reverseGeocodedAddress: String,
    },

    // ── Photos & Video Links ────────────────────────────────────
    coverPhoto: {
      type: String,
      trim: true,
    },
    photos: [propertyPhotoSchema],
    images: [String],
    videoLink: {
      type: String,
      trim: true,
    },
    videoUrl: {
      type: String,
      trim: true,
    },
    virtualTourLink: {
      type: String,
      trim: true,
    },

    // ── Verification & Field Staff Inspection Details ───────────
    status: {
      type: String,
      enum: LEAD_STATUS,
      default: 'new',
      index: true,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    verifiedStaffName: String,
    verifiedAt: Date,
    verificationNotes: String,
    rejectionReason: String,

    // Comprehensive Physical Inspection Checklist (Filled by Field Staff)
    inspectionDetails: {
      physicalVisitDone: { type: Boolean, default: false },
      ownershipDocsVerified: { type: Boolean, default: false },
      electricityBillChecked: { type: Boolean, default: false },
      keysAvailable: { type: Boolean, default: false },
      actualCarpetAreaSqFt: Number,
      actualBedrooms: Number,
      actualBathrooms: Number,
      actualBalconies: Number,
      floorNumber: Number,
      totalFloors: Number,
      propertyCondition: {
        type: String,
        enum: ['excellent', 'good', 'needs_repair', 'poor'],
      },
      negotiablePriceMin: Number,
      verifiedAt: Date,
      staffChecklistRemarks: String,
    },

    // ── Commission Tracking (FIRST MONTH ON TENANT MOVE-IN + MONTHLY RECURRING) ───────
    commission: {
      estimatedAmount: {
        type: Number,
        default: 0,
      },
      approvedAmount: {
        type: Number,
        default: 0,
      },
      percentage: {
        type: Number,
        default: 0,
      },
      firstMonthCommission: {
        type: Number,
        default: 0,
      },
      recurringMonthlyCommission: {
        type: Number,
        default: 0,
      },
      recurringMonthlyRate: {
        type: Number,
        default: 5, // Default 5% of monthly rent
      },
      recurringCommissions: [
        {
          month: String, // e.g. "Oct 2026"
          rentAmount: Number,
          commissionAmount: Number,
          type: {
            type: String,
            enum: ['first_month', 'monthly_recurring'],
            default: 'monthly_recurring',
          },
          status: {
            type: String,
            enum: ['pending', 'approved', 'paid'],
            default: 'approved',
          },
          paidAt: Date,
          utrNumber: String,
          rentLedgerIndex: Number,
          createdAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      status: {
        type: String,
        enum: COMMISSION_STATUS,
        default: 'pending',
      },
      decidedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      decidedByName: String,
      decidedAt: Date,
      paidAt: Date,
      payoutTransactionId: String,
      remarks: String,
    },

    // ── Duplicate Detection Review (SUPER ADMIN) ───────────────
    duplicateFlag: {
      isDuplicate: {
        type: Boolean,
        default: false,
        index: true,
      },
      duplicateOf: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PropertyLead',
      },
      matchType: {
        type: String, // 'phone' | 'address' | 'owner_name' | 'gps'
      },
      duplicateReason: String,
      status: {
        type: String,
        enum: ['none', 'flagged', 'resolved', 'dismissed'],
        default: 'none',
      },
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      resolvedAt: Date,
      resolutionNotes: String,
    },

    // ── Booking & Deal Management (SUPER ADMIN) ─────────────────
    deal: {
      isClosed: {
        type: Boolean,
        default: false,
      },
      dealType: {
        type: String,
        enum: ['rent', 'sale', 'lease', 'RENT', 'SALE'],
        default: 'rent',
      },
      finalPrice: Number,
      deposit: Number,
      tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      tenantName: String,
      tenantPhone: String,
      tenantEmail: {
        type: String,
        trim: true,
        lowercase: true,
      },
      tenantAadhaarLast4: String,
      leaseStartDate: Date,
      leaseDurationMonths: {
        type: Number,
        default: 11,
      },
      agreementNumber: String,
      agreementGenerated: {
        type: Boolean,
        default: false,
      },
      agreementUrl: String,
      policeVerificationStatus: {
        type: String,
        enum: ['pending', 'submitted', 'verified', 'not_required'],
        default: 'pending',
      },
      policeVerificationDate: Date,
      policeVerificationUrl: String,
      closedAt: Date,
      closedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      notes: String,
    },

    // ── Tenancy & Lease History (Permanent Immutable Archive) ────
    tenancyHistory: [
      {
        tenantId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        tenantName: String,
        tenantPhone: String,
        tenantEmail: String,
        tenantAadhaarLast4: String,
        dealType: String,
        finalPrice: Number,
        deposit: Number,
        leaseStartDate: Date,
        leaseEndDate: Date,
        agreementNumber: String,
        vacatedAt: {
          type: Date,
          default: Date.now,
        },
        vacatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        vacatedReason: String,
      },
    ],

    // ── Owner Rent Payouts (SUPER ADMIN APPROVAL) ───────────────
    ownerPayouts: [
      {
        amount: { type: Number, required: true },
        month: String, // e.g. "Oct 2026"
        dueDate: Date,
        payoutDate: Date,
        status: {
          type: String,
          enum: ['pending', 'approved', 'released', 'rejected'],
          default: 'pending',
        },
        paymentMode: {
          type: String,
          enum: ['UPI', 'Bank_Transfer', 'NEFT', 'RTGS', 'Cheque', 'Cash'],
          default: 'UPI',
        },
        utrNumber: String,
        bankOrUpiDetails: String,
        remarks: String,
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        approvedAt: Date,
      },
    ],

    // ── Rent Ledger & Tenant Collection Tracking ────────────────
    rentLedger: [
      {
        month: String, // e.g. "Oct 2026"
        amount: Number,
        dueDate: Date,
        paidDate: Date,
        status: {
          type: String,
          enum: ['PAID', 'PENDING', 'OVERDUE', 'DISPUTED'],
          default: 'PENDING',
        },
        paymentMode: String,
        utrNumber: String,
        disputeNote: String,
        resolved: { type: Boolean, default: false },
        recordedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      },
    ],

    // ── Deletion Control (Mandatory Reason Required by Staff) ───
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: Date,
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    deletedByRole: String,
    deletionReason: {
      type: String,
      trim: true,
    },

    // ── General Remarks ─────────────────────────────────────────
    remarks: {
      type: String,
      trim: true,
    },

    // ── Publishing & Listing Lock Control (Verification Staff) ───
    isLocked: {
      type: Boolean,
      default: false,
      index: true,
    },
    publishedAt: Date,
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    publishedByName: String,

    // ── 6-Month Scheduled Inspections (Verification Staff) ───────
    scheduledInspections: [
      {
        inspectionId: String,
        scheduledDate: Date,
        completedDate: Date,
        status: {
          type: String,
          enum: ['scheduled', 'completed', 'overdue', 'cancelled'],
          default: 'scheduled',
        },
        inspector: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        inspectorName: String,
        conditionScore: {
          type: String,
          enum: ['excellent', 'good', 'fair', 'needs_repair', 'poor'],
          default: 'good',
        },
        structuralCheck: { type: Boolean, default: true },
        electricalCheck: { type: Boolean, default: true },
        plumbingCheck: { type: Boolean, default: true },
        cleanlinessCheck: { type: Boolean, default: true },
        tenantFeedback: String,
        notes: String,
        photos: [String],
      },
    ],

    // ── Complaints & Maintenance Requests (Tenant / Staff) ───────
    complaints: [
      {
        ticketId: String,
        category: {
          type: String,
          enum: ['plumbing', 'electrical', 'water', 'cleaning', 'maintenance', 'appliance', 'damage', 'carpentry', 'leakage', 'room_change', 'rent_issue', 'other'],
          default: 'other',
        },
        title: { type: String, required: true },
        description: String,
        priority: {
          type: String,
          enum: ['low', 'medium', 'high', 'urgent'],
          default: 'medium',
        },
        status: {
          type: String,
          enum: ['submitted', 'open', 'assigned', 'in_progress', 'resolved', 'reopened', 'closed'],
          default: 'submitted',
        },
        raisedByRole: {
          type: String,
          enum: ['tenant', 'owner', 'staff', 'admin'],
          default: 'tenant',
        },
        raisedByName: String,
        tenantPhone: String,
        preferredVisitTime: String,
        assignedStaff: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        assignedStaffName: String,
        photos: [String],
        messages: [
          {
            senderRole: String,
            senderName: String,
            text: String,
            photos: [String],
            createdAt: { type: Date, default: Date.now },
          },
        ],
        createdAt: { type: Date, default: Date.now },
        resolvedAt: Date,
        resolutionNotes: String,
        reopenedAt: Date,
        reopenReason: String,
      },
    ],

    // ── Room / Property Change Requests (Tenant Flow) ─────────────
    roomChangeRequests: [
      {
        requestId: String,
        reason: {
          type: String,
          enum: ['need_bigger_space', 'budget_change', 'job_relocation', 'roommate_issue', 'property_condition', 'other'],
          default: 'need_bigger_space',
        },
        description: String,
        preferredMoveDate: Date,
        targetBhk: String,
        targetLocality: String,
        budgetRange: String,
        status: {
          type: String,
          enum: ['submitted', 'under_review', 'approved', 'rejected', 'completed'],
          default: 'submitted',
        },
        photos: [String],
        adminRemarks: String,
        resolvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        resolvedAt: Date,
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Auto-generate Lead Tracking ID and Cover Photo before save
propertyLeadSchema.pre('save', function () {

  if (!this.leadId) {
    const timestamp = Date.now().toString().slice(-6);
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    this.leadId = `PL-${timestamp}-${rand}`;
  }

  // Cover photo logic
  if (!this.coverPhoto) {
    if (this.photos && this.photos.length > 0) {
      const coverItem = this.photos.find((p) => p.isCover) || this.photos[0];
      this.coverPhoto = coverItem.url;
    } else if (this.images && this.images.length > 0) {
      this.coverPhoto = this.images[0];
    }
  }

  // Sync images array with photos
  if (this.photos && this.photos.length > 0) {
    this.images = this.photos.map((p) => p.url);
  }

  
});

// PII Phone Masking for Field Agent privacy protection
propertyLeadSchema.methods.getMaskedPhone = function () {
  if (!this.ownerPhone) return '';
  const cleaned = this.ownerPhone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return '+91 ' + cleaned.slice(0, 5) + ' •••••';
  }
  return this.ownerPhone;
};

const PropertyLead = mongoose.models.PropertyLead || mongoose.model('PropertyLead', propertyLeadSchema);

module.exports = PropertyLead;
module.exports.LEAD_STATUS = LEAD_STATUS;
module.exports.PROPERTY_TYPES = PROPERTY_TYPES;
module.exports.LISTING_TYPES = LISTING_TYPES;
module.exports.COMMISSION_STATUS = COMMISSION_STATUS;
module.exports.FURNISHING_TYPES = FURNISHING_TYPES;
