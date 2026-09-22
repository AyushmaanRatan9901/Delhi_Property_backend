const PropertyLead = require("../models/propertyLeadModel");
const User = require("../models/User");
const AdminSetting = require("../models/AdminSetting");
const Notification = require("../models/Notification");
const { createAndSendNotification } = require("./notificationController");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { emitToUser, emitToRole, broadcast } = require("../config/socket");

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Masks 10-digit Indian phone number (e.g. 9811234567 -> +91 98112 •••••)
 */
const maskPhone = (phone) => {
  if (!phone) return "";
  const cleaned = String(phone).replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} •••••`;
  }
  return phone;
};

/**
 * Calculates estimated commission based on listing type and property price:
 * - Sale: 0.5% min 10k
 * - Rent: 15% 1st month rent (initial) + 5% monthly recurring
 */
const calculateEstimatedCommission = (listingType, price) => {
  const isSale = String(listingType).toLowerCase() === "sale";
  if (isSale) {
    const saleCommission = Math.max(10000, Math.round(price * 0.005));
    return {
      estimatedAmount: saleCommission,
      firstMonthEstimated: saleCommission,
      recurringMonthlyEstimated: 0,
      recurringMonthlyRate: 0,
    };
  }
  const firstMonth = Math.max(2000, Math.round(price * 0.15)); // 15% 1st month
  const monthlyRecurring = Math.round(price * 0.05); // 5% recurring every month
  return {
    estimatedAmount: firstMonth,
    firstMonthEstimated: firstMonth,
    recurringMonthlyEstimated: monthlyRecurring,
    recurringMonthlyRate: 5,
  };
};

// ── 1. FIELD AGENT: Lead Submission & Personal Management ──────────────────────

/**
 * POST /api/v1/leads
 * @desc Field Agent (or Staff) submits a new property lead
 */
const createPropertyLead = async (req, res) => {
  const {
    title,
    description,
    propertyType,
    listingType,
    expectedPrice,
    rentAmount,
    price,
    securityDeposit,
    maintenanceCharge,
    furnishing,
    availableFrom,
    ownerName,
    ownerPhone,
    ownerEmail,
    alternatePhone,
    locality,
    address,
    location,
    gpsDetails,
    photos,
    images,
    videoLink,
    videoUrl,
    virtualTourLink,
    remarks,
  } = req.body;

  if (!ownerName?.trim())
    throw new ApiError(400, "Owner full name is required");
  if (!ownerPhone?.trim())
    throw new ApiError(400, "Owner phone number is required");

  const cleanPhone = String(ownerPhone).replace(/\D/g, "");
  if (cleanPhone.length < 10) {
    throw new ApiError(
      400,
      "Enter a valid 10-digit Indian mobile number for owner",
    );
  }

  const finalPrice = Number(expectedPrice || rentAmount || price);
  if (!finalPrice || finalPrice <= 0) {
    throw new ApiError(
      400,
      "Expected rent or sale price must be a valid positive amount",
    );
  }

  const finalLocality =
    locality?.trim() || address?.locality || address?.city || "Delhi NCR";

  // Normalize photos
  let formattedPhotos = [];
  if (Array.isArray(photos) && photos.length > 0) {
    formattedPhotos = photos.map((p, idx) => {
      if (typeof p === "string") {
        return {
          url: p,
          caption: `Photo ${idx + 1}`,
          isCover: idx === 0,
          uploadedBy: "agent",
        };
      }
      return {
        url: p.url || p.uri,
        caption: p.caption || `Photo ${idx + 1}`,
        isCover: p.isCover || idx === 0,
        uploadedBy: "agent",
      };
    });
  } else if (Array.isArray(images) && images.length > 0) {
    formattedPhotos = images.map((url, idx) => ({
      url,
      caption: `Photo ${idx + 1}`,
      isCover: idx === 0,
      uploadedBy: "agent",
    }));
  }

  // Calculate default estimated commission
  const estimatedCommission = calculateEstimatedCommission(
    listingType || "rent",
    finalPrice,
  );

  // Duplicate Check: Check if a lead with same owner phone already exists
  const existingLeadWithPhone = await PropertyLead.findOne({
    ownerPhone: cleanPhone,
    isDeleted: false,
  }).sort({ createdAt: -1 });

  let duplicateFlag = { isDuplicate: false, status: "none" };
  if (existingLeadWithPhone) {
    duplicateFlag = {
      isDuplicate: true,
      duplicateOf: existingLeadWithPhone._id,
      matchType: "phone",
      duplicateReason: `Duplicate owner mobile (${cleanPhone}) matches listing ${existingLeadWithPhone.leadId || existingLeadWithPhone._id}`,
      status: "flagged",
    };
  }

  const newLead = await PropertyLead.create({
    agent: req.user._id,
    agentName: req.user.name,
    agentPhone: req.user.phone,
    agentStaffId: req.user.staffId || undefined,
    title:
      title?.trim() ||
      `${propertyType || "Residential"} for ${listingType || "Rent"} in ${finalLocality}`,
    description: description?.trim(),
    propertyType: propertyType || "2BHK",
    listingType: (listingType || "rent").toLowerCase(),
    expectedPrice: finalPrice,
    securityDeposit: Number(securityDeposit) || 0,
    maintenanceCharge: Number(maintenanceCharge) || 0,
    furnishing: furnishing || "unfurnished",
    availableFrom: availableFrom ? new Date(availableFrom) : new Date(),
    ownerName: ownerName.trim(),
    ownerPhone: cleanPhone,
    ownerEmail: ownerEmail?.trim()?.toLowerCase(),
    alternatePhone: alternatePhone
      ? String(alternatePhone).replace(/\D/g, "")
      : undefined,
    ownerAadhaarLast4: req.body.ownerAadhaarLast4
      ? String(req.body.ownerAadhaarLast4).trim().slice(-4)
      : undefined,
    locality: finalLocality,
    address: {
      street: address?.street,
      landmark: address?.landmark,
      city: address?.city || "Delhi NCR",
      state: address?.state || "Delhi",
      pincode: address?.pincode,
      fullAddress: address?.fullAddress || address?.street || finalLocality,
    },
    location: location?.coordinates ? location : undefined,
    gpsDetails: gpsDetails
      ? {
          latitude: Number(gpsDetails.latitude),
          longitude: Number(gpsDetails.longitude),
          accuracy: Number(gpsDetails.accuracy || gpsDetails.accuracyMeters),
          reverseGeocodedAddress:
            gpsDetails.formattedAddress || gpsDetails.reverseGeocodedAddress,
        }
      : undefined,
    photos: formattedPhotos,
    videoLink: videoLink?.trim() || videoUrl?.trim(),
    videoUrl: videoUrl?.trim() || videoLink?.trim(),
    virtualTourLink: virtualTourLink?.trim(),
    status: "new",
    duplicateFlag,
    commission: {
      estimatedAmount: estimatedCommission.estimatedAmount,
      firstMonthCommission: estimatedCommission.firstMonthEstimated,
      recurringMonthlyCommission: estimatedCommission.recurringMonthlyEstimated,
      recurringMonthlyRate: estimatedCommission.recurringMonthlyRate || 5,
      approvedAmount: 0,
      percentage: 15,
      status: "pending",
      recurringCommissions: [],
    },
    remarks: remarks?.trim(),
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        newLead,
        "Property lead submitted successfully and queued for verification!",
      ),
    );
};

/**
 * GET /api/v1/leads/my-leads
 * @desc Field Agent gets their own submitted leads only (Strict Isolation + PII Masking)
 */
const getMyLeads = async (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;

  const query = {
    agent: req.user._id,
    isDeleted: false,
  };

  if (status && status !== "ALL") {
    query.status = status.toLowerCase();
  }

  if (search?.trim()) {
    const s = search.trim();
    query.$or = [
      { leadId: { $regex: s, $options: "i" } },
      { locality: { $regex: s, $options: "i" } },
      { propertyType: { $regex: s, $options: "i" } },
      { "address.city": { $regex: s, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [leads, total] = await Promise.all([
    PropertyLead.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    PropertyLead.countDocuments(query),
  ]);

  // Mask owner PII for field agents
  const safeLeads = leads.map((l) => ({
    ...l,
    ownerPhone: maskPhone(l.ownerPhone),
    ownerName: l.ownerName,
    maskedPhone: maskPhone(l.ownerPhone),
  }));

  return res.json(
    new ApiResponse(
      200,
      {
        leads: safeLeads,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / Number(limit)),
          limit: Number(limit),
        },
      },
      "Personal leads retrieved successfully",
    ),
  );
};

/**
 * GET /api/v1/leads/my-stats
 * @desc Field Agent personal dashboard metrics
 */
const getMyLeadStats = async (req, res) => {
  const agentId = req.user._id;

  const [
    totalSubmitted,
    underVerification,
    verified,
    rentedOrSold,
    rejected,
    activeRentedCount,
    commissionSummary,
  ] = await Promise.all([
    PropertyLead.countDocuments({ agent: agentId, isDeleted: false }),
    PropertyLead.countDocuments({
      agent: agentId,
      status: { $in: ["new", "assigned", "under_verification"] },
      isDeleted: false,
    }),
    PropertyLead.countDocuments({
      agent: agentId,
      status: "verified",
      isDeleted: false,
    }),
    PropertyLead.countDocuments({
      agent: agentId,
      status: { $in: ["rented", "sold"] },
      isDeleted: false,
    }),
    PropertyLead.countDocuments({
      agent: agentId,
      status: "rejected",
      isDeleted: false,
    }),
    PropertyLead.countDocuments({
      agent: agentId,
      status: "rented",
      isDeleted: false,
    }),
    PropertyLead.aggregate([
      { $match: { agent: agentId, isDeleted: false } },
      {
        $group: {
          _id: null,
          potentialCommission: {
            $sum: {
              $cond: [
                { $in: ["$status", ["new", "assigned", "under_verification", "verified"]] },
                { $ifNull: ["$commission.firstMonthCommission", "$commission.estimatedAmount"] },
                0,
              ],
            },
          },
          approvedCommission: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ["$status", ["rented", "sold"]] },
                    { $in: ["$commission.status", ["approved", "paid"]] },
                  ],
                },
                { $ifNull: ["$commission.approvedAmount", 0] },
                0,
              ],
            },
          },
          recurringMonthlyActive: {
            $sum: {
              $cond: [
                { $eq: ["$status", "rented"] },
                { $ifNull: ["$commission.recurringMonthlyCommission", 0] },
                0,
              ],
            },
          },
          paidCommission: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ["$status", ["rented", "sold"]] },
                    { $eq: ["$commission.status", "paid"] },
                  ],
                },
                { $ifNull: ["$commission.approvedAmount", 0] },
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const comm = commissionSummary[0] || {
    potentialCommission: 0,
    approvedCommission: 0,
    recurringMonthlyActive: 0,
    paidCommission: 0,
  };

  return res.json(
    new ApiResponse(
      200,
      {
        totalSubmitted,
        underVerification,
        verified,
        rentedOrSold,
        rejected,
        activeTenantsCount: activeRentedCount,
        potentialCommission: comm.potentialCommission,
        approvedCommission: comm.approvedCommission,
        recurringMonthlyActive: comm.recurringMonthlyActive,
        paidCommission: comm.paidCommission,
        walletBalance: Math.max(0, comm.approvedCommission - comm.paidCommission),
      },
      "Agent lead stats retrieved successfully",
    ),
  );
};

// ── 2. ADMIN: View All Leads & Assign to Staff ─────────────────────────────────

/**
 * GET /api/v1/leads/admin/all
 * @desc Admin/SuperAdmin views all leads with filters & assigned staff info
 */
const getAllLeadsAdmin = async (req, res) => {
  const {
    status,
    assignedTo,
    locality,
    search,
    page = 1,
    limit = 30,
  } = req.query;

  const query = { isDeleted: false };

  if (status && status !== "ALL") {
    query.status = status.toLowerCase();
  }
  if (assignedTo) {
    query.assignedTo = assignedTo;
  }
  if (locality?.trim()) {
    query.locality = { $regex: locality.trim(), $options: "i" };
  }
  if (search?.trim()) {
    const s = search.trim();
    query.$or = [
      { leadId: { $regex: s, $options: "i" } },
      { ownerName: { $regex: s, $options: "i" } },
      { ownerPhone: { $regex: s, $options: "i" } },
      { locality: { $regex: s, $options: "i" } },
      { agentName: { $regex: s, $options: "i" } },
      { assignedStaffName: { $regex: s, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [leads, total] = await Promise.all([
    PropertyLead.find(query)
      .populate("agent", "name phone staffId role")
      .populate("assignedTo", "name phone staffId role")
      .populate("verifiedBy", "name phone staffId role")
      .populate("commission.decidedBy", "name staffId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    PropertyLead.countDocuments(query),
  ]);

  return res.json(
    new ApiResponse(
      200,
      {
        leads,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / Number(limit)),
          limit: Number(limit),
        },
      },
      "All leads retrieved for admin",
    ),
  );
};

/**
 * PATCH /api/v1/leads/:id/assign
 * @desc Admin assigns a property lead to Field Staff for physical verification
 */
const assignLeadToStaff = async (req, res) => {
  const { id } = req.params;
  const { staffId, notes } = req.body;

  if (!staffId) {
    throw new ApiError(400, "Please select a staff member to assign this lead");
  }

  const [lead, staff] = await Promise.all([
    PropertyLead.findOne({ _id: id, isDeleted: false }),
    User.findById(staffId),
  ]);

  if (!lead) throw new ApiError(404, "Property lead not found");
  if (!staff) throw new ApiError(404, "Selected staff member does not exist");

  lead.assignedTo = staff._id;
  lead.assignedStaffName = staff.name;
  lead.assignedStaffPhone = staff.phone;
  lead.assignedBy = req.user._id;
  lead.assignedAt = new Date();
  lead.assignmentNotes = notes?.trim() || lead.assignmentNotes;
  lead.status = "assigned";

  await lead.save();

  // ⚡ Persist Notification in DB & Real-Time Socket Push
  try {
    const propertyTitle = lead.title || lead.locality || lead.propertyDetails?.address?.city || lead.leadId || 'Property';
    const notif = await createAndSendNotification({
      recipient: staff._id,
      recipientRole: 'verification_staff',
      sender: req.user._id,
      senderName: req.user.name,
      title: 'New Property Assigned',
      message: `Property "${propertyTitle}" in ${lead.locality || lead.city || 'Location'} assigned to you for verification.`,
      type: 'lead_assigned',
      priority: 'high',
      leadId: lead._id,
      propertyId: lead.propertyId || lead.leadId,
      data: { lead },
    });

    emitToUser(staff._id.toString(), 'lead:assigned', { lead, notification: notif });
    emitToRole('verification_staff', 'lead:assigned', { lead });
    emitToRole('admin', 'lead:assigned', { lead });
    emitToRole('super_admin', 'lead:assigned', { lead });
  } catch (socketErr) {
    console.error('Notification / Socket emission error in assignLeadToStaff:', socketErr);
  }

  return res.json(
    new ApiResponse(
      200,
      lead,
      `Lead ${lead.leadId || lead._id} successfully assigned to ${staff.name}`,
    ),
  );
};

// ── 3. FIELD STAFF: Read, Create, Update, Verify & Delete (with Reason) ────────

/**
 * GET /api/v1/leads/assigned-to-me
 * @desc Field Staff views leads assigned to them for on-site inspection
 */
const getAssignedLeadsForStaff = async (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;

  const query = {
    assignedTo: req.user._id,
    isDeleted: false,
  };

  if (status && status !== "ALL") {
    query.status = status.toLowerCase();
  }

  if (search?.trim()) {
    const s = search.trim();
    query.$or = [
      { leadId: { $regex: s, $options: "i" } },
      { ownerName: { $regex: s, $options: "i" } },
      { ownerPhone: { $regex: s, $options: "i" } },
      { locality: { $regex: s, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [leads, total] = await Promise.all([
    PropertyLead.find(query)
      .populate("agent", "name phone staffId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    PropertyLead.countDocuments(query),
  ]);

  return res.json(
    new ApiResponse(
      200,
      {
        leads,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / Number(limit)),
          limit: Number(limit),
        },
      },
      "Assigned leads retrieved successfully for field staff",
    ),
  );
};

/**
 * GET /api/v1/leads/:id
 * @desc Get single lead details with role-based access control
 */
const getLeadById = async (req, res) => {
  const { id } = req.params;

  const lead = await PropertyLead.findOne({ _id: id, isDeleted: false })
    .populate("agent", "name phone staffId role")
    .populate("assignedTo", "name phone staffId")
    .populate("verifiedBy", "name phone staffId")
    .populate("commission.decidedBy", "name staffId");

  if (!lead) throw new ApiError(404, "Property lead not found");

  // Field Agent can only see their own lead (with masked phone)
  if (req.user.role === "field_agent") {
    if (lead.agent._id.toString() !== req.user._id.toString()) {
      throw new ApiError(
        403,
        "Access denied: You can only view leads submitted by you",
      );
    }
    const leadObj = lead.toObject();
    leadObj.ownerPhone = maskPhone(leadObj.ownerPhone);
    leadObj.maskedPhone = maskPhone(leadObj.ownerPhone);
    return res.json(new ApiResponse(200, leadObj, "Lead details retrieved"));
  }

  // Field Staff & Admins have full access to details for inspection
  return res.json(new ApiResponse(200, lead, "Lead details retrieved"));
};

/**
 * PUT/PATCH /api/v1/leads/:id
 * @desc Field Staff / Admin updates complete property details according to model
 */
const updateLeadByStaff = async (req, res) => {
  const { id } = req.params;

  const lead = await PropertyLead.findOne({ _id: id, isDeleted: false });
  if (!lead) throw new ApiError(404, "Property lead not found");

  // Field Agents can only edit unverified leads
  if (req.user.role === "field_agent") {
    if (lead.agent.toString() !== req.user._id.toString()) {
      throw new ApiError(403, "You can only update your own submitted leads");
    }
    if (lead.status !== "new") {
      throw new ApiError(
        400,
        "Cannot edit lead that has already been assigned or verified",
      );
    }
  }

  const allowedUpdates = [
    "title",
    "description",
    "propertyType",
    "listingType",
    "expectedPrice",
    "securityDeposit",
    "maintenanceCharge",
    "furnishing",
    "availableFrom",
    "ownerName",
    "ownerPhone",
    "ownerEmail",
    "alternatePhone",
    "ownerAadhaarLast4",
    "ownerPanCard",
    "ownerAddress",
    "ownerBankDetails",
    "ownerKYC",
    "ownerNotes",
    "locality",
    "address",
    "location",
    "gpsDetails",
    "photos",
    "images",
    "coverPhoto",
    "videoLink",
    "videoUrl",
    "virtualTourLink",
    "inspectionDetails",
    "verificationNotes",
    "rejectionReason",
    "remarks",
    "status",
    "deal",
    "commission",
    "agentName",
    "agentPhone",
    "assignedStaffName",
    "assignedStaffPhone",
    "assignmentNotes",
  ];

  allowedUpdates.forEach((field) => {
    if (req.body[field] !== undefined) {
      if (
        typeof req.body[field] === "object" &&
        req.body[field] !== null &&
        !Array.isArray(req.body[field])
      ) {
        // Deep merge nested object fields
        lead[field] = {
          ...(lead[field]
            ? lead[field].toObject
              ? lead[field].toObject()
              : lead[field]
            : {}),
          ...req.body[field],
        };
      } else {
        lead[field] = req.body[field];
      }
    }
  });

  // Handle GPS coordinate updates
  if (req.body.latitude !== undefined && req.body.longitude !== undefined) {
    const lat = Number(req.body.latitude);
    const lng = Number(req.body.longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      if (!lead.gpsDetails) lead.gpsDetails = {};
      lead.gpsDetails.latitude = lat;
      lead.gpsDetails.longitude = lng;
      if (req.body.accuracy !== undefined)
        lead.gpsDetails.accuracy = Number(req.body.accuracy);
      if (req.body.reverseGeocodedAddress)
        lead.gpsDetails.reverseGeocodedAddress =
          req.body.reverseGeocodedAddress;
      lead.location = {
        type: "Point",
        coordinates: [lng, lat],
      };
    }
  }

  // Re-sync photos and coverPhoto if photos provided
  if (Array.isArray(req.body.photos) && req.body.photos.length > 0) {
    lead.photos = req.body.photos.map((p, idx) => ({
      url: typeof p === "string" ? p : p.url || p.uri,
      caption:
        typeof p === "string"
          ? `Photo ${idx + 1}`
          : p.caption || `Photo ${idx + 1}`,
      isCover: typeof p === "string" ? idx === 0 : Boolean(p.isCover),
      uploadedBy: req.user.role === "field_agent" ? "agent" : "staff",
    }));
    const cover = lead.photos.find((p) => p.isCover) || lead.photos[0];
    lead.coverPhoto = cover.url;
    lead.images = lead.photos.map((p) => p.url);
  }

  // Update status to 'under_verification' if field staff started inspection
  if (
    ["field_staff", "verification_staff"].includes(req.user.role) &&
    lead.status === "assigned"
  ) {
    lead.status = "under_verification";
  }

  // Ensure commission remains strictly 0 and pending if property is not rented/sold
  if (lead.status !== "rented" && lead.status !== "sold" && !lead.deal?.isClosed) {
    if (!lead.commission) lead.commission = {};
    lead.commission.approvedAmount = 0;
    lead.commission.status = "pending";
    lead.commission.recurringCommissions = [];
  }

  await lead.save();

  return res.json(
    new ApiResponse(
      200,
      lead,
      "Property lead updated successfully by field staff",
    ),
  );
};

/**
 * PATCH /api/v1/leads/:id/verify-inspection
 * @desc Field Staff marks property as VERIFIED after completing on-site checklist
 */
const verifyLeadByStaff = async (req, res) => {
  const { id } = req.params;
  const {
    physicalVisitDone = true,
    ownershipDocsVerified = false,
    electricityBillChecked = false,
    keysAvailable = false,
    actualCarpetAreaSqFt,
    actualBedrooms,
    actualBathrooms,
    actualBalconies,
    floorNumber,
    totalFloors,
    propertyCondition = "good",
    negotiablePriceMin,
    staffChecklistRemarks,
    verificationNotes,
  } = req.body;

  const lead = await PropertyLead.findOne({ _id: id, isDeleted: false });
  if (!lead) throw new ApiError(404, "Property lead not found");

  lead.status = "verified";
  lead.verifiedBy = req.user._id;
  lead.verifiedStaffName = req.user.name;
  lead.verifiedAt = new Date();
  lead.verificationNotes =
    verificationNotes ||
    staffChecklistRemarks ||
    "Physically inspected and verified on-site.";

  lead.inspectionDetails = {
    physicalVisitDone: Boolean(physicalVisitDone),
    ownershipDocsVerified: Boolean(ownershipDocsVerified),
    electricityBillChecked: Boolean(electricityBillChecked),
    keysAvailable: Boolean(keysAvailable),
    actualCarpetAreaSqFt:
      Number(actualCarpetAreaSqFt) ||
      lead.inspectionDetails?.actualCarpetAreaSqFt,
    actualBedrooms:
      Number(actualBedrooms) || lead.inspectionDetails?.actualBedrooms,
    actualBathrooms:
      Number(actualBathrooms) || lead.inspectionDetails?.actualBathrooms,
    actualBalconies:
      Number(actualBalconies) || lead.inspectionDetails?.actualBalconies,
    floorNumber: Number(floorNumber) || lead.inspectionDetails?.floorNumber,
    totalFloors: Number(totalFloors) || lead.inspectionDetails?.totalFloors,
    propertyCondition: propertyCondition || "good",
    negotiablePriceMin: Number(negotiablePriceMin) || lead.expectedPrice,
    verifiedAt: new Date(),
    staffChecklistRemarks: staffChecklistRemarks || verificationNotes,
  };

  // Ensure commission strictly remains 0 until tenant registration & 1st month rent
  if (!lead.commission) lead.commission = {};
  lead.commission.approvedAmount = 0;
  lead.commission.status = "pending";
  lead.commission.recurringCommissions = [];

  await lead.save();

  // ⚡ Persist Notification in DB & Real-Time Socket Push
  try {
    const propertyTitle = lead.title || lead.locality || lead.propertyDetails?.address?.city || lead.leadId || 'Property';
    const agentRecipient = lead.agent || lead.createdBy;
    if (agentRecipient) {
      await createAndSendNotification({
        recipient: agentRecipient,
        recipientRole: 'field_agent',
        sender: req.user._id,
        senderName: req.user.name,
        title: 'Property Verified & Listed Live 📋',
        message: `Your property "${propertyTitle}" in ${lead.locality || lead.city || 'Location'} has been verified on-site. Commission activates when a tenant is registered and 1st month rent is paid.`,
        type: 'lead_verified',
        priority: 'medium',
        leadId: lead._id,
        propertyId: lead.propertyId || lead.leadId,
        data: { lead },
      });
      emitToUser(agentRecipient.toString(), 'lead:verified', { lead });
    }

    emitToRole('verification_staff', 'lead:updated', lead);
    emitToRole('admin', 'lead:updated', lead);
    emitToRole('super_admin', 'lead:updated', lead);
  } catch (socketErr) {
    console.error('Notification / Socket error in verifyLeadByStaff:', socketErr);
  }

  return res.json(
    new ApiResponse(
      200,
      lead,
      `Property lead ${lead.leadId || lead._id} successfully verified by ${req.user.name}!`,
    ),
  );
};

/**
 * DELETE /api/v1/leads/:id
 * @desc Field Staff / Admin deletes lead — MANDATORY REASON REQUIRED!
 */
const deleteLeadWithReason = async (req, res) => {
  const { id } = req.params;
  const { reason, remarks } = req.body;

  const deletionReason = (reason || remarks)?.trim();

  // Mandatory deletion reason check (auto-defaulted for super_admin / admin)
  if (!deletionReason) {
    if (["super_admin", "admin"].includes(req.user.role)) {
      deletionReason = `Deleted by Super Admin (${req.user.name || "Super Admin"})`;
    } else {
      throw new ApiError(
        400,
        "Mandatory deletion reason is required. Please provide a clear reason for deleting this property lead.",
      );
    }
  }

  const lead = await PropertyLead.findOne({ _id: id, isDeleted: false });
  if (!lead) throw new ApiError(404, "Property lead not found");

  // If field agent is deleting, must be own unverified lead
  if (req.user.role === "field_agent") {
    if (lead.agent.toString() !== req.user._id.toString()) {
      throw new ApiError(403, "You can only delete your own submitted leads");
    }
    if (lead.status !== "new") {
      throw new ApiError(
        400,
        "Cannot delete a lead that is already assigned or verified",
      );
    }
  }

  // Soft delete with full audit trail
  lead.isDeleted = true;
  lead.deletedAt = new Date();
  lead.deletedBy = req.user._id;
  lead.deletedByRole = req.user.role;
  lead.deletionReason = deletionReason;
  lead.status = "cancelled";

  await lead.save();

  return res.json(
    new ApiResponse(
      200,
      {
        id: lead._id,
        leadId: lead.leadId,
        deletionReason,
        deletedAt: lead.deletedAt,
      },
      `Property lead successfully deleted. Reason logged: "${deletionReason}"`,
    ),
  );
};

// ── 4. SUPER ADMIN ONLY: Commission Decision & Approval ────────────────────────

/**
 * PATCH /api/v1/leads/:id/commission
 * @desc SUPER_ADMIN ONLY: Decides, approves, and finalizes commission for the lead
 */
const decideCommissionSuperAdmin = async (req, res) => {
  // Strict role check: ONLY super_admin can decide commission
  if (req.user.role !== "super_admin") {
    throw new ApiError(
      403,
      "Access Denied: Only SUPER_ADMIN has authority to decide, approve, or disburse commission.",
    );
  }

  const { id } = req.params;
  const {
    approvedAmount,
    firstMonthCommission,
    recurringMonthlyRate,
    recurringMonthlyCommission,
    percentage,
    status = "approved",
    remarks,
    payoutTransactionId,
  } = req.body;

  const lead = await PropertyLead.findOne({ _id: id, isDeleted: false });
  if (!lead) throw new ApiError(404, "Property lead not found");

  const finalApprovedAmount = Number(approvedAmount !== undefined ? approvedAmount : lead.commission?.approvedAmount);
  if (isNaN(finalApprovedAmount) || finalApprovedAmount < 0) {
    throw new ApiError(
      400,
      "Approved commission amount must be a valid non-negative number",
    );
  }

  lead.commission = {
    estimatedAmount: lead.commission?.estimatedAmount || 0,
    approvedAmount: finalApprovedAmount,
    firstMonthCommission: firstMonthCommission !== undefined ? Number(firstMonthCommission) : (lead.commission?.firstMonthCommission || 0),
    recurringMonthlyRate: recurringMonthlyRate !== undefined ? Number(recurringMonthlyRate) : (lead.commission?.recurringMonthlyRate || 5),
    recurringMonthlyCommission: recurringMonthlyCommission !== undefined ? Number(recurringMonthlyCommission) : (lead.commission?.recurringMonthlyCommission || 0),
    percentage: percentage !== undefined ? Number(percentage) : (lead.commission?.percentage || 0),
    recurringCommissions: lead.commission?.recurringCommissions || [],
    status: status, // 'approved' | 'paid' | 'rejected'
    decidedBy: req.user._id,
    decidedByName: req.user.name,
    decidedAt: new Date(),
    paidAt: status === "paid" ? new Date() : lead.commission?.paidAt,
    payoutTransactionId:
      payoutTransactionId?.trim() || lead.commission?.payoutTransactionId,
    remarks: remarks?.trim() || "Approved by SuperAdmin",
  };

  await lead.save();

  return res.json(
    new ApiResponse(
      200,
      lead,
      `Commission of ₹${finalApprovedAmount} for lead ${lead.leadId || lead._id} finalized and marked as '${status}' by SuperAdmin ${req.user.name}`,
    ),
  );
};

// ── 5. SUPER ADMIN: Duplicate Review, Deal Booking, Rent Ledger, Analytics & Settings ──

/**
 * GET /api/v1/leads/admin/duplicates
 * @desc SUPER ADMIN: List all duplicate flagged leads
 */
const getDuplicateLeads = async (req, res) => {
  const duplicates = await PropertyLead.find({
    isDeleted: false,
    "duplicateFlag.isDuplicate": true,
  })
    .populate("agent", "name phone staffId role")
    .populate(
      "duplicateFlag.duplicateOf",
      "leadId title ownerName ownerPhone locality expectedPrice photos agent createdAt",
    )
    .sort({ createdAt: -1 });

  return res.json(
    new ApiResponse(200, duplicates, "Duplicate leads retrieved"),
  );
};

/**
 * PATCH /api/v1/leads/:id/resolve-duplicate
 * @desc SUPER ADMIN: Resolve duplicate listing flag
 */
const resolveDuplicateLead = async (req, res) => {
  const { id } = req.params;
  const { action = "resolve", notes = "Resolved by SuperAdmin" } = req.body;

  const lead = await PropertyLead.findOne({ _id: id, isDeleted: false });
  if (!lead) throw new ApiError(404, "Lead not found");

  if (action === "archive") {
    lead.isDeleted = true;
    lead.deletedAt = new Date();
    lead.deletedBy = req.user._id;
    lead.deletedByRole = "super_admin";
    lead.deletionReason = `Archived as duplicate: ${notes}`;
    lead.duplicateFlag.status = "resolved";
  } else if (action === "dismiss") {
    lead.duplicateFlag.status = "dismissed";
    lead.duplicateFlag.isDuplicate = false;
  } else {
    lead.duplicateFlag.status = "resolved";
  }

  lead.duplicateFlag.resolvedBy = req.user._id;
  lead.duplicateFlag.resolvedAt = new Date();
  lead.duplicateFlag.resolutionNotes = notes;

  await lead.save();
  return res.json(
    new ApiResponse(
      200,
      lead,
      `Duplicate flag marked as '${lead.duplicateFlag.status}'`,
    ),
  );
};

/**
 * PATCH /api/v1/leads/:id/deal
 * @desc SUPER ADMIN: Confirm deal, mark rented/sold, generate agreement & rent ledger
 */
const confirmDeal = async (req, res) => {
  const { id } = req.params;
  const {
    dealType = "rent",
    finalPrice,
    deposit,
    tenantName,
    tenantPhone,
    tenantAadhaarLast4,
    leaseStartDate,
    leaseDurationMonths = 11,
    agreementNumber,
    policeVerificationStatus = "pending",
    notes,
  } = req.body;

  const lead = await PropertyLead.findOne({ _id: id, isDeleted: false });
  if (!lead) throw new ApiError(404, "Property lead not found");

  const price = Number(finalPrice) || lead.expectedPrice;
  const newStatus = dealType.toLowerCase() === "sale" ? "sold" : "rented";

  lead.status = newStatus;
  lead.deal = {
    isClosed: true,
    dealType: dealType.toLowerCase(),
    finalPrice: price,
    deposit: Number(deposit) || lead.securityDeposit || 0,
    tenantName: tenantName?.trim() || "Direct Tenant",
    tenantPhone: tenantPhone ? String(tenantPhone).replace(/\D/g, "") : "",
    tenantAadhaarLast4: tenantAadhaarLast4
      ? String(tenantAadhaarLast4).slice(-4)
      : "",
    leaseStartDate: leaseStartDate ? new Date(leaseStartDate) : new Date(),
    leaseDurationMonths: Number(leaseDurationMonths) || 11,
    agreementNumber:
      agreementNumber?.trim() || `AGR-${Date.now().toString().slice(-6)}`,
    agreementGenerated: true,
    policeVerificationStatus: policeVerificationStatus || "pending",
    policeVerificationDate: new Date(),
    closedAt: new Date(),
    closedBy: req.user._id,
    notes: notes?.trim(),
  };

  // Seed initial rent ledger if rented
  if (
    newStatus === "rented" &&
    (!lead.rentLedger || lead.rentLedger.length === 0)
  ) {
    const currentMonth = new Date().toLocaleString("default", {
      month: "short",
      year: "numeric",
    });
    lead.rentLedger = [
      {
        month: currentMonth,
        amount: price,
        dueDate: new Date(),
        paidDate: new Date(),
        status: "PAID",
        paymentMode: "UPI",
        utrNumber: `TXN-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        resolved: true,
        recordedBy: req.user._id,
      },
    ];

    // Seed owner payout entry
    lead.ownerPayouts = [
      {
        amount: Math.round(price * 0.95),
        month: currentMonth,
        dueDate: new Date(),
        payoutDate: new Date(),
        status: "pending",
        paymentMode: "UPI",
        remarks: "1st Month Rent Payout queued for owner release",
        approvedBy: req.user._id,
        approvedAt: new Date(),
      },
    ];
  }

  // ── Calculate Initial 1st-Month Commission & Seed Recurring Commission Tracker ──
  const isSale = newStatus === "sold";
  const firstMonthCommission = isSale
    ? Math.max(10000, Math.round(price * 0.005))
    : (lead.commission?.firstMonthCommission > 0
        ? lead.commission.firstMonthCommission
        : Math.max(2000, Math.round(price * ((lead.commission?.percentage || 15) / 100))));

  const recurringMonthlyAmt = isSale
    ? 0
    : (lead.commission?.recurringMonthlyCommission > 0
        ? lead.commission.recurringMonthlyCommission
        : Math.round(price * ((lead.commission?.recurringMonthlyRate || 5) / 100)));

  if (!lead.commission) lead.commission = {};
  lead.commission.firstMonthCommission = firstMonthCommission;
  lead.commission.recurringMonthlyCommission = recurringMonthlyAmt;
  lead.commission.recurringMonthlyRate = lead.commission.recurringMonthlyRate || (isSale ? 0 : 5);
  lead.commission.approvedAmount = firstMonthCommission;
  lead.commission.status = "approved";
  lead.commission.decidedBy = req.user._id;
  lead.commission.decidedByName = req.user.name;
  lead.commission.decidedAt = new Date();

  if (!lead.commission.recurringCommissions) lead.commission.recurringCommissions = [];
  const currentMonthStr = new Date().toLocaleString("default", {
    month: "short",
    year: "numeric",
  });

  const existingFirstMonthLog = lead.commission.recurringCommissions.find(
    (c) => c.type === "first_month" && c.month === currentMonthStr
  );
  if (!existingFirstMonthLog) {
    lead.commission.recurringCommissions.push({
      month: currentMonthStr,
      rentAmount: price,
      commissionAmount: firstMonthCommission,
      type: "first_month",
      status: "approved",
      paidAt: new Date(),
      rentLedgerIndex: 0,
      createdAt: new Date(),
    });
  }

  await lead.save();

  // ⚡ Notify Field Agent about Tenant Registration & Earned Commission
  try {
    const agentRecipient = lead.agent || lead.createdBy;
    if (agentRecipient) {
      const propertyTitle = lead.title || lead.locality || lead.propertyDetails?.address?.city || lead.leadId || "Property";
      const notifMsg = isSale
        ? `Property "${propertyTitle}" sold! Initial commission of ₹${firstMonthCommission.toLocaleString("en-IN")} credited to your wallet.`
        : `Tenant successfully registered for "${propertyTitle}"! Initial commission of ₹${firstMonthCommission.toLocaleString("en-IN")} credited to your wallet + ₹${recurringMonthlyAmt.toLocaleString("en-IN")}/mo recurring commission active.`;

      const notif = await createAndSendNotification({
        recipient: agentRecipient,
        recipientRole: "field_agent",
        sender: req.user._id,
        senderName: req.user.name,
        title: isSale ? "Property Deal Closed! 🎉" : "Tenant Registered — Commission Unlocked! 🔑",
        message: notifMsg,
        type: "deal_closed",
        priority: "high",
        leadId: lead._id,
        propertyId: lead.propertyId || lead.leadId,
        data: { lead },
      });

      emitToUser(agentRecipient.toString(), "lead:deal_closed", { lead, notification: notif });
    }

    emitToRole("super_admin", "lead:deal_closed", { lead });
    emitToRole("admin", "lead:deal_closed", { lead });
  } catch (socketErr) {
    console.error("Socket/Notification emission error in confirmDeal:", socketErr);
  }

  return res.json(
    new ApiResponse(
      200,
      lead,
      `Deal successfully finalized and marked as '${newStatus.toUpperCase()}'!`,
    ),
  );
};

