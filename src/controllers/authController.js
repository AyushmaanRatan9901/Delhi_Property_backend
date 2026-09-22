const PropertyLead = require('../models/propertyLeadModel');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { generateStaffId } = require('../utils/generateId');
const { generateOTP, hashOTP, verifyOTP, otpExpiresAt, OTP_EXPIRY_MINUTES } = require('../utils/otp');
const { sendOTPEmail } = require('../utils/mailer');

// ── Helpers ────────────────────────────────────────────────────────────────────

const buildIdentifierQuery = (identifier) => {
  const isEmail = /^\S+@\S+\.\S+$/.test(identifier);
  return isEmail
    ? { email: identifier.toLowerCase() }
    : { phone: identifier.trim() };
};

const sendTokenResponse = (user, statusCode, res, message = 'Success') => {
  const token = user.generateToken();
  const userData = user.toObject();
  delete userData.otp;
  res.status(statusCode).json(new ApiResponse(statusCode, { user: userData, token }, message));
};

// ── Public Routes ──────────────────────────────────────────────────────────────

// POST /api/v1/auth/register  — Step 1: create account + send OTP
const registerFieldAgent = async (req, res, next) => {
  const { name, phone, email } = req.body;

  const existing = await User.findOne({ phone });
  if (existing) {
    if (!existing.isVerified) {
      return next(new ApiError(400, 'Phone registered but not verified yet. Please verify your OTP to complete registration.'));
    }
    return next(new ApiError(400, 'Phone number is already registered'));
  }

  const staffId = await generateStaffId('field_agent');
  const payload = { name, phone, role: 'field_agent', staffId, isVerified: false };
  if (email) payload.email = email;

  const user = await User.create(payload);

  // Generate OTP and attach to user
  const otp = generateOTP();
  user.otp = { code: await hashOTP(otp), expiresAt: otpExpiresAt() };
  await user.save({ validateBeforeSave: false });

  // Send OTP via email if provided
  if (email) await sendOTPEmail(email, otp, OTP_EXPIRY_MINUTES);

  if (process.env.NODE_ENV === 'development') {
    return res.status(201).json(
      new ApiResponse(201, { staffId, otp, expiresInMinutes: OTP_EXPIRY_MINUTES },
        'Account created! Verify OTP to complete registration.')
    );
  }

  console.log(`[REGISTER OTP] ${phone} → ${otp}`);
  res.status(201).json(
    new ApiResponse(201, { staffId, expiresInMinutes: OTP_EXPIRY_MINUTES },
      `OTP sent to your ${email ? 'email' : 'phone'} — verify to complete registration.`)
  );
};

// POST /api/v1/auth/register/verify-otp  — Step 2: verify OTP → get JWT
const verifyRegistrationOTP = async (req, res, next) => {
  const { phone, otp } = req.body;

  const user = await User.findOne({ phone }).select('+otp.code +otp.expiresAt');
  if (!user) return next(new ApiError(404, 'No account found with this phone number'));
  if (user.isVerified) return next(new ApiError(400, 'Account already verified. Please login.'));

  if (!user.otp?.code) {
    return next(new ApiError(400, 'No OTP found. Please re-register or request a new OTP.'));
  }
  if (user.otp.expiresAt < new Date()) {
    return next(new ApiError(400, 'OTP expired. Please re-register to get a new OTP.'));
  }

  const isValid = await verifyOTP(otp, user.otp.code);
  if (!isValid) return next(new ApiError(401, 'Invalid OTP. Please try again.'));

  user.otp = undefined;
  user.isVerified = true;
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  sendTokenResponse(user, 200, res, 'Registration complete! You are now logged in.');
};

// POST /api/v1/auth/seed-super-admin
// One-time bootstrap — only works when no super_admin exists in the DB
const seedSuperAdmin = async (req, res, next) => {
  const existing = await User.findOne({ role: 'super_admin' });
  if (existing) {
    return next(new ApiError(400, 'Super admin already exists. Please login via OTP.'));
  }

  const { name, phone, email } = req.body;
  const staffId = await generateStaffId('super_admin');

  const admin = await User.create({ name, phone, email, role: 'super_admin', staffId, isVerified: true });
  sendTokenResponse(admin, 201, res, 'Super admin account created. You are now logged in.');
};

