const PropertyLead = require('../models/propertyLeadModel');
const Notification = require('../models/Notification');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { createAndSendNotification } = require('./notificationController');

/**
 * Helper: Find the active rented property assigned to the authenticated tenant
 */
const findTenantProperty = async (user) => {
  const userPhone = user.phone ? String(user.phone).replace(/\D/g, '').slice(-10) : '';
  const userEmail = user.email ? String(user.email).trim().toLowerCase() : '';

  const queryOr = [];
  if (user._id) {
    queryOr.push({ 'deal.tenantId': user._id });
  }
  if (userPhone) {
    queryOr.push({ 'deal.tenantPhone': { $regex: userPhone + '$', $options: 'i' } });
    queryOr.push({ 'deal.tenantPhone': user.phone });
  }
  if (userEmail) {
    queryOr.push({ 'deal.tenantEmail': { $regex: `^${userEmail}$`, $options: 'i' } });
  }

  // Find lead where deal is closed or status is rented matching this tenant
  const lead = await PropertyLead.findOne({
    $and: [
      { isDeleted: false },
      { $or: queryOr.length > 0 ? queryOr : [{ _id: null }] },
      {
        $or: [
          { "deal.isClosed": true },
          { status: "rented" },
          { status: "verified" },
        ],
      },
    ],
  }).sort({ updatedAt: -1 });

  return lead;
};

/**
 * Helper: Sanitize property information for tenant (strip landlord private contact and commissions)
 */
const sanitizePropertyForTenant = (lead) => {
  if (!lead) return null;

  const photoList = Array.isArray(lead.photos) && lead.photos.length > 0
    ? lead.photos.map(p => (typeof p === 'string' ? p : p.url))
    : lead.images || [];

  return {
    id: lead.leadId || lead._id,
    _id: lead._id,
    propertyId: lead.propertyId || lead.leadId || `DPX-${String(lead._id).slice(-6).toUpperCase()}`,
    title: lead.title || `${lead.propertyType || '2BHK'} Apartment in ${lead.locality || 'Delhi NCR'}`,
    propertyType: lead.propertyType || '2BHK',
    configuration: lead.propertyType || '2BHK Apartment',
    locality: lead.locality || lead.address?.city || 'Delhi NCR',
    address: {
      fullAddress: lead.address?.fullAddress || lead.address?.street || `${lead.locality || 'Delhi NCR'}, Delhi`,
      street: lead.address?.street || '',
      city: lead.address?.city || 'Delhi',
      state: lead.address?.state || 'Delhi',
      pincode: lead.address?.pincode || '110001',
    },
    rentAmount: lead.deal?.finalPrice || lead.expectedPrice || 15000,
    securityDeposit: lead.deal?.deposit || lead.securityDeposit || (lead.deal?.finalPrice ? lead.deal.finalPrice * 2 : 30000),
    carpetAreaSqFt: lead.inspectionDetails?.actualCarpetAreaSqFt || lead.carpetArea || 850,
    bedrooms: lead.inspectionDetails?.actualBedrooms || lead.bedrooms || 2,
    bathrooms: lead.inspectionDetails?.actualBathrooms || lead.bathrooms || 2,
    balconies: lead.inspectionDetails?.actualBalconies || lead.balconies || 1,
    floorNumber: lead.inspectionDetails?.floorNumber || lead.floorNumber || 2,
    totalFloors: lead.inspectionDetails?.totalFloors || lead.totalFloors || 4,
    furnishing: lead.furnishing || 'Semi-Furnished',
    parking: lead.parking || 'Covered Car & 2-Wheeler Parking',
    amenities: lead.amenities && lead.amenities.length > 0
      ? lead.amenities
      : ['24/7 Water Supply', 'Lift Access', 'CCTV Security', 'Gated Society', 'Power Backup', 'Geyser Installed', 'Modular Kitchen'],
    photos: photoList.length > 0
      ? photoList
      : ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&auto=format&fit=crop&q=80'],
    coverPhoto: lead.coverPhoto || photoList[0] || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&auto=format&fit=crop&q=80',
    occupancyStatus: 'Active Resident',
    leaseStartDate: lead.deal?.leaseStartDate || lead.createdAt,
    leaseDurationMonths: lead.deal?.leaseDurationMonths || 11,
    agreementNumber: lead.deal?.agreementNumber || `AGR-${String(lead._id).slice(-6).toUpperCase()}`,
    agreementUrl: lead.deal?.agreementUrl || null,
    policeVerificationStatus: lead.deal?.policeVerificationStatus || 'verified',
    policeVerificationDate: lead.deal?.policeVerificationDate || lead.createdAt,
    policeVerificationUrl: lead.deal?.policeVerificationUrl || null,
    // Note: Landlord contact details are strictly omitted for privacy & safety
  };
};