/**
 * GET /api/v1/leads/admin/rent-ledger
 * @desc SUPER ADMIN: Universal Rent Ledger
 */
const getAdminRentLedger = async (req, res) => {
  const leads = await PropertyLead.find({
    isDeleted: false,
    $or: [{ status: "rented" }, { "deal.isClosed": true }],
  })
    .populate("agent", "name phone staffId")
    .sort({ updatedAt: -1 });

  return res.json(new ApiResponse(200, leads, "Rent ledger retrieved"));
};

/**
 * PATCH /api/v1/leads/:id/rent-ledger
 * @desc SUPER ADMIN: Update single rent ledger entry or resolve dispute
 */
const updateRentLedgerEntry = async (req, res) => {
  const { id } = req.params;
  const {
    ledgerIndex = 0,
    status,
    paymentMode,
    utrNumber,
    disputeNote,
    resolved,
  } = req.body;

  const lead = await PropertyLead.findOne({ _id: id, isDeleted: false });
  if (!lead) throw new ApiError(404, "Property lead not found");

  if (lead.rentLedger && lead.rentLedger[ledgerIndex]) {
    if (status) lead.rentLedger[ledgerIndex].status = status;
    if (paymentMode) lead.rentLedger[ledgerIndex].paymentMode = paymentMode;
    if (utrNumber) lead.rentLedger[ledgerIndex].utrNumber = utrNumber;
    if (disputeNote !== undefined)
      lead.rentLedger[ledgerIndex].disputeNote = disputeNote;
    if (resolved !== undefined)
      lead.rentLedger[ledgerIndex].resolved = resolved;
    if (status === "PAID") {
      lead.rentLedger[ledgerIndex].paidDate = new Date();
      lead.rentLedger[ledgerIndex].resolved = true;

      // Credit recurring commission if not already credited for this month
      const entryMonth = lead.rentLedger[ledgerIndex].month;
      const rentAmt = lead.rentLedger[ledgerIndex].amount || lead.deal?.finalPrice || lead.expectedPrice || 0;

      if (!lead.commission) lead.commission = {};
      if (!lead.commission.recurringCommissions) lead.commission.recurringCommissions = [];

      const alreadyCredited = lead.commission.recurringCommissions.some(
        (c) => c.month === entryMonth && (c.type === "monthly_recurring" || c.type === "first_month")
      );

      if (!alreadyCredited) {
        const recurringRate = lead.commission.recurringMonthlyRate || 5;
        const recurringAmount = Math.round(rentAmt * (recurringRate / 100));

        lead.commission.recurringCommissions.push({
          month: entryMonth,
          rentAmount: rentAmt,
          commissionAmount: recurringAmount,
          type: "monthly_recurring",
          status: "approved",
          paidAt: new Date(),
          rentLedgerIndex: ledgerIndex,
          createdAt: new Date(),
        });

        lead.commission.recurringMonthlyCommission = recurringAmount;
        lead.commission.approvedAmount = lead.commission.recurringCommissions.reduce(
          (sum, item) => sum + (item.status === "approved" || item.status === "paid" ? item.commissionAmount : 0),
          0
        );
        lead.commission.status = "approved";

        // Notify agent
        try {
          const agentRecipient = lead.agent || lead.createdBy;
          if (agentRecipient) {
            const propertyTitle = lead.title || lead.locality || "Property";
            createAndSendNotification({
              recipient: agentRecipient,
              recipientRole: "field_agent",
              sender: req.user._id,
              senderName: req.user.name,
              title: "Recurring Monthly Commission! 💰",
              message: `Tenant paid rent for ${entryMonth}. ₹${recurringAmount.toLocaleString("en-IN")} recurring commission added to your wallet for "${propertyTitle}".`,
              type: "payout",
              priority: "high",
              leadId: lead._id,
              data: { lead },
            }).then((notif) => {
              emitToUser(agentRecipient.toString(), "commission:recurring_credited", { lead, notification: notif });
            }).catch(() => {});
          }
        } catch {}
      }
    }
  }

  await lead.save();
  return res.json(
    new ApiResponse(200, lead, "Rent ledger updated successfully"),
  );
};

