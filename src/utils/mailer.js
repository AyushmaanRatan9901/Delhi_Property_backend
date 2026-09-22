const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendOTPEmail = async (to, otp, expiresInMinutes) => {
  await transporter.sendMail({
    from: `"DPE — Delhi Property Exchange" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Your OTP for DPE Login',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
        <h2 style="color:#1e293b;margin-bottom:8px">Delhi Property Exchange</h2>
        <p style="color:#475569;margin-bottom:20px">Use the OTP below to login to your account.</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#2563eb;text-align:center;padding:16px;background:#eff6ff;border-radius:6px">
          ${otp}
        </div>
        <p style="color:#64748b;font-size:13px;margin-top:16px">
          This OTP expires in <strong>${expiresInMinutes} minutes</strong>. Do not share it with anyone.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
        <p style="color:#94a3b8;font-size:12px">If you did not request this OTP, please ignore this email.</p>
      </div>
    `,
  });
};

module.exports = { sendOTPEmail };
