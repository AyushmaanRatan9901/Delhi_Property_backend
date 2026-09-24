const mongoose = require('mongoose');
const CRMPropertyShare = require('../../../models/crm/PropertyShare');
const CRMLead = require('../../../models/crm/Lead');
const whatsAppService = require('../../../services/crm/whatsAppIntegration.service');
const ApiResponse = require('../../../utils/ApiResponse');
const ApiError = require('../../../utils/ApiError');

/**
 * GET /api/admin/crm/whatsapp/shares
 * Track all property sharing instances across channels
 */
const getAllShares = async (req, res) => {
  const {
    caller,
    lead,
    channel,
    dateFrom,
    dateTo,
    page = 1,
    limit = 20,
  } = req.query;

  const query = {};

  if (caller && mongoose.Types.ObjectId.isValid(caller)) {
    query.teleCaller = new mongoose.Types.ObjectId(caller);
  }
  if (lead && mongoose.Types.ObjectId.isValid(lead)) {
    query.lead = new mongoose.Types.ObjectId(lead);
  }
  if (channel) query.channel = channel;

  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo) query.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [shares, total] = await Promise.all([
    CRMPropertyShare.find(query)
      .populate('teleCaller', 'name phone staffId')
      .populate('lead', 'leadId name phone')
      .populate('properties.property', 'leadId locality propertyType expectedPrice')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CRMPropertyShare.countDocuments(query),
  ]);

  return res.json(
    new ApiResponse(200, shares, 'Property sharing records retrieved', {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    })
  );
};

const getLeadShares = async (req, res) => {
  req.query.lead = req.params.leadId;
  return getAllShares(req, res);
};

const getCallerShares = async (req, res) => {
  req.query.caller = req.params.callerId;
  return getAllShares(req, res);
};

const getShareById = async (req, res) => {
  const { shareId } = req.params;

  let share = null;
  if (mongoose.Types.ObjectId.isValid(shareId)) {
    share = await CRMPropertyShare.findById(shareId)
      .populate('teleCaller', 'name phone staffId')
      .populate('lead', 'leadId name phone')
      .populate('properties.property')
      .lean();
  }
  if (!share && shareId) {
    share = await CRMPropertyShare.findOne({ shareToken: shareId })
      .populate('teleCaller', 'name phone staffId')
      .populate('lead', 'leadId name phone')
      .populate('properties.property')
      .lean();
  }

  if (!share) throw new ApiError(404, 'Share record not found');

  return res.json(new ApiResponse(200, share, 'Property share details retrieved'));
};

module.exports = {
  getAllShares,
  getLeadShares,
  getCallerShares,
  getShareById,
};