/**
 * GET /api/v1/leads/admin/payouts
 * @desc SUPER ADMIN: List agent commissions and owner payouts
 */
const getAdminPayouts = async (req, res) => {
  const agentCommissions = await PropertyLead.find({
    isDeleted: false,
    "commission.estimatedAmount": { $gt: 0 },
  })
    .populate(
      "agent",
      "name phone staffId role upiId bankDetails commissionWallet",
    )
    .select(
      "leadId title expectedPrice locality status commission agent createdAt",
    )
    .sort({ createdAt: -1 });

  const ownerPayoutLeads = await PropertyLead.find({
    isDeleted: false,
    "ownerPayouts.0": { $exists: true },
  })
    .select(
      "leadId title ownerName ownerPhone locality expectedPrice deal ownerPayouts",
    )
    .sort({ updatedAt: -1 });

  return res.json(
    new ApiResponse(
      200,
      {
        agentCommissions,
        ownerPayouts: ownerPayoutLeads,
      },
      "Admin payouts list retrieved",
    ),
  );
};

/**
 * PATCH /api/v1/leads/:id/owner-payout
 * @desc SUPER ADMIN: Approve/release owner rent payout
 */
const processOwnerPayout = async (req, res) => {
  const { id } = req.params;
  const {
    payoutIndex = 0,
    status = "released",
    utrNumber,
    paymentMode = "UPI",
    remarks,
  } = req.body;

  const lead = await PropertyLead.findOne({ _id: id, isDeleted: false });
  if (!lead) throw new ApiError(404, "Property lead not found");

  if (lead.ownerPayouts && lead.ownerPayouts[payoutIndex]) {
    lead.ownerPayouts[payoutIndex].status = status;
    if (utrNumber) lead.ownerPayouts[payoutIndex].utrNumber = utrNumber;
    if (paymentMode) lead.ownerPayouts[payoutIndex].paymentMode = paymentMode;
    if (remarks) lead.ownerPayouts[payoutIndex].remarks = remarks;
    lead.ownerPayouts[payoutIndex].payoutDate = new Date();
    lead.ownerPayouts[payoutIndex].approvedBy = req.user._id;
    lead.ownerPayouts[payoutIndex].approvedAt = new Date();
  }

  await lead.save();
  return res.json(
    new ApiResponse(200, lead, `Owner payout marked as '${status}'`),
  );
};

