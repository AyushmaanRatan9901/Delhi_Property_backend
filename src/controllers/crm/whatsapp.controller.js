const CRMPropertyShare = require('../../models/crm/PropertyShare');
const CRMLead = require('../../models/crm/Lead');
const { PropertyLead } = require('../../models/propertyLeadModel');
const { maskPropertyForTeleCaller, maskPropertiesList } = require('../../services/crm/maskedInventory.service');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { generateCRMId, generateSecureToken } = require('../../utils/crmIdGenerator');
const { logCRMActivity } = require('../../services/crm/activity.service');
const { sendCRMNotification } = require('../../services/crm/notification.service');

/**
 * POST /api/crm/whatsapp/share
 * Create a WhatsApp share package (1-3 properties) with secure tracking token
 */
const createWhatsAppShare = async (req, res) => {
  const { leadId, propertyIds, notes, expiresInDays = 7 } = req.body;

  if (!leadId || !propertyIds || !Array.isArray(propertyIds) || propertyIds.length === 0) {
    throw new ApiError(400, 'leadId and propertyIds array (1-3 properties) are required');
  }

  if (propertyIds.length > 5) {
    throw new ApiError(400, 'A maximum of 3 to 5 properties can be shared in a single package');
  }

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const validProperties = await PropertyLead.find({
    $or: [
      { _id: { $in: propertyIds.filter((id) => id.match(/^[0-9a-fA-F]{24}$/)) } },
      { leadId: { $in: propertyIds } },
    ],
  });

  if (validProperties.length === 0) {
    throw new ApiError(404, 'No valid properties found from the provided IDs');
  }

  const shareId = generateCRMId('SHR');
  const secureToken = generateSecureToken();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Number(expiresInDays));

  const propertyTracking = validProperties.map((p) => ({
    property: p._id,
    videoViews: 0,
    clientFeedback: 'none',
  }));

  const share = await CRMPropertyShare.create({
    shareId,
    secureToken,
    lead: lead._id,
    properties: validProperties.map((p) => p._id),
    channel: 'whatsapp',
    sharedBy: req.user._id,
    notes: notes || '',
    propertyTracking,
    expiresAt,
  });

  // Construct masked WhatsApp message
  const frontendUrl = process.env.CLIENT_PORTAL_URL || 'https://dpe.properties/view';
  const shareUrl = `${frontendUrl}/${share.shareId}?token=${share.secureToken}`;

  const propertySummaries = validProperties.map((p, idx) => {
    const masked = maskPropertyForTeleCaller(p);
    return `${idx + 1}. *${masked.title}*\n   📍 ${masked.locality}\n   💰 ₹${masked.price.toLocaleString('en-IN')}${masked.priceType === 'monthly' ? '/month' : ''}\n   🛋️ Furnishing: ${masked.furnishing}`;
  }).join('\n\n');

  const whatsappMessage = `Hello ${lead.name},\n\nHere are hand-picked properties matching your requirement:\n\n${propertySummaries}\n\n👉 *View High-Res Photos & HD Virtual Tour:*\n${shareUrl}\n\nLet me know which units you'd like to schedule a site visit for!`;

  await logCRMActivity({
    action: 'whatsapp_shared',
    entityType: 'CRMPropertyShare',
    entityId: share._id,
    performedBy: req.user,
    lead: lead._id,
    metadata: { shareId: share.shareId, propertyCount: validProperties.length },
    req,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        shareId: share.shareId,
        secureToken: share.secureToken,
        shareUrl,
        whatsappMessage,
        expiresAt: share.expiresAt,
        properties: maskPropertiesList(validProperties),
      },
      'WhatsApp share package created successfully'
    )
  );
};

/**
 * GET /api/crm/leads/:leadId/shares
 */
const getSharesForLead = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const shares = await CRMPropertyShare.find({ lead: lead._id })
    .populate('properties')
    .populate('sharedBy', 'name staffId')
    .sort({ createdAt: -1 })
    .lean();

  const formatted = shares.map((s) => ({
    ...s,
    properties: maskPropertiesList(s.properties),
  }));

  return res
    .status(200)
    .json(new ApiResponse(200, { shares: formatted }, 'Shares fetched successfully'));
};

/**
 * GET /api/crm/whatsapp/shares/:shareId
 */
const getShareDetails = async (req, res) => {
  const { shareId } = req.params;

  const share = await CRMPropertyShare.findOne({ shareId })
    .populate('lead', 'leadId name phone requirementType')
    .populate('properties')
    .populate('sharedBy', 'name staffId')
    .lean();

  if (!share) throw new ApiError(404, 'Share package not found');

  share.properties = maskPropertiesList(share.properties);

  return res
    .status(200)
    .json(new ApiResponse(200, { share }, 'Share details fetched successfully'));
};

/**
 * POST /api/crm/whatsapp/shares/:shareId/link
 */
const getShareLink = async (req, res) => {
  const { shareId } = req.params;

  const share = await CRMPropertyShare.findOne({ shareId });
  if (!share) throw new ApiError(404, 'Share package not found');

  const frontendUrl = process.env.CLIENT_PORTAL_URL || 'https://dpe.properties/view';
  const shareUrl = `${frontendUrl}/${share.shareId}?token=${share.secureToken}`;

  return res.status(200).json(new ApiResponse(200, { shareUrl }, 'Share link generated'));
};