// POST /api/v1/auth/send-otp
const sendOTP = async (req, res, next) => {
  const { identifier } = req.body;
  const query = buildIdentifierQuery(identifier);

  const user = await User.findOne(query).select('+otp.code +otp.expiresAt');
  if (!user) return next(new ApiError(404, 'No account found with this phone/email.'));
  if (!user.isVerified) {
    return next(new ApiError(403, 'Account not verified. Complete registration by verifying your OTP first.'));
  }
  if (!user.isActive) {
    return next(new ApiError(403, 'Your account is deactivated. Contact the administrator.'));
  }

  const otp = generateOTP();
  const hashed = await hashOTP(otp);

  user.otp = { code: hashed, expiresAt: otpExpiresAt() };
  await user.save({ validateBeforeSave: false });

  const isEmailLogin = !!query.email;

  if (isEmailLogin) {
    // Send real OTP via Gmail
    await sendOTPEmail(user.email, otp, OTP_EXPIRY_MINUTES);
    return res.json(
      new ApiResponse(200, { expiresInMinutes: OTP_EXPIRY_MINUTES }, `OTP sent to ${user.email}`)
    );
  }

  // Phone: SMS integration (MSG91/Twilio) can be added here
  // Dev mode: return OTP in response for testing
  if (process.env.NODE_ENV === 'development') {
    return res.json(
      new ApiResponse(200, { otp, expiresInMinutes: OTP_EXPIRY_MINUTES }, 'OTP generated for phone (dev mode)')
    );
  }

  console.log(`[OTP] Phone ${identifier} → ${otp}`);
  res.json(
    new ApiResponse(200, { expiresInMinutes: OTP_EXPIRY_MINUTES }, 'OTP sent to your registered phone number')
  );
};

// POST /api/v1/auth/verify-otp
const verifyOTPLogin = async (req, res, next) => {
  const { identifier, otp } = req.body;
  const query = buildIdentifierQuery(identifier);

  const user = await User.findOne(query).select('+otp.code +otp.expiresAt');
  if (!user) return next(new ApiError(404, 'No account found.'));
  if (!user.isActive) {
    return next(new ApiError(403, 'Your account is deactivated. Contact the administrator.'));
  }

  if (!user.otp?.code) {
    return next(new ApiError(400, 'No OTP was requested. Please call /send-otp first.'));
  }
  if (user.otp.expiresAt < new Date()) {
    return next(new ApiError(400, 'OTP has expired. Please request a new one.'));
  }

  const isValid = await verifyOTP(otp, user.otp.code);
  if (!isValid) return next(new ApiError(401, 'Invalid OTP. Please try again.'));

  user.otp = undefined;
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  sendTokenResponse(user, 200, res, 'Login successful');
};

// ── Protected — any logged-in user ────────────────────────────────────────────

// GET /api/v1/auth/me
const getMe = async (req, res) => {
  res.json(new ApiResponse(200, req.user));
};

// PUT /api/v1/auth/profile
const updateProfile = async (req, res) => {
  const ALLOWED = [
    'name', 'email', 'alternatePhone', 'designation',
    'gender', 'dateOfBirth', 'upiId', 'bankDetails', 'address',
    'kyc', 'aadhaarCard', 'panCard', 'aadhaarNumber', 'panNumber',
  ];
  const updates = {};
  ALLOWED.forEach((k) => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });

  // If KYC documents are provided, ensure status is submitted / under review
  if (req.body.kyc || req.body.aadhaarCard || req.body.panCard) {
    if (!updates.kyc) updates.kyc = {};
    if (req.body.aadhaarCard && !updates.kyc.aadhaarDoc) updates.kyc.aadhaarDoc = req.body.aadhaarCard;
    if (req.body.panCard && !updates.kyc.panDoc) updates.kyc.panDoc = req.body.panCard;
    if (req.body.aadhaarNumber && !updates.kyc.aadhaarNumber) updates.kyc.aadhaarNumber = req.body.aadhaarNumber;
    if (req.body.panNumber && !updates.kyc.panNumber) updates.kyc.panNumber = req.body.panNumber;
    updates.kyc.status = req.body.kyc?.status || 'UNDER_REVIEW';
    updates.kyc.submittedAt = new Date();
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  }).select('-otp');

  res.json(new ApiResponse(200, user, 'Profile updated'));
};