/**
 * GET /api/v1/leads/admin/analytics
 * @desc SUPER ADMIN: Hyperlocal metrics, leaderboard, inventory breakdown
 */
const getAdminAnalytics = async (req, res) => {
  const [
    totalProperties,
    newLeads,
    underVerification,
    verified,
    rented,
    sold,
    rejected,
    duplicateCount,
    localityStats,
    leaderboard,
  ] = await Promise.all([
    PropertyLead.countDocuments({ isDeleted: false }),
    PropertyLead.countDocuments({ isDeleted: false, status: "new" }),
    PropertyLead.countDocuments({
      isDeleted: false,
      status: { $in: ["assigned", "under_verification"] },
    }),
    PropertyLead.countDocuments({ isDeleted: false, status: "verified" }),
    PropertyLead.countDocuments({ isDeleted: false, status: "rented" }),
    PropertyLead.countDocuments({ isDeleted: false, status: "sold" }),
    PropertyLead.countDocuments({ isDeleted: false, status: "rejected" }),
    PropertyLead.countDocuments({
      isDeleted: false,
      "duplicateFlag.isDuplicate": true,
    }),
    PropertyLead.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: "$locality",
          total: { $sum: 1 },
          verified: {
            $sum: { $cond: [{ $eq: ["$status", "verified"] }, 1, 0] },
          },
          closed: {
            $sum: { $cond: [{ $in: ["$status", ["rented", "sold"]] }, 1, 0] },
          },
          revenue: { $sum: "$expectedPrice" },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]),
    PropertyLead.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: "$agent",
          agentName: { $first: "$agentName" },
          agentPhone: { $first: "$agentPhone" },
          totalSubmissions: { $sum: 1 },
          verifiedCount: {
            $sum: { $cond: [{ $eq: ["$status", "verified"] }, 1, 0] },
          },
          dealsClosed: {
            $sum: { $cond: [{ $in: ["$status", ["rented", "sold"]] }, 1, 0] },
          },
          commissionEarned: { $sum: "$commission.approvedAmount" },
        },
      },
      { $sort: { totalSubmissions: -1 } },
      { $limit: 10 },
    ]),
  ]);

  return res.json(
    new ApiResponse(
      200,
      {
        totalProperties,
        statusBreakdown: {
          new: newLeads,
          underVerification,
          verified,
          rented,
          sold,
          rejected,
          duplicates: duplicateCount,
        },
        localityStats,
        leaderboard,
      },
      "SuperAdmin system analytics retrieved",
    ),
  );
};

