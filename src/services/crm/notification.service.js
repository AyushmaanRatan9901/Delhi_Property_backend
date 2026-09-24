const CRMNotification = require('../../models/crm/CRMNotification');
const { emitToUser, emitToRole } = require('../../config/socket');

/**
 * CRM NOTIFICATION SERVICE
 * Creates DB notifications and dispatches instant WebSocket alerts.
 */
const sendCRMNotification = async ({
  recipientId,
  type,
  title,
  message,
  lead = null,
  property = null,
  referenceId = null,
  priority = 'medium',
  broadcastRole = null,
}) => {
  try {
    let notification = null;

    if (recipientId) {
      notification = await CRMNotification.create({
        recipient: recipientId,
        type,
        title,
        message,
        lead,
        property,
        referenceId: referenceId ? String(referenceId) : undefined,
        priority,
      });

      emitToUser(recipientId.toString(), 'crm_notification', {
        notification,
      });
    }

    if (broadcastRole) {
      emitToRole(broadcastRole, 'crm_role_notification', {
        type,
        title,
        message,
        lead,
        property,
        referenceId,
        priority,
      });
    }

    return notification;
  } catch (err) {
    console.error('⚠️ [CRMNotification] Error sending notification:', err.message);
    return null;
  }
};

module.exports = { sendCRMNotification };
