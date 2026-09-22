const User = require('../models/User');

const PREFIX = {
  super_admin: 'DPE-SA',
  admin: 'DPE-AD',
  field_agent: 'DPE-FA',
  field_staff: 'DPE-FS',
  tele_caller: 'DPE-TC',
};

const generateStaffId = async (role) => {
  const prefix = PREFIX[role];
  const count = await User.countDocuments({ role });
  const serial = String(count + 1).padStart(3, '0');
  return `${prefix}-${serial}`;
};

module.exports = { generateStaffId };