/**
 * GET /api/v1/leads/admin/settings
 * @desc SUPER ADMIN: Get automation settings
 */
const getAdminSettings = async (req, res) => {
  let settings = await AdminSetting.findOne({ key: "system_settings" });
  if (!settings) {
    settings = await AdminSetting.create({ key: "system_settings" });
  }
  return res.json(new ApiResponse(200, settings, "System settings retrieved"));
};

/**
 * PUT /api/v1/leads/admin/settings
 * @desc SUPER ADMIN: Update automation settings
 */
const updateAdminSettings = async (req, res) => {
  const allowed = [
    "whatsappReminderDays",
    "overdueReminderDays",
    "inspectionCycleHours",
    "defaultAgentCommissionRentPct",
    "defaultAgentRecurringCommissionRentPct",
    "defaultAgentCommissionSalePct",
    "defaultDealerCommissionRentPct",
    "autoBirthdayWishes",
    "autoPoliceVerificationReminder",
    "duplicateAadhaarCheck",
    "duplicatePhoneCheck",
  ];

  const update = { updatedBy: req.user._id };
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) {
      update[field] = req.body[field];
    }
  });

  const settings = await AdminSetting.findOneAndUpdate(
    { key: "system_settings" },
    { $set: update },
    { new: true, upsert: true },
  );

  return res.json(
    new ApiResponse(200, settings, "Automation settings updated successfully"),
  );
};

