const crypto = require('crypto');

const generateCRMId = (prefix = 'CRM') => {
  const timestamp = Date.now().toString().slice(-4);
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${timestamp}${randomNum}`;
};

const generateSecureToken = () => {
  return crypto.randomBytes(24).toString('hex');
};

module.exports = {
  generateCRMId,
  generateSecureToken,
};
