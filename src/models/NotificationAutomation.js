const mongoose = require('mongoose');

const notificationAutomationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        'rent_reminder',
        'rent_due',
        'rent_overdue',
        'overdue_followup',
        'lease_expiry',
        'lease_expiry_warning',
        'security_deposit',
        'maintenance_inspection',
        'custom',
      ],
      required: true,
      index: true,
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    trigger: {
      event: {
        type: String,
        enum: [
          'days_before_due',
          'on_due_date',
          'days_after_due',
          'recurring_days_after_due',
          'days_before_lease_expiry',
          'scheduled_inspection',
          'manual_trigger',
        ],
        default: 'days_before_due',
      },
      daysBefore: {
        type: Number,
        default: 5,
      },
      daysAfter: {
        type: Number,
        default: 1,
      },
      recurringDays: {
        type: Number,
        default: 3,
      },
    },
    titleTemplate: {
      type: String,
      required: true,
      default: 'Rent Payment Reminder',
    },
    messageTemplate: {
      type: String,
      required: true,
      default:
        'Hello {{tenant_name}}, your rent of {{rent_amount}} for {{property_name}} is due on {{due_date}}. Please make the payment before the due date.',
    },
    channels: {
      inApp: {
        type: Boolean,
        default: true,
      },
      push: {
        type: Boolean,
        default: true,
      },
      sms: {
        type: Boolean,
        default: false,
      },
      email: {
        type: Boolean,
        default: false,
      },
    },
    lastRunAt: {
      type: Date,
      default: null,
    },
    sentCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.NotificationAutomation ||
  mongoose.model('NotificationAutomation', notificationAutomationSchema);