// ── Export all controller methods ──────────────────────────────────────────────

/**
 * POST /api/v1/leads/:id/rent-ledger
 * @desc SUPER ADMIN: Record new tenant rent collection entry
 */
const addRentLedgerEntry = async (req, res) => {
  const { id } = req.params;
  const {
    month,
    amount,
    dueDate,
    paidDate,
    status = "PAID",
    paymentMode = "UPI",
    utrNumber,
    disputeNote,
  } = req.body;

  const lead = await PropertyLead.findOne({ _id: id, isDeleted: false });
  if (!lead) throw new ApiError(404, "Property lead not found");

  const entryMonth =
    month ||
    new Date().toLocaleString("default", { month: "short", year: "numeric" });
  const entryRentAmount =
    Number(amount) || lead.deal?.finalPrice || lead.expectedPrice || 0;

  if (!lead.rentLedger) lead.rentLedger = [];
  lead.rentLedger.unshift({
    month: entryMonth,
    amount: entryRentAmount,
    dueDate: dueDate ? new Date(dueDate) : new Date(),
    paidDate:
      status === "PAID"
        ? paidDate
          ? new Date(paidDate)
          : new Date()
        : undefined,
    status,
    paymentMode,
    utrNumber:
      utrNumber ||
      (status === "PAID"
        ? `TXN-${Math.random().toString(36).substring(2, 9).toUpperCase()}`
        : undefined),
    disputeNote,
    resolved: status === "PAID",
    recordedBy: req.user._id,
  });

  // ── Auto-Credit Recurring Monthly Commission to Field Agent on Rent Collection ──
  if (status === "PAID" && (lead.status === "rented" || lead.deal?.isClosed)) {
    if (!lead.commission) lead.commission = {};
    if (!lead.commission.recurringCommissions) lead.commission.recurringCommissions = [];

    const alreadyCredited = lead.commission.recurringCommissions.some(
      (c) => c.month === entryMonth && (c.type === "monthly_recurring" || c.type === "first_month")
    );

    if (!alreadyCredited) {
      const recurringRate = lead.commission.recurringMonthlyRate || 5;
      const recurringAmount = Math.round(entryRentAmount * (recurringRate / 100));

      lead.commission.recurringCommissions.push({
        month: entryMonth,
        rentAmount: entryRentAmount,
        commissionAmount: recurringAmount,
        type: "monthly_recurring",
        status: "approved",
        paidAt: new Date(),
        rentLedgerIndex: 0,
        createdAt: new Date(),
      });

      lead.commission.recurringMonthlyCommission = recurringAmount;
      lead.commission.approvedAmount = lead.commission.recurringCommissions.reduce(
        (sum, item) => sum + (item.status === "approved" || item.status === "paid" ? item.commissionAmount : 0),
        0
      );
      lead.commission.status = "approved";

      // ⚡ Send Real-Time Push & Socket to Field Agent
      try {
        const agentRecipient = lead.agent || lead.createdBy;
        if (agentRecipient) {
          const propertyTitle = lead.title || lead.locality || lead.propertyDetails?.address?.city || lead.leadId || "Property";
          const notif = await createAndSendNotification({
            recipient: agentRecipient,
            recipientRole: "field_agent",
            sender: req.user._id,
            senderName: req.user.name,
            title: "Recurring Monthly Commission! 💰",
            message: `Tenant paid rent for ${entryMonth}. ₹${recurringAmount.toLocaleString("en-IN")} recurring commission added to your wallet for "${propertyTitle}".`,
            type: "payout",
            priority: "high",
            leadId: lead._id,
            propertyId: lead.propertyId || lead.leadId,
            data: { lead },
          });

          emitToUser(agentRecipient.toString(), "commission:recurring_credited", { lead, notification: notif });
        }
      } catch (notifErr) {
        console.error("Notification error in addRentLedgerEntry:", notifErr);
      }
    }
  }

  await lead.save();
  return res.json(
    new ApiResponse(200, lead, "Tenant rent collection recorded and commission credited successfully"),
  );
};

/**
 * POST /api/v1/leads/:id/owner-payout
 * @desc SUPER ADMIN: Record / Release new owner rent payout entry
 */