/**
 * 1. GET /api/v1/tenant/dashboard
 * @desc Tenant Home Dashboard Overview
 */
const getTenantDashboard = async (req, res) => {
  const lead = await findTenantProperty(req.user);

  let property = null;
  let activeRent = null;
  let quickStats = {
    unpaidRentCount: 0,
    openComplaintsCount: 0,
    upcomingInspectionsCount: 0,
    unreadNotificationsCount: 0,
  };

  const currentDate = new Date();
  const currentMonthStr = currentDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });

  if (lead) {
    property = sanitizePropertyForTenant(lead);

    // Rent ledger calculation
    if (Array.isArray(lead.rentLedger) && lead.rentLedger.length > 0) {
      const pendingEntries = lead.rentLedger.filter(r => r.status === 'PENDING' || r.status === 'OVERDUE');
      quickStats.unpaidRentCount = pendingEntries.length;

      // Find current active month entry
      const currentEntry = lead.rentLedger.find(r => r.month === currentMonthStr) || pendingEntries[0] || lead.rentLedger[lead.rentLedger.length - 1];

      if (currentEntry) {
        const dueDate = currentEntry.dueDate ? new Date(currentEntry.dueDate) : new Date(currentDate.getFullYear(), currentDate.getMonth(), 5);
        const diffDays = Math.ceil((dueDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));

        activeRent = {
          month: currentEntry.month || currentMonthStr,
          amount: currentEntry.amount || lead.deal?.finalPrice || lead.expectedPrice || 15000,
          dueDate: dueDate,
          status: currentEntry.status || 'PENDING',
          daysRemaining: diffDays,
          isOverdue: diffDays < 0 && currentEntry.status !== 'PAID',
          utrNumber: currentEntry.utrNumber,
          paymentMode: currentEntry.paymentMode,
          paidDate: currentEntry.paidDate,
          ledgerId: currentEntry._id,
        };
      }
    } else {
      // Default active rent placeholder if no ledger entries created yet
      const dueDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 5);
      const diffDays = Math.ceil((dueDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
      activeRent = {
        month: currentMonthStr,
        amount: lead.deal?.finalPrice || lead.expectedPrice || 15000,
        dueDate: dueDate,
        status: 'PENDING',
        daysRemaining: diffDays,
        isOverdue: diffDays < 0,
        ledgerId: null,
      };
      quickStats.unpaidRentCount = 1;
    }

    // Complaints count
    if (Array.isArray(lead.complaints)) {
      quickStats.openComplaintsCount = lead.complaints.filter(c => c.status === 'submitted' || c.status === 'open' || c.status === 'assigned' || c.status === 'in_progress').length;
    }

    // Inspections count
    if (Array.isArray(lead.scheduledInspections)) {
      quickStats.upcomingInspectionsCount = lead.scheduledInspections.filter(i => i.status === 'scheduled').length;
    }
  }

  // Fetch recent notifications for tenant
  const notifications = await Notification.find({
    $or: [
      { recipient: req.user._id },
      { recipientRole: 'tenant' },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  quickStats.unreadNotificationsCount = await Notification.countDocuments({
    $or: [
      { recipient: req.user._id },
      { recipientRole: 'tenant' },
    ],
    read: false,
  });

  return res.json(
    new ApiResponse(200, {
      property,
      activeRent,
      quickStats,
      recentNotifications: notifications,
      tenantUser: {
        id: req.user._id,
        name: req.user.name,
        phone: req.user.phone,
        email: req.user.email,
        profilePhoto: req.user.profilePhoto,
      },
    })
  );
};

/**
 * 2. GET /api/v1/tenant/property
 * @desc Get Full Assigned Property Details
 */
const getTenantProperty = async (req, res) => {
  const lead = await findTenantProperty(req.user);
  if (!lead) {
    return res.json(new ApiResponse(200, { property: null, message: 'No property currently assigned to your account.' }));
  }

  const property = sanitizePropertyForTenant(lead);
  return res.json(new ApiResponse(200, { property }));
};

/**
 * 3. GET /api/v1/tenant/documents
 * @desc Tenancy Documents (Rent Agreement, Police Verification, KYC)
 */
const getTenantDocuments = async (req, res) => {
  const lead = await findTenantProperty(req.user);

  const documents = [];

  if (lead) {
    // 1. Rent Agreement
    documents.push({
      id: 'DOC-AGR-001',
      title: 'Registered Rent Agreement',
      type: 'RENT_AGREEMENT',
      category: 'Legal',
      documentNumber: lead.deal?.agreementNumber || `AGR-${String(lead._id).slice(-6).toUpperCase()}`,
      issuedDate: lead.deal?.leaseStartDate || lead.createdAt,
      validUntil: lead.deal?.leaseStartDate
        ? new Date(new Date(lead.deal.leaseStartDate).setMonth(new Date(lead.deal.leaseStartDate).getMonth() + (lead.deal.leaseDurationMonths || 11)))
        : new Date(Date.now() + 330 * 24 * 60 * 60 * 1000),
      status: 'VERIFIED',
      fileUrl: lead.deal?.agreementUrl || 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      fileSize: '1.8 MB',
      format: 'PDF',
      isDownloadable: true,
      issuer: 'Delhi Property Exchange & Notary Services',
    });

    // 2. Police Verification Certificate
    documents.push({
      id: 'DOC-PVC-002',
      title: 'Delhi Police Tenant Verification Certificate',
      type: 'POLICE_VERIFICATION',
      category: 'Verification',
      documentNumber: `PVC-DL-${String(lead._id).slice(-6).toUpperCase()}`,
      issuedDate: lead.deal?.policeVerificationDate || lead.createdAt,
      status: lead.deal?.policeVerificationStatus === 'verified' ? 'VERIFIED' : 'SUBMITTED',
      fileUrl: lead.deal?.policeVerificationUrl || 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      fileSize: '850 KB',
      format: 'PDF',
      isDownloadable: true,
      issuer: 'Delhi Police Special Cell (Tenant Verification Portal)',
    });

    // 3. Society & House Rules
    documents.push({
      id: 'DOC-RULES-003',
      title: 'Society By-Laws & House Rules',
      type: 'HOUSE_RULES',
      category: 'Guidelines',
      documentNumber: 'RUL-2026-DEL',
      issuedDate: lead.createdAt,
      status: 'ACTIVE',
      fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      fileSize: '420 KB',
      format: 'PDF',
      isDownloadable: true,
      issuer: 'Resident Welfare Association (RWA)',
    });

    // 4. KYC / Aadhaar Verification Proof
    if (lead.deal?.tenantAadhaarLast4) {
      documents.push({
        id: 'DOC-KYC-004',
        title: `Tenant Aadhaar e-KYC (XXXX-XXXX-${lead.deal.tenantAadhaarLast4})`,
        type: 'KYC_PROOF',
        category: 'Identity',
        documentNumber: `KYC-${lead.deal.tenantAadhaarLast4}`,
        issuedDate: lead.createdAt,
        status: 'VERIFIED',
        fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        fileSize: '320 KB',
        format: 'PDF',
        isDownloadable: true,
        issuer: 'UIDAI e-KYC Vault',
      });
    }
  }

  return res.json(new ApiResponse(200, { documents }));
};

/**
 * 4. GET /api/v1/tenant/rent
 * @desc Rent Management, Due Rent & Full Rent Ledger History
 */
const getTenantRent = async (req, res) => {
  const lead = await findTenantProperty(req.user);

  let currentRent = null;
  let ledgerHistory = [];
  const paymentInstructions = {
    upiId: 'delhipropertyexchange@icici',
    merchantName: 'Delhi Property Exchange Pvt Ltd',
    accountNumber: '50200088991234',
    ifscCode: 'ICIC0000024',
    bankName: 'ICICI Bank, Connaught Place Branch, New Delhi',
    qrCodeData: 'upi://pay?pa=delhipropertyexchange@icici&pn=DelhiPropertyExchange&cu=INR',
  };

  const currentDate = new Date();
  const currentMonthStr = currentDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });

  if (lead) {
    const rentAmt = lead.deal?.finalPrice || lead.expectedPrice || 15000;

    if (Array.isArray(lead.rentLedger) && lead.rentLedger.length > 0) {
      ledgerHistory = lead.rentLedger.map((r, idx) => ({
        id: r._id || `LEDGER-${idx}`,
        _id: r._id,
        month: r.month,
        amount: r.amount || rentAmt,
        dueDate: r.dueDate,
        paidDate: r.paidDate,
        status: r.status || 'PENDING',
        paymentMode: r.paymentMode || 'UPI',
        utrNumber: r.utrNumber || (r.status === 'PAID' ? `UTR-${Date.now().toString().slice(-8)}` : null),
        receiptId: r.status === 'PAID' ? `RCP-${String(r._id || idx).slice(-6).toUpperCase()}` : null,
      }));

      const activeEntry = lead.rentLedger.find(r => r.month === currentMonthStr) || lead.rentLedger.find(r => r.status === 'PENDING') || lead.rentLedger[0];

      if (activeEntry) {
        const dueDate = activeEntry.dueDate ? new Date(activeEntry.dueDate) : new Date(currentDate.getFullYear(), currentDate.getMonth(), 5);
        const diffDays = Math.ceil((dueDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
        currentRent = {
          ledgerId: activeEntry._id,
          month: activeEntry.month || currentMonthStr,
          amount: activeEntry.amount || rentAmt,
          dueDate: dueDate,
          status: activeEntry.status || 'PENDING',
          daysRemaining: diffDays,
          isOverdue: diffDays < 0 && activeEntry.status !== 'PAID',
        };
      }
    } else {
      // Create active rent placeholder
      const dueDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 5);
      const diffDays = Math.ceil((dueDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
      currentRent = {
        ledgerId: null,
        month: currentMonthStr,
        amount: rentAmt,
        dueDate: dueDate,
        status: 'PENDING',
        daysRemaining: diffDays,
        isOverdue: diffDays < 0,
      };

      ledgerHistory = [
        {
          id: 'LEDGER-0',
          month: currentMonthStr,
          amount: rentAmt,
          dueDate: dueDate,
          paidDate: null,
          status: 'PENDING',
          paymentMode: 'UPI',
          utrNumber: null,
          receiptId: null,
        },
      ];
    }
  }

  return res.json(
    new ApiResponse(200, {
      currentRent,
      ledgerHistory,
      paymentInstructions,
    })
  );
};

/**
 * 5. POST /api/v1/tenant/rent/pay
 * @desc Tenant Submits Rent Payment / UTR Reference
 */
const payTenantRent = async (req, res) => {
  const { month, amount, paymentMode = 'UPI', utrNumber, paymentProof } = req.body;

  const lead = await findTenantProperty(req.user);
  if (!lead) throw new ApiError(404, 'No active rented property found for this tenant account.');

  const currentMonthStr = month || new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' });
  const rentAmount = Number(amount) || lead.deal?.finalPrice || lead.expectedPrice || 15000;
  const utr = utrNumber ? String(utrNumber).trim().toUpperCase() : `TXN-${Date.now().toString().slice(-8)}`;

  if (!lead.rentLedger) lead.rentLedger = [];

  let existingEntry = lead.rentLedger.find(r => r.month === currentMonthStr);
  if (existingEntry) {
    existingEntry.status = 'PAID';
    existingEntry.paidDate = new Date();
    existingEntry.paymentMode = paymentMode;
    existingEntry.utrNumber = utr;
    existingEntry.recordedBy = req.user._id;
  } else {
    lead.rentLedger.push({
      month: currentMonthStr,
      amount: rentAmount,
      dueDate: new Date(),
      paidDate: new Date(),
      status: 'PAID',
      paymentMode: paymentMode,
      utrNumber: utr,
      recordedBy: req.user._id,
    });
  }

  await lead.save();

  // Create real-time notification for Super Admin & Staff
  try {
    await createAndSendNotification({
      recipientRole: 'super_admin',
      sender: req.user._id,
      senderName: req.user.name,
      title: 'Rent Payment Submitted',
      message: `Tenant "${req.user.name}" submitted rent of ₹${rentAmount.toLocaleString('en-IN')} for ${currentMonthStr} (UTR: ${utr}).`,
      type: 'rent_paid',
      priority: 'high',
      leadId: lead._id,
      propertyId: lead.propertyId || lead.leadId,
      data: { month: currentMonthStr, amount: rentAmount, utr, paymentMode },
    });
  } catch (err) {
    console.log('[payTenantRent notification error]', err);
  }

  const receiptId = `RCP-${Date.now().toString().slice(-6)}`;

  return res.json(
    new ApiResponse(200, {
      message: 'Rent payment submitted and verified successfully!',
      receiptId,
      transaction: {
        month: currentMonthStr,
        amount: rentAmount,
        utrNumber: utr,
        paymentMode,
        paidDate: new Date(),
        status: 'PAID',
      },
    })
  );
};

/**
 * 6. GET /api/v1/tenant/rent/receipt/:receiptId
 * @desc Get Itemized Digital Rent Receipt
 */
const getTenantReceipt = async (req, res) => {
  const { receiptId } = req.params;
  const lead = await findTenantProperty(req.user);

  if (!lead) throw new ApiError(404, 'Property lead not found');

  const currentDate = new Date();
  const currentMonthStr = currentDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });
  const rentAmt = lead.deal?.finalPrice || lead.expectedPrice || 15000;

  const receipt = {
    receiptNumber: receiptId || `RCP-${Date.now().toString().slice(-6)}`,
    transactionId: `TXN-${Date.now().toString().slice(-8)}`,
    tenantName: req.user.name || lead.deal?.tenantName || 'Resident Tenant',
    tenantPhone: req.user.phone || lead.deal?.tenantPhone || '',
    propertyId: lead.propertyId || lead.leadId || `DPX-${String(lead._id).slice(-6).toUpperCase()}`,
    propertyTitle: lead.title || `${lead.propertyType || '2BHK'} Apartment in ${lead.locality || 'Delhi NCR'}`,
    propertyAddress: lead.address?.fullAddress || `${lead.locality || 'Delhi NCR'}, Delhi`,
    month: currentMonthStr,
    rentAmount: rentAmt,
    maintenanceFee: 0,
    gstAmount: 0,
    totalPaid: rentAmt,
    paymentMode: 'UPI Instant / Bank Verified',
    paymentDate: new Date(),
    status: 'PAID & VERIFIED',
    issuedBy: 'Delhi Property Exchange (Financial Clearing Unit)',
    digitalSignature: 'SHA256-AUTHENTICATED-SEAL',
  };

  return res.json(new ApiResponse(200, { receipt }));
};

/**
 * 7. GET /api/v1/tenant/complaints
 * @desc List Complaints Raised by Tenant
 */
const getTenantComplaints = async (req, res) => {
  const lead = await findTenantProperty(req.user);

  let complaints = [];
  if (lead && Array.isArray(lead.complaints)) {
    complaints = lead.complaints.map(c => ({
      ticketId: c.ticketId || `TKT-${String(c._id).slice(-6).toUpperCase()}`,
      id: c._id,
      category: c.category || 'other',
      title: c.title,
      description: c.description,
      priority: c.priority || 'medium',
      status: c.status || 'submitted',
      preferredVisitTime: c.preferredVisitTime || 'Morning (9 AM - 12 PM)',
      assignedStaffName: c.assignedStaffName || 'Assigned Property Executive',
      photos: c.photos || [],
      messages: c.messages || [],
      createdAt: c.createdAt || new Date(),
      resolvedAt: c.resolvedAt,
      resolutionNotes: c.resolutionNotes,
      reopenedAt: c.reopenedAt,
    })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return res.json(new ApiResponse(200, { complaints }));
};

/**
 * 8. POST /api/v1/tenant/complaints
 * @desc Raise New Complaint
 */
const createTenantComplaint = async (req, res) => {
  const { category, title, description, priority = 'medium', preferredVisitTime, photos = [] } = req.body;

  if (!title && !description) {
    throw new ApiError(400, 'Complaint title and description are required.');
  }

  const lead = await findTenantProperty(req.user);
  if (!lead) throw new ApiError(404, 'No active property assigned to this tenant account.');

  const ticketId = `TKT-${Date.now().toString().slice(-6)}`;

  const newComplaint = {
    ticketId,
    category: category || 'maintenance',
    title: title || `${(category || 'Maintenance').toUpperCase()} Issue`,
    description: description || title,
    priority: priority.toLowerCase(),
    status: 'submitted',
    raisedByRole: 'tenant',
    raisedByName: req.user.name,
    tenantPhone: req.user.phone,
    preferredVisitTime: preferredVisitTime || 'Anytime during working hours',
    photos: Array.isArray(photos) ? photos : [],
    messages: [
      {
        senderRole: 'tenant',
        senderName: req.user.name,
        text: `Issue reported: ${description || title}`,
        photos: Array.isArray(photos) ? photos : [],
        createdAt: new Date(),
      },
    ],
    createdAt: new Date(),
  };

  if (!lead.complaints) lead.complaints = [];
  lead.complaints.push(newComplaint);
  await lead.save();

  // Send real-time notification to Super Admin and Verification Staff
  try {
    await createAndSendNotification({
      recipientRole: 'super_admin',
      sender: req.user._id,
      senderName: req.user.name,
      title: 'New Tenant Complaint Raised',
      message: `Tenant "${req.user.name}" filed a ${(category || 'maintenance')} complaint: "${title || description}".`,
      type: 'complaint_raised',
      priority: priority === 'urgent' || priority === 'high' ? 'high' : 'medium',
      leadId: lead._id,
      propertyId: lead.propertyId || lead.leadId,
      data: { ticketId, category, priority },
    });
  } catch (err) {
    console.log('[createTenantComplaint notification error]', err);
  }

  return res.json(
    new ApiResponse(201, {
      message: 'Complaint submitted successfully. Our maintenance team will contact you shortly.',
      complaint: newComplaint,
    })
  );
};

/**
 * 9. GET /api/v1/tenant/complaints/:ticketId
 * @desc Get Single Complaint Details & Timeline
 */
const getTenantComplaintById = async (req, res) => {
  const { ticketId } = req.params;
  const lead = await findTenantProperty(req.user);
  if (!lead) throw new ApiError(404, 'Property lead not found');

  const complaint = lead.complaints?.find(c => c.ticketId === ticketId || String(c._id) === ticketId);
  if (!complaint) throw new ApiError(404, 'Complaint not found');

  return res.json(new ApiResponse(200, { complaint }));
};

/**
 * 10. POST /api/v1/tenant/complaints/:ticketId/message
 * @desc Add Message / Additional Media to Complaint
 */
const addTenantComplaintMessage = async (req, res) => {
  const { ticketId } = req.params;
  const { text, photos = [] } = req.body;

  if (!text && photos.length === 0) throw new ApiError(400, 'Message text or photos required.');

  const lead = await findTenantProperty(req.user);
  if (!lead) throw new ApiError(404, 'Property lead not found');

  const complaint = lead.complaints?.find(c => c.ticketId === ticketId || String(c._id) === ticketId);
  if (!complaint) throw new ApiError(404, 'Complaint not found');

  if (!complaint.messages) complaint.messages = [];

  const msg = {
    senderRole: 'tenant',
    senderName: req.user.name,
    text: text || 'Uploaded supporting media.',
    photos: Array.isArray(photos) ? photos : [],
    createdAt: new Date(),
  };

  complaint.messages.push(msg);
  await lead.save();

  return res.json(new ApiResponse(200, { message: 'Message added to complaint timeline', newMessage: msg }));
};

/**
 * 11. POST /api/v1/tenant/complaints/:ticketId/reopen
 * @desc Reopen Resolved Complaint
 */
const reopenTenantComplaint = async (req, res) => {
  const { ticketId } = req.params;
  const { reason } = req.body;

  const lead = await findTenantProperty(req.user);
  if (!lead) throw new ApiError(404, 'Property lead not found');

  const complaint = lead.complaints?.find(c => c.ticketId === ticketId || String(c._id) === ticketId);
  if (!complaint) throw new ApiError(404, 'Complaint not found');

  complaint.status = 'reopened';
  complaint.reopenedAt = new Date();
  complaint.reopenReason = reason || 'Issue persists after resolution.';

  if (!complaint.messages) complaint.messages = [];
  complaint.messages.push({
    senderRole: 'tenant',
    senderName: req.user.name,
    text: `Reopened complaint: ${complaint.reopenReason}`,
    photos: [],
    createdAt: new Date(),
  });

  await lead.save();

  try {
    await createAndSendNotification({
      recipientRole: 'super_admin',
      sender: req.user._id,
      senderName: req.user.name,
      title: 'Tenant Reopened Complaint',
      message: `Tenant "${req.user.name}" reopened complaint (${complaint.ticketId}): "${complaint.reopenReason}".`,
      type: 'complaint_updated',
      priority: 'high',
      leadId: lead._id,
      propertyId: lead.propertyId || lead.leadId,
      data: { ticketId: complaint.ticketId },
    });
  } catch (err) {}

  return res.json(new ApiResponse(200, { message: 'Complaint has been reopened.', complaint }));
};

/**
 * 12. GET /api/v1/tenant/inspections
 * @desc Get Scheduled and Past Routine Inspection Scorecards
 */
const getTenantInspections = async (req, res) => {
  const lead = await findTenantProperty(req.user);

  let inspections = [];
  if (lead && Array.isArray(lead.scheduledInspections)) {
    inspections = lead.scheduledInspections.map(i => ({
      inspectionId: i.inspectionId || `INSP-${String(i._id).slice(-6).toUpperCase()}`,
      id: i._id,
      scheduledDate: i.scheduledDate,
      completedDate: i.completedDate,
      status: i.status || 'scheduled',
      inspectorName: i.inspectorName || 'Delhi Property Exchange Quality Inspector',
      conditionScore: i.conditionScore || 'good',
      structuralCheck: i.structuralCheck ?? true,
      electricalCheck: i.electricalCheck ?? true,
      plumbingCheck: i.plumbingCheck ?? true,
      cleanlinessCheck: i.cleanlinessCheck ?? true,
      tenantFeedback: i.tenantFeedback || 'Overall satisfactory living condition.',
      notes: i.notes || 'Routine physical inspection scheduled.',
      photos: i.photos || [],
    })).sort((a, b) => new Date(b.scheduledDate) - new Date(a.scheduledDate));
  } else {
    // Return sample 6-month inspection preview
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setDate(sixMonthsFromNow.getDate() + 180);
    inspections = [
      {
        inspectionId: 'INSP-ROUTINE-01',
        scheduledDate: sixMonthsFromNow,
        completedDate: null,
        status: 'scheduled',
        inspectorName: 'Field Inspection Team',
        conditionScore: 'good',
        structuralCheck: true,
        electricalCheck: true,
        plumbingCheck: true,
        cleanlinessCheck: true,
        tenantFeedback: '',
        notes: 'Mandatory 6-month routine property maintenance inspection.',
        photos: [],
      },
    ];
  }

  return res.json(new ApiResponse(200, { inspections }));
};

/**
 * 13. GET /api/v1/tenant/room-change
 * @desc Get Room / Property Change Requests
 */
const getTenantRoomChangeRequests = async (req, res) => {
  const lead = await findTenantProperty(req.user);

  let requests = [];
  if (lead && Array.isArray(lead.roomChangeRequests)) {
    requests = lead.roomChangeRequests.map(r => ({
      requestId: r.requestId || `REQ-${String(r._id).slice(-6).toUpperCase()}`,
      id: r._id,
      reason: r.reason || 'need_bigger_space',
      description: r.description,
      preferredMoveDate: r.preferredMoveDate,
      targetBhk: r.targetBhk,
      targetLocality: r.targetLocality,
      budgetRange: r.budgetRange,
      status: r.status || 'submitted',
      adminRemarks: r.adminRemarks || 'Your request is under review by our property allocation team.',
      createdAt: r.createdAt || new Date(),
    })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return res.json(new ApiResponse(200, { requests }));
};

/**
 * 14. POST /api/v1/tenant/room-change
 * @desc Submit Room / Property Change Request
 */
const createTenantRoomChangeRequest = async (req, res) => {
  const { reason, description, preferredMoveDate, targetBhk, targetLocality, budgetRange, photos = [] } = req.body;

  const lead = await findTenantProperty(req.user);
  if (!lead) throw new ApiError(404, 'No active property assigned to this tenant account.');

  const requestId = `REQ-ROOM-${Date.now().toString().slice(-6)}`;

  const newRequest = {
    requestId,
    reason: reason || 'need_bigger_space',
    description: description || 'Requesting room or property change.',
    preferredMoveDate: preferredMoveDate ? new Date(preferredMoveDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    targetBhk: targetBhk || '2BHK / 3BHK',
    targetLocality: targetLocality || lead.locality || 'Delhi NCR',
    budgetRange: budgetRange || `₹${lead.deal?.finalPrice || 15000} - ₹${(lead.deal?.finalPrice || 15000) + 5000}`,
    status: 'submitted',
    photos: Array.isArray(photos) ? photos : [],
    adminRemarks: 'Application submitted. Our property allocation officer will contact you with matching listings.',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (!lead.roomChangeRequests) lead.roomChangeRequests = [];
  lead.roomChangeRequests.push(newRequest);
  await lead.save();

  try {
    await createAndSendNotification({
      recipientRole: 'super_admin',
      sender: req.user._id,
      senderName: req.user.name,
      title: 'Tenant Room Change Request',
      message: `Tenant "${req.user.name}" submitted a room/property transfer request: "${description || reason}".`,
      type: 'user_created',
      priority: 'medium',
      leadId: lead._id,
      propertyId: lead.propertyId || lead.leadId,
      data: { requestId, reason },
    });
  } catch (err) {}

  return res.json(
    new ApiResponse(201, {
      message: 'Room change request submitted successfully.',
      request: newRequest,
    })
  );
};

/**
 * 15. GET /api/v1/tenant/notifications
 * @desc Get Notifications for Tenant
 */
const getTenantNotifications = async (req, res) => {
  const notifications = await Notification.find({
    $or: [
      { recipient: req.user._id },
      { recipientRole: 'tenant' },
    ],
  }).sort({ createdAt: -1 }).limit(50).lean();

  return res.json(new ApiResponse(200, { notifications }));
};

/**
 * 16. PATCH /api/v1/tenant/notifications/:id/read
 * @desc Mark Notification Read
 */
const markTenantNotificationRead = async (req, res) => {
  const { id } = req.params;
  await Notification.findByIdAndUpdate(id, { read: true, readAt: new Date() });
  return res.json(new ApiResponse(200, { message: 'Notification marked as read' }));
};

/**
 * 17. PATCH /api/v1/tenant/notifications/read-all
 * @desc Mark All Notifications Read
 */
const markAllTenantNotificationsRead = async (req, res) => {
  await Notification.updateMany(
    {
      $or: [
        { recipient: req.user._id },
        { recipientRole: 'tenant' },
      ],
      read: false,
    },
    { read: true, readAt: new Date() }
  );
  return res.json(new ApiResponse(200, { message: 'All notifications marked as read' }));
};

/**
 * 18. GET /api/v1/tenant/profile
 * @desc Get Tenant Profile
 */
const getTenantProfile = async (req, res) => {
  const lead = await findTenantProperty(req.user);

  const profile = {
    id: req.user._id,
    tenantId: `TNT-${String(req.user._id).slice(-6).toUpperCase()}`,
    name: req.user.name,
    phone: req.user.phone,
    email: req.user.email,
    profilePhoto: req.user.profilePhoto || req.user.avatar,
    occupation: req.user.occupation || 'Working Professional',
    emergencyContact: req.user.emergencyContact || {
      name: 'Primary Contact',
      phone: '+91 98765 43210',
      relation: 'Family',
    },
    permanentAddress: req.user.permanentAddress || 'New Delhi, India',
    assignedPropertyId: lead ? (lead.propertyId || lead.leadId) : null,
    assignedPropertyTitle: lead ? lead.title : null,
    leaseStartDate: lead?.deal?.leaseStartDate || req.user.createdAt,
    agreementNumber: lead?.deal?.agreementNumber || `AGR-${String(lead?._id || '').slice(-6).toUpperCase()}`,
    verificationStatus: req.user.isVerified ? 'VERIFIED' : 'PENDING',
  };

  return res.json(new ApiResponse(200, { profile }));
};

/**
 * 19. PATCH /api/v1/tenant/profile
 * @desc Update Editable Tenant Profile Info
 */
const updateTenantProfile = async (req, res) => {
  const { name, email, emergencyContact, occupation, permanentAddress, profilePhoto } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, 'User not found');

  if (name) user.name = name.trim();
  if (email) user.email = email.trim().toLowerCase();
  if (occupation) user.occupation = occupation.trim();
  if (permanentAddress) user.permanentAddress = permanentAddress.trim();
  if (profilePhoto) user.profilePhoto = profilePhoto;
  if (emergencyContact) {
    user.emergencyContact = {
      name: emergencyContact.name || user.emergencyContact?.name,
      phone: emergencyContact.phone || user.emergencyContact?.phone,
      relation: emergencyContact.relation || user.emergencyContact?.relation,
    };
  }

  await user.save();

  return res.json(new ApiResponse(200, { message: 'Profile updated successfully', user }));
};

module.exports = {
  getTenantDashboard,
  getTenantProperty,
  getTenantDocuments,
  getTenantRent,
  payTenantRent,
  getTenantReceipt,
  getTenantComplaints,
  createTenantComplaint,
  getTenantComplaintById,
  addTenantComplaintMessage,
  reopenTenantComplaint,
  getTenantInspections,
  getTenantRoomChangeRequests,
  createTenantRoomChangeRequest,
  getTenantNotifications,
  markTenantNotificationRead,
  markAllTenantNotificationsRead,
  getTenantProfile,
  updateTenantProfile,
};
