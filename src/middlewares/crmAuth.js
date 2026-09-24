const ApiError = require('../utils/ApiError');

const CRM_ROLES = ['tele_caller', 'admin', 'super_admin'];

/**
 * Ensures the authenticated user has CRM access (tele_caller, admin, or super_admin).
 */
const requireCRMAccess = (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, 'Authentication required'));
  }
  if (!CRM_ROLES.includes(req.user.role)) {
    return next(
      new ApiError(403, `Access denied — role '${req.user.role}' is not permitted for CRM operations`)
    );
  }
  next();
};

/**
 * Ensures the authenticated user is Admin or Super Admin (for assignment, review, etc.).
 */
const requireAdminOrSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, 'Authentication required'));
  }
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return next(
      new ApiError(403, `Access denied — action requires Administrator or Super Administrator privileges`)
    );
  }
  next();
};

module.exports = {
  requireCRMAccess,
  requireAdminOrSuperAdmin,
  CRM_ROLES,
};