const addOwnerPayoutEntry = async (req, res) => {
  const { id } = req.params;
  const {
    month,
    amount,
    status = "released",
    paymentMode = "UPI",
    utrNumber,
    remarks,
  } = req.body;

  const lead = await PropertyLead.findOne({ _id: id, isDeleted: false });
  if (!lead) throw new ApiError(404, "Property lead not found");

  const defaultAmt = Math.round(
    (lead.deal?.finalPrice || lead.expectedPrice || 0) * 0.95,
  );
  if (!lead.ownerPayouts) lead.ownerPayouts = [];
  lead.ownerPayouts.unshift({
    month:
      month ||
      new Date().toLocaleString("default", { month: "short", year: "numeric" }),
    amount: Number(amount) || defaultAmt,
    dueDate: new Date(),
    payoutDate: new Date(),
    status,
    paymentMode,
    utrNumber:
      utrNumber ||
      (status === "released"
        ? `UTR-${Math.random().toString(36).substring(2, 9).toUpperCase()}`
        : undefined),
    remarks: remarks || "Rent payout released to property owner",
    approvedBy: req.user._id,
    approvedAt: new Date(),
  });

  await lead.save();
  return res.json(
    new ApiResponse(200, lead, `Owner rent payout recorded as '${status}'`),
  );
};


/**
 * GET /api/v1/leads/check-aadhaar
 * @desc Real-time duplicate Aadhaar last-4 digits check
 */
const checkDuplicateAadhaar = async (req, res) => {
  const { last4, excludeId } = req.query;
  if (!last4 || String(last4).trim().length < 4) {
    return res.json(new ApiResponse(200, { isDuplicate: false }, 'Valid Aadhaar input'));
  }
  const clean = String(last4).trim().slice(-4);
  const query = {
    ownerAadhaarLast4: clean,
    isDeleted: false,
  };
  if (excludeId) query._id = { $ne: excludeId };

  const match = await PropertyLead.findOne(query).select('leadId ownerName locality propertyType createdAt');

  if (match) {
    return res.json(new ApiResponse(200, {
      isDuplicate: true,
      matchedLead: match,
      warningMessage: `Aadhaar ending in ${clean} is already registered with Lead ${match.leadId || match._id} (${match.ownerName} - ${match.locality})`
    }, 'Duplicate Aadhaar detected'));
  }

  return res.json(new ApiResponse(200, { isDuplicate: false }, 'No duplicate Aadhaar found'));
};

/**
 * POST /api/v1/leads/:id/publish-inspection
 * @desc Verification Staff publishes listing after 2-step review & locks record
 */
const publishInspectionLead = async (req, res) => {
  const { id } = req.params;
  const {
    actualCarpetAreaSqFt,
    actualBedrooms,
    actualBathrooms,
    actualBalconies,
    floorNumber,
    totalFloors,
    propertyCondition = 'good',
    negotiablePriceMin,
    keysAvailable = true,
    physicalVisitDone = true,
    ownershipDocsVerified = true,
    electricityBillChecked = true,
    staffChecklistRemarks,
    ownerAadhaarLast4,
    ownerPanCard,
    photos = [],
  } = req.body;

  const lead = await PropertyLead.findOne({ _id: id, isDeleted: false });
  if (!lead) throw new ApiError(404, 'Property lead not found');

  lead.status = 'verified';
  lead.isLocked = true;
  lead.publishedAt = new Date();
  lead.publishedBy = req.user._id;
  lead.publishedByName = req.user.name;
  lead.verifiedBy = req.user._id;
  lead.verifiedStaffName = req.user.name;
  lead.verifiedAt = new Date();

  if (ownerAadhaarLast4) lead.ownerAadhaarLast4 = String(ownerAadhaarLast4).trim().slice(-4);
  if (ownerPanCard) lead.ownerPanCard = String(ownerPanCard).trim().toUpperCase();

  lead.inspectionDetails = {
    physicalVisitDone: Boolean(physicalVisitDone),
    ownershipDocsVerified: Boolean(ownershipDocsVerified),
    electricityBillChecked: Boolean(electricityBillChecked),
    keysAvailable: Boolean(keysAvailable),
    actualCarpetAreaSqFt: Number(actualCarpetAreaSqFt) || lead.inspectionDetails?.actualCarpetAreaSqFt,
    actualBedrooms: Number(actualBedrooms) || lead.inspectionDetails?.actualBedrooms,
    actualBathrooms: Number(actualBathrooms) || lead.inspectionDetails?.actualBathrooms,
    actualBalconies: Number(actualBalconies) || lead.inspectionDetails?.actualBalconies,
    floorNumber: Number(floorNumber) || lead.inspectionDetails?.floorNumber,
    totalFloors: Number(totalFloors) || lead.inspectionDetails?.totalFloors,
    propertyCondition,
    negotiablePriceMin: Number(negotiablePriceMin) || lead.expectedPrice,
    verifiedAt: new Date(),
    staffChecklistRemarks: staffChecklistRemarks || 'Inspected, KYC collected and published to internal system.',
  };

  if (Array.isArray(photos) && photos.length > 0) {
    lead.photos = photos.map((p, idx) => ({
      url: typeof p === 'string' ? p : p.url || p.uri,
      caption: typeof p === 'string' ? `Inspection Photo ${idx + 1}` : p.caption || `Inspection Photo ${idx + 1}`,
      isCover: idx === 0,
      uploadedBy: 'staff',
    }));
    lead.images = lead.photos.map(p => p.url);
    lead.coverPhoto = lead.photos[0].url;
  }

  // Schedule first 6-month routine inspection
  const sixMonthsFromNow = new Date();
  sixMonthsFromNow.setDate(sixMonthsFromNow.getDate() + 180);
  if (!lead.scheduledInspections) lead.scheduledInspections = [];
  lead.scheduledInspections.push({
    inspectionId: `INSP-${Date.now().toString().slice(-6)}`,
    scheduledDate: sixMonthsFromNow,
    status: 'scheduled',
    inspector: req.user._id,
    inspectorName: req.user.name,
    conditionScore: 'good',
    notes: 'Initial 6-month routine inspection auto-scheduled upon publishing.',
  });

  // Ensure commission remains 0 until tenant registration & 1st month rent
  if (!lead.commission) lead.commission = {};
  if (lead.deal?.isClosed !== true && lead.status !== 'rented' && lead.status !== 'sold') {
    lead.commission.approvedAmount = 0;
    lead.commission.status = 'pending';
    lead.recurringCommissions = [];
  }

  await lead.save();

  try {
    const propertyTitle = lead.title || lead.locality || lead.propertyDetails?.address?.city || lead.leadId || 'Property';
    await createAndSendNotification({
      recipientRole: 'super_admin',
      sender: req.user._id,
      senderName: req.user.name,
      title: 'Property Published & Verified',
      message: `Listing "${propertyTitle}" in ${lead.locality || lead.city || 'Location'} has been physically verified & published.`,
      type: 'inspection_scheduled',
      priority: 'medium',
      leadId: lead._id,
      propertyId: lead.propertyId || lead.leadId,
      data: { lead },
    });

    const agentRecipient = lead.agent || lead.createdBy;
    if (agentRecipient) {
      await createAndSendNotification({
        recipient: agentRecipient,
        recipientRole: 'field_agent',
        sender: req.user._id,
        senderName: req.user.name,
        title: 'Listing Published Live 🚀',
        message: `Your property "${propertyTitle}" in ${lead.locality || lead.city || 'Location'} is published live. Commission activates upon tenant registration and 1st month rent payment.`,
        type: 'lead_verified',
        priority: 'medium',
        leadId: lead._id,
        propertyId: lead.propertyId || lead.leadId,
        data: { lead },
      });
      emitToUser(agentRecipient.toString(), 'lead:published', { lead });
    }

    emitToRole('admin', 'lead:published', { lead });
    emitToRole('super_admin', 'lead:published', { lead });
    emitToRole('verification_staff', 'lead:published', { lead });
  } catch (socketErr) {
    console.error('Socket/Notification emission error in publishInspectionLead:', socketErr);
  }

  return res.json(
    new ApiResponse(
      200,
      lead,
      `Listing ${lead.leadId || lead._id} successfully published and locked into internal system!`
    )
  );
};

/**
 * GET /api/v1/leads/my-inspections
 * @desc Get all 6-month scheduled and completed inspections for verification staff
 */