// POST /api/v1/auth/profile/photo
const uploadPhoto = async (req, res, next) => {
  if (!req.file) return next(new ApiError(400, 'No photo uploaded'));

  const photoUrl = `/uploads/profiles/${req.file.filename}`;
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { profilePhoto: photoUrl },
    { new: true }
  ).select('-otp');

  res.json(new ApiResponse(200, { profilePhoto: user.profilePhoto }, 'Profile photo updated'));
};

// POST /api/v1/auth/kyc/upload
// Upload single Aadhaar or PAN document image
const uploadKycDocument = async (req, res, next) => {
  if (!req.file) return next(new ApiError(400, 'No document file uploaded'));

  const docUrl = `/uploads/kyc/${req.file.filename}`;
  const docType = req.body.docType || req.file.fieldname || 'aadhaar'; // 'aadhaar' or 'pan'

  const updateFields = {
    [`kyc.${docType === 'pan' ? 'panDoc' : 'aadhaarDoc'}`]: docUrl,
    [`${docType === 'pan' ? 'panCard' : 'aadhaarCard'}`]: docUrl,
    'kyc.status': 'UNDER_REVIEW',
    'kyc.submittedAt': new Date(),
  };

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updateFields },
    { new: true }
  ).select('-otp');

  res.json(
    new ApiResponse(
      200,
      {
        url: docUrl,
        docType,
        kyc: user.kyc,
        user,
      },
      `${docType.toUpperCase()} document uploaded successfully`
    )
  );
};

// PUT /api/v1/auth/kyc
// Submit complete KYC details (numbers + documents)
const updateKyc = async (req, res, next) => {
  const { aadhaarDoc, panDoc, aadhaarNumber, panNumber } = req.body;

  const updateData = {
    'kyc.status': 'UNDER_REVIEW',
    'kyc.submittedAt': new Date(),
  };

  if (aadhaarDoc !== undefined) {
    updateData['kyc.aadhaarDoc'] = aadhaarDoc;
    updateData.aadhaarCard = aadhaarDoc;
  }
  if (panDoc !== undefined) {
    updateData['kyc.panDoc'] = panDoc;
    updateData.panCard = panDoc;
  }
  if (aadhaarNumber !== undefined) {
    updateData['kyc.aadhaarNumber'] = aadhaarNumber.trim();
    updateData.aadhaarNumber = aadhaarNumber.trim();
  }
  if (panNumber !== undefined) {
    updateData['kyc.panNumber'] = panNumber.trim().toUpperCase();
    updateData.panNumber = panNumber.trim().toUpperCase();
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updateData },
    { new: true, runValidators: true }
  ).select('-otp');

  res.json(new ApiResponse(200, user, 'KYC documents submitted for verification'));
};

// PUT /api/v1/auth/users/:id/kyc-status
// Super Admin / Admin approves or rejects agent's KYC
const updateKycStatus = async (req, res, next) => {
  const { status, rejectionReason } = req.body;

  if (!['VERIFIED', 'REJECTED', 'UNDER_REVIEW', 'NOT_UPLOADED'].includes(status)) {
    return next(new ApiError(400, 'Invalid KYC status value'));
  }

  const user = await User.findById(req.params.id);
  if (!user) return next(new ApiError(404, 'User not found'));

  user.kyc = user.kyc || {};
  user.kyc.status = status;
  if (status === 'VERIFIED') {
    user.kyc.verifiedAt = new Date();
    user.kyc.verifiedBy = req.user._id;
    user.kyc.rejectionReason = undefined;
    user.isVerified = true;
  } else if (status === 'REJECTED') {
    user.kyc.rejectionReason = rejectionReason || 'Documents unclear or invalid';
    user.kyc.verifiedAt = undefined;
  }

  await user.save({ validateBeforeSave: false });

  res.json(new ApiResponse(200, user, `KYC status marked as ${status}`));
};

