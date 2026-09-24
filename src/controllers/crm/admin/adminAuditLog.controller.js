const mongoose = require('mongoose');
const CRMAuditLog = require('../../../models/crm/AuditLog');
const ApiResponse = require('../../../utils/ApiResponse');

/**
 * GET /api/admin/crm/audit-logs
 * Super Admin audit log viewer
 */
const getAuditLogs = async (req, res) => {
  const {
    user,
    role,
    action,
    entity,
    entityId,
    dateFrom,
    dateTo,
    page = 1,
    limit = 25,
    sort = 'createdAt',
    sortBy = 'desc',
  } = req.query;

  const query = {};

  if (user && mongoose.Types.ObjectId.isValid(user)) {
    query.actor = new mongoose.Types.ObjectId(user);
  }
  if (role) query.actorRole = role.toLowerCase();
  if (action) query.action = action.toUpperCase();
  if (entity) query.entity = entity;
  if (entityId) query.entityId = entityId;

  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo) query.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sortDirection = sortBy === 'asc' ? 1 : -1;

  const [logs, total] = await Promise.all([
    CRMAuditLog.find(query)
      .populate('actor', 'name phone email staffId role')
      .sort({ [sort]: sortDirection })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CRMAuditLog.countDocuments(query),
  ]);

  return res.json(
    new ApiResponse(200, logs, 'Audit logs retrieved successfully', {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    })
  );
};

module.exports = {
  getAuditLogs,
};