const getStaffInspections = async (req, res) => {
  const query = {
    isDeleted: false,
    $or: [
      { assignedTo: req.user._id },
      { verifiedBy: req.user._id },
      { 'scheduledInspections.inspector': req.user._id },
      { status: 'verified' },
      { status: 'rented' },
    ],
  };

  const leads = await PropertyLead.find(query)
    .select('leadId title propertyType locality address expectedPrice scheduledInspections status deal')
    .lean();

  const allInspections = [];
  leads.forEach((l) => {
    if (Array.isArray(l.scheduledInspections) && l.scheduledInspections.length > 0) {
      l.scheduledInspections.forEach((insp) => {
        allInspections.push({
          ...insp,
          propertyLeadId: l._id,
          leadTrackingId: l.leadId,
          title: l.title || `${l.propertyType} in ${l.locality}`,
          propertyType: l.propertyType,
          locality: l.locality,
          fullAddress: l.address?.fullAddress || l.locality,
          price: l.deal?.finalPrice || l.expectedPrice,
          tenantName: l.deal?.tenantName || 'Tenant Occupied',
        });
      });
    } else {
      // Create a default upcoming 6-month inspection entry if rented/verified
      const defaultDate = new Date(l.createdAt || Date.now());
      defaultDate.setDate(defaultDate.getDate() + 180);
      allInspections.push({
        inspectionId: `INSP-${(l.leadId || '000').slice(-4)}-AUTO`,
        scheduledDate: defaultDate,
        status: defaultDate < new Date() ? 'overdue' : 'scheduled',
        propertyLeadId: l._id,
        leadTrackingId: l.leadId,
        title: l.title || `${l.propertyType} in ${l.locality}`,
        propertyType: l.propertyType,
        locality: l.locality,
        fullAddress: l.address?.fullAddress || l.locality,
        price: l.deal?.finalPrice || l.expectedPrice,
        tenantName: l.deal?.tenantName || 'Tenant Occupied',
        inspectorName: req.user.name,
      });
    }
  });

  allInspections.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));

  return res.json(new ApiResponse(200, allInspections, 'Scheduled inspections retrieved'));
};

/**
 * POST /api/v1/leads/:id/inspection-report
 * @desc File a 6-month scheduled inspection report
 */
const addInspectionReport = async (req, res) => {
  const { id } = req.params;
  const {
    conditionScore = 'good',
    structuralCheck = true,
    electricalCheck = true,
    plumbingCheck = true,
    cleanlinessCheck = true,
    tenantFeedback,
    notes,
    photos = [],
  } = req.body;

  const lead = await PropertyLead.findOne({ _id: id, isDeleted: false });
  if (!lead) throw new ApiError(404, 'Property lead not found');

  if (!lead.scheduledInspections) lead.scheduledInspections = [];

  const newReport = {
    inspectionId: `INSP-${Date.now().toString().slice(-6)}`,
    scheduledDate: new Date(),
    completedDate: new Date(),
    status: 'completed',
    inspector: req.user._id,
    inspectorName: req.user.name,
    conditionScore,
    structuralCheck: Boolean(structuralCheck),
    electricalCheck: Boolean(electricalCheck),
    plumbingCheck: Boolean(plumbingCheck),
    cleanlinessCheck: Boolean(cleanlinessCheck),
    tenantFeedback,
    notes: notes || '6-Month on-site inspection completed.',
    photos: Array.isArray(photos) ? photos : [],
  };

  lead.scheduledInspections.unshift(newReport);
  await lead.save();

  return res.json(new ApiResponse(200, newReport, '6-Month Inspection report submitted successfully'));
};

/**
 * GET /api/v1/leads/complaints
 * @desc Get all complaints & room change requests for verification staff
 */
const getStaffComplaints = async (req, res) => {
  const query = {
    isDeleted: false,
  };

  const leads = await PropertyLead.find(query)
    .select('leadId title propertyType locality address complaints deal ownerName')
    .lean();

  const allTickets = [];
  leads.forEach((l) => {
    (l.complaints || []).forEach((ticket) => {
      allTickets.push({
        ...ticket,
        propertyLeadId: l._id,
        leadTrackingId: l.leadId,
        titleProperty: l.title || `${l.propertyType} in ${l.locality}`,
        locality: l.locality,
      });
    });
  });

  allTickets.sort((a, b) => new Date(b.createdAt || Date.now()) - new Date(a.createdAt || Date.now()));
  return res.json(new ApiResponse(200, allTickets, 'Complaints and room change requests retrieved'));
};

/**
 * POST /api/v1/leads/complaints
 * @desc Log a new complaint or room-change ticket
 */
const createComplaintTicket = async (req, res) => {
  const {
    propertyId,
    title,
    description,
    category = 'other',
    priority = 'medium',
    raisedByRole = 'tenant',
    raisedByName,
    tenantPhone,
    photos = [],
  } = req.body;

  const lead = await PropertyLead.findOne({ _id: propertyId, isDeleted: false });
  if (!lead) throw new ApiError(404, 'Property not found');

  if (!lead.complaints) lead.complaints = [];
  const ticket = {
    ticketId: `TKT-${Date.now().toString().slice(-6)}`,
    category,
    title: title || `Issue reported: ${category}`,
    description: description || '',
    priority,
    status: 'open',
    raisedByRole,
    raisedByName: raisedByName || (raisedByRole === 'tenant' ? (lead.deal?.tenantName || 'Tenant') : (lead.ownerName || 'Owner')),
    tenantPhone: tenantPhone || lead.deal?.tenantPhone || lead.ownerPhone,
    assignedStaff: req.user._id,
    assignedStaffName: req.user.name,
    photos: Array.isArray(photos) ? photos : [],
    createdAt: new Date(),
  };

  lead.complaints.unshift(ticket);
  await lead.save();

  // ⚡ Persist Notification in DB & Real-Time Socket Push
  try {
    const isFraud = ['fake_scam', 'scam_alert', 'owner_fraud', 'misleading_media', 'invalid_address'].includes(category);
    const propertyTitle = lead.title || lead.locality || lead.propertyDetails?.address?.city || lead.leadId || 'Property';

    await createAndSendNotification({
      recipientRole: 'super_admin',
      sender: req.user._id,
      senderName: req.user.name,
      title: isFraud ? `🚨 SCAM/FRAUD REPORTED: ${propertyTitle}` : `Complaint Filed: ${ticket.title}`,
      message: `${req.user.name} reported: ${description || title || category} on property "${propertyTitle}".`,
      type: isFraud ? 'scam_alert' : 'complaint_logged',
      priority: isFraud ? 'urgent' : priority,
      leadId: lead._id,
      propertyId: lead.propertyId || lead.leadId,
      data: { lead, ticket, isFraud },
    });

    emitToRole('admin', 'complaint:created', { ticket, leadId: lead._id });
    emitToRole('super_admin', 'complaint:created', { ticket, leadId: lead._id });
  } catch (socketErr) {
    console.error('Socket/Notification emission error in createComplaintTicket:', socketErr);
  }

  return res.status(201).json(new ApiResponse(201, ticket, 'Complaint ticket logged successfully'));
};

/**
 * PATCH /api/v1/leads/:propertyId/complaints/:ticketId
 * @desc Update complaint status and add resolution remarks
 */
const updateComplaintStatus = async (req, res) => {
  const { propertyId, ticketId } = req.params;
  const { status = 'resolved', resolutionNotes } = req.body;

  const lead = await PropertyLead.findOne({ _id: propertyId, isDeleted: false });
  if (!lead) throw new ApiError(404, 'Property not found');

  const ticket = (lead.complaints || []).find(
    (t) => t.ticketId === ticketId || t._id?.toString() === ticketId
  );
  if (!ticket) throw new ApiError(404, 'Complaint ticket not found');

  if (status) ticket.status = status;
  if (resolutionNotes) ticket.resolutionNotes = resolutionNotes;
  if (status === 'resolved' || status === 'closed') ticket.resolvedAt = new Date();

  await lead.save();
  return res.json(new ApiResponse(200, ticket, `Complaint ticket updated to '${status}'`));
};



/**
 * POST /api/v1/leads/upload-media
 * @desc Uploads a single property media file (image/video) and returns accessible URL
 */
const uploadLeadMedia = async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "Please provide an image or video file to upload");
  }

  const filename = req.file.filename;
  const relativeUrl = `/uploads/properties/${filename}`;

  return res.json(
    new ApiResponse(
      200,
      {
        url: relativeUrl,
        filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        slot: req.body?.slot || 'photo',
      },
      "Property media uploaded successfully"
    )
  );
};

module.exports = {
  uploadLeadMedia,
  addRentLedgerEntry,
  addOwnerPayoutEntry,

  // Verification Staff Panel Methods
  checkDuplicateAadhaar,
  publishInspectionLead,
  getStaffInspections,
  addInspectionReport,
  getStaffComplaints,
  createComplaintTicket,
  updateComplaintStatus,

  // Field Agent Methods
  createPropertyLead,
  getMyLeads,
  getMyLeadStats,

  // Admin Methods
  getAllLeadsAdmin,
  assignLeadToStaff,

  // Field Staff & Common Inspection Methods
  getAssignedLeadsForStaff,
  getLeadById,
  updateLeadByStaff,
  verifyLeadByStaff,
  deleteLeadWithReason,

  // Super Admin Exclusive Methods
  decideCommissionSuperAdmin,
  getDuplicateLeads,
  resolveDuplicateLead,
  confirmDeal,
  getAdminRentLedger,
  updateRentLedgerEntry,
  getAdminPayouts,
  processOwnerPayout,
  getAdminAnalytics,
  getAdminSettings,
  updateAdminSettings,

  // Aliases for backwards compatibility
  updateMyLead: updateLeadByStaff,
  deleteMyLead: deleteLeadWithReason,
  updateLeadStatus: verifyLeadByStaff,
};