// ── Super Admin + Admin ────────────────────────────────────────────────────────

// POST /api/v1/auth/users
// super_admin → can create: admin, field_agent, field_staff, tele_caller
// admin        → can create: field_agent, field_staff, tele_caller
const createUser = async (req, res, next) => {
  const { name, phone, email, role, commissionRate } = req.body;
  const callerRole = req.user.role;

  if (role === 'super_admin') {
    return next(new ApiError(403, 'Cannot create additional super admin accounts.'));
  }
  if (role === 'admin' && callerRole !== 'super_admin') {
    return next(new ApiError(403, 'Only super admin can create admin accounts.'));
  }

  const staffId = await generateStaffId(role);

  const payload = {
    name,
    phone,
    role,
    staffId,
    isVerified: true, // admin-created accounts skip OTP verification
    createdBy: req.user._id,
  };
  if (email) payload.email = email;
  if (['field_agent', 'dealer', 'broker'].includes(role) && commissionRate != null) {
    payload.commissionRate = commissionRate;
  }

  const user = await User.create(payload);
  const userObj = user.toObject();
  delete userObj.otp;

  res.status(201).json(new ApiResponse(201, userObj, 'User account created. They can now login with OTP.'));
};

// GET /api/v1/auth/users
const listUsers = async (req, res) => {
  const { role, isActive, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === 'true';

  const skip = (Number(page) - 1) * Number(limit);
  const [users, total] = await Promise.all([
    User.find(filter).select('-otp').sort('-createdAt').skip(skip).limit(Number(limit)),
    User.countDocuments(filter),
  ]);

  res.json(
    new ApiResponse(200, {
      users,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    })
  );
};

// GET /api/v1/auth/users/:id
const getUserById = async (req, res, next) => {
  const user = await User.findById(req.params.id).select('-otp');
  if (!user) return next(new ApiError(404, 'User not found'));
  res.json(new ApiResponse(200, user));
};

// PUT /api/v1/auth/users/:id
// Edit user details — super_admin & admin can use this
// super_admin → can also set notes field
// admin        → cannot edit other admins or super_admin
const editUser = async (req, res, next) => {
  const target = await User.findById(req.params.id);
  if (!target) return next(new ApiError(404, 'User not found'));

  const callerRole = req.user.role;

  if (['super_admin', 'admin'].includes(target.role) && callerRole !== 'super_admin') {
    return next(new ApiError(403, 'Only super admin can edit admin/super_admin accounts'));
  }

  const ALLOWED = [
    'name', 'phone', 'email', 'designation', 'address',
    'dateOfBirth', 'gender', 'alternatePhone', 'locality', 'joiningDate',
  ];
  if (callerRole === 'super_admin') ALLOWED.push('notes');

  const updates = {};
  ALLOWED.forEach((k) => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });

  const updated = await User.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  }).select('-otp');

  res.json(new ApiResponse(200, updated, 'User updated successfully'));
};

// PUT /api/v1/auth/users/:id/status
// super_admin → can toggle: admin, field_agent, field_staff, tele_caller
// admin        → can toggle: field_agent, field_staff, tele_caller
const toggleUserStatus = async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) return next(new ApiError(404, 'User not found'));

  const callerRole = req.user.role;

  if (user.role === 'super_admin') {
    return next(new ApiError(403, 'Cannot deactivate a super admin account'));
  }
  if (user.role === 'admin' && callerRole !== 'super_admin') {
    return next(new ApiError(403, 'Only super admin can deactivate an admin account'));
  }

  user.isActive = !user.isActive;
  await user.save({ validateBeforeSave: false });

  const status = user.isActive ? 'activated' : 'deactivated';
  res.json(new ApiResponse(200, { isActive: user.isActive }, `Account ${status} successfully`));
};