// ─────────────────────────────────────────────────────────────────────────────
// Client Public Endpoints (Accessible with shareId / secureToken)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/crm/shared/:shareId
 * Public client endpoint: Resolves secureToken & returns masked property catalogue
 */
const getPublicSharedCatalogue = async (req, res) => {
  const { shareId } = req.params;
  const { token } = req.query;

  const share = await CRMPropertyShare.findOne({ shareId })
    .populate('properties')
    .populate('lead', 'name requirementType');

  if (!share) throw new ApiError(404, 'Shared property catalogue not found or expired');

  if (share.isRevoked) {
    throw new ApiError(410, 'This shared property link has been revoked');
  }

  if (share.expiresAt && new Date() > new Date(share.expiresAt)) {
    throw new ApiError(410, 'This shared link has expired. Contact your agent for an updated link.');
  }

  // Verify secure token if provided
  if (token && share.secureToken !== token) {
    throw new ApiError(403, 'Invalid or expired secure access token');
  }

  // Update opened counter
  share.viewCount += 1;
  if (!share.firstOpenedAt) share.firstOpenedAt = new Date();
  share.lastOpenedAt = new Date();
  await share.save();

  const masked = maskPropertiesList(share.properties);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        shareId: share.shareId,
        clientName: share.lead?.name || 'Client',
        requirementType: share.lead?.requirementType || 'rent',
        properties: masked,
      },
      'Catalogue loaded'
    )
  );
};

/**
 * POST /api/crm/shared/:shareId/open
 */
const trackShareOpen = async (req, res) => {
  const { shareId } = req.params;
  const share = await CRMPropertyShare.findOne({ shareId }).populate('lead');
  if (!share) throw new ApiError(404, 'Share not found');

  share.viewCount += 1;
  share.lastOpenedAt = new Date();
  if (!share.firstOpenedAt) share.firstOpenedAt = new Date();
  await share.save();

  await sendCRMNotification({
    recipientId: share.sharedBy,
    type: 'client_viewed_property',
    title: 'Client Opened WhatsApp Catalogue',
    message: `Client ${share.lead?.name || 'Lead'} opened your shared property catalogue (${share.shareId}).`,
    lead: share.lead?._id,
  });

  return res.status(200).json(new ApiResponse(200, { success: true }, 'Open tracked'));
};

/**
 * POST /api/crm/shared/:shareId/properties/:propertyId/video-view
 */
const trackVideoView = async (req, res) => {
  const { shareId, propertyId } = req.params;

  const share = await CRMPropertyShare.findOne({ shareId });
  if (!share) throw new ApiError(404, 'Share not found');

  const trackingItem = share.propertyTracking.find(
    (t) => t.property.toString() === propertyId || t.property.equals?.(propertyId)
  );

  if (trackingItem) {
    trackingItem.videoViews += 1;
    trackingItem.lastVideoViewedAt = new Date();
    await share.save();
  }

  return res.status(200).json(new ApiResponse(200, { success: true }, 'Video view tracked'));
};

/**
 * POST /api/crm/shared/:shareId/properties/:propertyId/interest
 */
const trackPropertyInterest = async (req, res) => {
  const { shareId, propertyId } = req.params;
  const { notes } = req.body;

  const share = await CRMPropertyShare.findOne({ shareId }).populate('lead');
  if (!share) throw new ApiError(404, 'Share not found');

  const trackingItem = share.propertyTracking.find(
    (t) => t.property.toString() === propertyId || t.property.equals?.(propertyId)
  );

  if (trackingItem) {
    trackingItem.clientFeedback = 'interested';
    trackingItem.feedbackAt = new Date();
    trackingItem.feedbackNotes = notes || 'Client clicked Interested';
    await share.save();
  }

  await sendCRMNotification({
    recipientId: share.sharedBy,
    type: 'client_interested',
    title: 'Client Interested in Property!',
    message: `Client ${share.lead?.name || 'Lead'} showed interest in a property from share ${share.shareId}.`,
    lead: share.lead?._id,
    property: propertyId,
    priority: 'high',
  });

  return res.status(200).json(new ApiResponse(200, { success: true }, 'Interest recorded'));
};

/**
 * POST /api/crm/shared/:shareId/properties/:propertyId/reject
 */
const trackPropertyReject = async (req, res) => {
  const { shareId, propertyId } = req.params;
  const { notes } = req.body;

  const share = await CRMPropertyShare.findOne({ shareId });
  if (!share) throw new ApiError(404, 'Share not found');

  const trackingItem = share.propertyTracking.find(
    (t) => t.property.toString() === propertyId || t.property.equals?.(propertyId)
  );

  if (trackingItem) {
    trackingItem.clientFeedback = 'rejected';
    trackingItem.feedbackAt = new Date();
    trackingItem.feedbackNotes = notes || 'Client passed on property';
    await share.save();
  }

  return res.status(200).json(new ApiResponse(200, { success: true }, 'Feedback recorded'));
};

module.exports = {
  createWhatsAppShare,
  getSharesForLead,
  getShareDetails,
  getShareLink,
  getPublicSharedCatalogue,
  trackShareOpen,
  trackVideoView,
  trackPropertyInterest,
  trackPropertyReject,
};
