const mongoose = require('mongoose');

const adminSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'system_settings',
      unique: true,
    },
    whatsappReminderDays: {
      type: Number,
      default: 3,
    },
    overdueReminderDays: {
      type: Number,
      default: 1,
    },
    inspectionCycleHours: {
      type: Number,
      default: 48,
    },
    defaultAgentCommissionRentPct: {
      type: Number,
      default: 15,
    },
    defaultAgentRecurringCommissionRentPct: {
      type: Number,
      default: 5,
    },
    defaultAgentCommissionSalePct: {
      type: Number,
      default: 0.5,
    },
    defaultDealerCommissionRentPct: {
      type: Number,
      default: 25,
    },
    autoBirthdayWishes: {
      type: Boolean,
      default: true,
    },
    autoPoliceVerificationReminder: {
      type: Boolean,
      default: true,
    },
    duplicateAadhaarCheck: {
      type: Boolean,
      default: true,
    },
    duplicatePhoneCheck: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.AdminSetting || mongoose.model('AdminSetting', adminSettingSchema);