// PUT /api/v1/auth/users/:id/commission
const updateCommission = async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) return next(new ApiError(404, 'User not found'));
  if (!['field_agent', 'dealer', 'broker'].includes(user.role)) {
    return next(new ApiError(400, 'Commission rate applies to field agents, dealers, and brokers'));
  }

  user.commissionRate = Number(req.body.commissionRate) || 0;
  await user.save({ validateBeforeSave: false });

  res.json(new ApiResponse(200, { commissionRate: user.commissionRate }, 'Commission rate updated'));
};

// DELETE /api/v1/auth/users/:id
// Super Admin exclusive: delete any user account
const deleteUser = async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) return next(new ApiError(404, 'User not found'));

  if (user._id.toString() === req.user._id.toString()) {
    return next(new ApiError(400, 'Cannot delete your own super admin account'));
  }
  if (user.role === 'super_admin') {
    return next(new ApiError(403, 'Cannot delete a super admin account'));
  }

  await User.findByIdAndDelete(req.params.id);

  res.json(
    new ApiResponse(
      200,
      { id: req.params.id, name: user.name, role: user.role },
      `User ${user.name} (${user.role}) permanently deleted successfully`
    )
  );
};


// GET /api/v1/auth/users/:id/analytics-detail
// Super Admin & Admin: comprehensive role-specific statistics, properties, payouts, tasks & KYC
const getUserAnalyticsAndDetail = async (req, res, next) => {
  const user = await User.findById(req.params.id).select('-otp');
  if (!user) return next(new ApiError(404, 'User not found'));

  const userRole = user.role;
  const userId = user._id;
  const userPhone = user.phone;
  const userEmail = user.email;

  let roleData = {
    metrics: {},
    properties: [],
    payouts: [],
    rentLedger: [],
    assignedTasks: [],
    activityLogs: [],
  };

  try {
    if (['field_agent', 'dealer', 'broker'].includes(userRole)) {
      // 1. Field Agent / Dealer / Broker
      const leads = await PropertyLead.find({ agent: userId, isDeleted: false })
        .sort('-createdAt')
        .lean();

      const totalProperties = leads.length;
      const verifiedProperties = leads.filter((l) => ['verified', 'rented', 'sold'].includes(l.status)).length;
      const pendingProperties = leads.filter((l) => ['new', 'assigned', 'under_verification'].includes(l.status)).length;
      const closedDeals = leads.filter((l) => ['rented', 'sold'].includes(l.status) || l.deal?.status === 'closed_won').length;
      const rejectedProperties = leads.filter((l) => ['rejected', 'cancelled'].includes(l.status)).length;

      let totalCommissionEarned = 0;
      let pendingCommissionDues = 0;
      let fulfilledCommissionDues = 0;
      const payoutRequests = [];

      leads.forEach((l) => {
        const comm = l.commission;
        if (comm && comm.amount) {
          totalCommissionEarned += Number(comm.amount) || 0;
          if (comm.status === 'paid') {
            fulfilledCommissionDues += Number(comm.amount) || 0;
          } else if (['pending', 'approved'].includes(comm.status)) {
            pendingCommissionDues += Number(comm.amount) || 0;
          }

          payoutRequests.push({
            leadId: l.leadId || l._id,
            propertyTitle: l.title,
            amount: comm.amount,
            status: comm.status || 'pending',
            commissionRate: comm.rate || user.commissionRate || 15,
            paymentMode: comm.paymentMode || 'UPI',
            utrNumber: comm.utrNumber || '',
            bankOrUpiDetails: comm.bankOrUpiDetails || user.upiId || user.bankDetails?.accountNumber || '',
            requestedAt: l.createdAt,
            approvedAt: comm.paidAt || l.updatedAt,
            remarks: comm.remarks || '',
          });
        }
      });

      roleData.metrics = {
        totalProperties,
        verifiedProperties,
        pendingProperties,
        closedDeals,
        rejectedProperties,
        totalCommissionEarned,
        pendingCommissionDues,
        fulfilledCommissionDues,
        walletBalance: user.commissionWallet?.balance || 0,
        pendingBalance: user.commissionWallet?.pendingBalance || pendingCommissionDues,
        commissionRate: user.commissionRate || 15,
      };

      roleData.properties = leads.map((l) => ({
        _id: l._id,
        leadId: l.leadId,
        title: l.title,
        propertyType: l.propertyType,
        listingType: l.listingType,
        price: l.expectedPrice || l.rentAmount || l.price || 0,
        locality: l.locality,
        status: l.status,
        coverPhoto: l.coverPhoto || (l.photos && l.photos[0]?.url) || '',
        commission: l.commission,
        deal: l.deal,
        createdAt: l.createdAt,
      }));

      roleData.payouts = payoutRequests;

    } else if (userRole === 'owner') {
      // 2. Property Owner
      const ownerQuery = {
        $or: [
          { ownerPhone: userPhone },
          ...(userEmail ? [{ ownerEmail: userEmail }] : []),
          { agent: userId }
        ],
        isDeleted: false,
      };

      const leads = await PropertyLead.find(ownerQuery).sort('-createdAt').lean();

      const totalProperties = leads.length;
      const occupiedProperties = leads.filter((l) => l.status === 'rented' || l.deal?.status === 'closed_won').length;
      const vacantProperties = leads.filter((l) => l.status !== 'rented' && l.status !== 'sold').length;

      let totalRentCollected = 0;
      let pendingRentFromTenants = 0;
      let fulfilledRentPayouts = 0;
      let pendingRentPayouts = 0;

      const payoutHistory = [];
      const allRentLedger = [];

      leads.forEach((l) => {
        if (Array.isArray(l.ownerPayouts)) {
          l.ownerPayouts.forEach((p) => {
            if (p.status === 'released') {
              fulfilledRentPayouts += Number(p.amount) || 0;
            } else if (['pending', 'approved'].includes(p.status)) {
              pendingRentPayouts += Number(p.amount) || 0;
            }
            payoutHistory.push({
              leadId: l.leadId,
              propertyTitle: l.title,
              amount: p.amount,
              month: p.month,
              status: p.status,
              paymentMode: p.paymentMode,
              utrNumber: p.utrNumber,
              bankOrUpiDetails: p.bankOrUpiDetails || user.upiId || user.bankDetails?.accountNumber || '',
              approvedAt: p.approvedAt,
              remarks: p.remarks,
            });
          });
        }

        if (Array.isArray(l.rentLedger)) {
          l.rentLedger.forEach((r) => {
            if (r.status === 'PAID') {
              totalRentCollected += Number(r.amount) || 0;
            } else if (['PENDING', 'OVERDUE'].includes(r.status)) {
              pendingRentFromTenants += Number(r.amount) || 0;
            }
            allRentLedger.push({
              leadId: l.leadId,
              propertyTitle: l.title,
              month: r.month,
              amount: r.amount,
              dueDate: r.dueDate,
              paidDate: r.paidDate,
              status: r.status,
              paymentMode: r.paymentMode,
              utrNumber: r.utrNumber,
              disputeNote: r.disputeNote,
              resolved: r.resolved,
            });
          });
        }
      });

      roleData.metrics = {
        totalProperties,
        occupiedProperties,
        vacantProperties,
        totalRentCollected,
        pendingRentFromTenants,
        fulfilledRentPayouts,
        pendingRentPayouts,
      };

      roleData.properties = leads.map((l) => ({
        _id: l._id,
        leadId: l.leadId,
        title: l.title,
        propertyType: l.propertyType,
        listingType: l.listingType,
        rentAmount: l.expectedPrice || l.rentAmount || l.price || 0,
        locality: l.locality,
        status: l.status,
        deal: l.deal,
        coverPhoto: l.coverPhoto || (l.photos && l.photos[0]?.url) || '',
        createdAt: l.createdAt,
      }));

      roleData.payouts = payoutHistory;
      roleData.rentLedger = allRentLedger;

    } else if (['field_staff', 'tele_caller'].includes(userRole)) {
      // 3. Verification Staff / Tele-caller
      const assignedLeads = await PropertyLead.find({ assignedTo: userId, isDeleted: false })
        .sort('-assignedAt -createdAt')
        .lean();

      const totalAssigned = assignedLeads.length;
      const completedInspections = assignedLeads.filter((l) =>
        ['verified', 'rented', 'sold', 'rejected'].includes(l.status)
      ).length;
      const pendingInspections = assignedLeads.filter((l) =>
        ['assigned', 'under_verification'].includes(l.status)
      ).length;
      const verifiedCount = assignedLeads.filter((l) => ['verified', 'rented', 'sold'].includes(l.status)).length;
      const rejectedCount = assignedLeads.filter((l) => l.status === 'rejected').length;

      roleData.metrics = {
        totalAssigned,
        completedInspections,
        pendingInspections,
        verifiedCount,
        rejectedCount,
        completionRate: totalAssigned > 0 ? Math.round((completedInspections / totalAssigned) * 100) : 0,
      };

      roleData.assignedTasks = assignedLeads.map((l) => ({
        _id: l._id,
        leadId: l.leadId,
        title: l.title,
        propertyType: l.propertyType,
        listingType: l.listingType,
        ownerName: l.ownerName,
        ownerPhone: l.ownerPhone,
        address: l.address,
        locality: l.locality,
        status: l.status,
        assignedAt: l.assignedAt || l.createdAt,
        assignmentNotes: l.assignmentNotes,
        verificationDetails: l.verificationDetails,
      }));

    } else if (['admin', 'super_admin'].includes(userRole)) {
      // 4. Admin / Sub-admin
      const [usersCreated, leadsAssigned, dealsClosed, payoutsApproved] = await Promise.all([
        User.find({ createdBy: userId }).select('-otp').lean(),
        PropertyLead.countDocuments({ assignedBy: userId, isDeleted: false }),
        PropertyLead.countDocuments({ 'deal.closedBy': userId, isDeleted: false }),
        PropertyLead.countDocuments({ 'ownerPayouts.approvedBy': userId, isDeleted: false }),
      ]);

      roleData.metrics = {
        usersCreatedCount: usersCreated.length,
        leadsAssignedCount: leadsAssigned,
        dealsClosedCount: dealsClosed,
        payoutsApprovedCount: payoutsApproved,
      };

      roleData.activityLogs = usersCreated.map((u) => ({
        _id: u._id,
        name: u.name,
        role: u.role,
        phone: u.phone,
        createdAt: u.createdAt,
      }));

    } else if (userRole === 'tenant') {
      // 5. Tenant
      const tenantQuery = {
        $or: [
          { 'deal.tenantPhone': userPhone },
          ...(userEmail ? [{ 'deal.tenantEmail': userEmail }] : []),
        ],
        isDeleted: false,
      };

      const leads = await PropertyLead.find(tenantQuery).lean();
      const allRentLedger = [];
      leads.forEach((l) => {
        if (Array.isArray(l.rentLedger)) {
          l.rentLedger.forEach((r) => {
            allRentLedger.push({
              leadId: l.leadId,
              propertyTitle: l.title,
              month: r.month,
              amount: r.amount,
              dueDate: r.dueDate,
              paidDate: r.paidDate,
              status: r.status,
              paymentMode: r.paymentMode,
              utrNumber: r.utrNumber,
            });
          });
        }
      });

      roleData.metrics = {
        rentedPropertiesCount: leads.length,
        activeAgreements: leads.filter((l) => l.deal?.status === 'closed_won' || l.status === 'rented').length,
      };
      roleData.properties = leads;
      roleData.rentLedger = allRentLedger;
    }
  } catch (err) {
    console.error('[getUserAnalyticsAndDetail error]', err);
  }

  res.json(
    new ApiResponse(200, {
      user,
      ...roleData,
    })
  );
};

module.exports = {
  getUserAnalyticsAndDetail,
  registerFieldAgent,
  verifyRegistrationOTP,
  seedSuperAdmin,
  sendOTP,
  verifyOTPLogin,
  getMe,
  updateProfile,
  uploadPhoto,
  uploadKycDocument,
  updateKyc,
  updateKycStatus,
  createUser,
  listUsers,
  getUserById,
  editUser,
  toggleUserStatus,
  updateCommission,
  deleteUser,
};
