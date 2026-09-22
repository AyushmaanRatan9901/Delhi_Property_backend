const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new ApiError(401, 'Not authorized — no token provided'));
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id).select('-otp');

  if (!user) return next(new ApiError(401, 'User no longer exists'));
  if (!user.isActive) return next(new ApiError(403, 'Account is deactivated. Contact the administrator.'));

  req.user = user;
  next();
};

// Usage: authorize('super_admin') or authorize('super_admin', 'field_staff')
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new ApiError(403, `Access denied — role '${req.user.role}' is not permitted for this action`)
      );
    }
    next();
  };
};

module.exports = { protect, authorize };
