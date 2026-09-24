const ApiResponse = require('../../utils/ApiResponse');

/**
 * GET /api/crm/access
 * Returns role-based capabilities and masking policies for current user
 */
const getCRMAccess = async (req, res) => {
  const isSuperAdmin = req.user.role === 'super_admin';
  const isAdmin = req.user.role === 'admin';
  const isTeleCaller = req.user.role === 'tele_caller';

  const permissions = {
    role: req.user.role,
    isSuperAdmin,
    isAdmin,
    isTeleCaller,
    canViewLeads: true,
    canCreateLead: true,
    canEditLead: true,
    canAssignLead: isSuperAdmin || isAdmin,
    canDeleteLead: isSuperAdmin,
    canMakeCalls: true,
    canViewRecordings: true,
    canGenerateAISummaries: true,
    canViewInventory: true,
    canViewOwnerPII: isSuperAdmin || isAdmin,
    canViewTenantPII: isSuperAdmin || isAdmin,
    canViewInternalCommission: isSuperAdmin || isAdmin,
    canEditProperty: isSuperAdmin || isAdmin,
    canDeleteProperty: isSuperAdmin,
    canApproveProperty: isSuperAdmin || isAdmin,
    canShortlistProperties: true,
    canShareWhatsApp: true,
    canCreateShowcase: true,
    canScheduleSiteVisits: true,
    canSubmitHandoff: isTeleCaller || isSuperAdmin || isAdmin,
    canAcceptHandoff: isSuperAdmin || isAdmin,
    canViewAnalytics: true,
  };

  return res.status(200).json(
    new ApiResponse(200, { permissions }, 'CRM access permissions fetched')
  );
};

/**
 * GET /api/crm/permissions
 */
const getPermissions = async (req, res) => {
  return getCRMAccess(req, res);
};

module.exports = {
  getCRMAccess,
  getPermissions,
};
