const bcrypt = require('bcryptjs');

const OTP_EXPIRY_MINUTES = 10;

const generateOTP = () => String(Math.floor(100000 + Math.random() * 900000));

const hashOTP = (otp) => bcrypt.hash(otp, 10);

const verifyOTP = (plain, hashed) => bcrypt.compare(plain, hashed);

const otpExpiresAt = () => new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

module.exports = { generateOTP, hashOTP, verifyOTP, otpExpiresAt, OTP_EXPIRY_MINUTES };
