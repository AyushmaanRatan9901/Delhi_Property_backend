/**
 * CRM Socket.io Real-time Event Broadcaster
 * Dispatches real-time updates to Super Admin, Admin, and individual Tele-callers.
 */

const { emitToRole, emitToUser, broadcast } = require('../../config/socket');

class CRMSocketService {
  /**
   * Dispatches event to Super Admin and Admin rooms, and optionally to the assigned caller
   */
  emitCRMEvent(event, data, targetUserId = null) {
    try {
      // 1. Always alert Super Admin & Admin
      emitToRole('super_admin', event, data);
      emitToRole('admin', event, data);

      // 2. Alert specific user if applicable
      if (targetUserId) {
        emitToUser(targetUserId, event, data);
      }
    } catch (err) {
      console.error(`[CRMSocketService] Error emitting "${event}":`, err.message);
    }
  }

  // Lead Lifecycle Events
  leadNew(lead) {
    this.emitCRMEvent('crm:lead:new', { lead });
  }

  leadUpdated(lead) {
    this.emitCRMEvent('crm:lead:updated', { lead });
  }

  leadAssigned(lead, assignedToUserId) {
    this.emitCRMEvent('crm:lead:assigned', { lead, assignedTo: assignedToUserId }, assignedToUserId);
  }

  leadReassigned(lead, fromUserId, toUserId) {
    this.emitCRMEvent('crm:lead:reassigned', { lead, from: fromUserId, to: toUserId }, toUserId);
    if (fromUserId) {
      emitToUser(fromUserId, 'crm:lead:unassigned', { leadId: lead._id || lead.leadId });
    }
  }

  leadStatusChanged(lead, fromStatus, toStatus) {
    this.emitCRMEvent('crm:lead:status_changed', {
      leadId: lead._id || lead.leadId,
      leadName: lead.name,
      from: fromStatus,
      to: toStatus,
    }, lead.assignedTo);
  }

  // Call Events
  callStarted(call) {
    this.emitCRMEvent('crm:call:started', { call });
  }

  callCompleted(call) {
    this.emitCRMEvent('crm:call:completed', { call });
  }

  // Follow-up Events
  followupCreated(followUp) {
    this.emitCRMEvent('crm:followup:created', { followUp }, followUp.assignedTo);
  }

  followupOverdue(followUp) {
    this.emitCRMEvent('crm:followup:overdue', { followUp }, followUp.assignedTo);
  }

  followupCompleted(followUp) {
    this.emitCRMEvent('crm:followup:completed', { followUp }, followUp.assignedTo);
  }

  // Site Visit Events
  siteVisitCreated(siteVisit) {
    this.emitCRMEvent('crm:sitevisit:created', { siteVisit }, siteVisit.assignedFieldAgent);
  }

  siteVisitUpdated(siteVisit) {
    this.emitCRMEvent('crm:sitevisit:updated', { siteVisit }, siteVisit.assignedFieldAgent);
  }

  siteVisitCompleted(siteVisit) {
    this.emitCRMEvent('crm:sitevisit:completed', { siteVisit }, siteVisit.assignedFieldAgent);
  }

  // Handoff Events
  handoffCreated(handoff) {
    this.emitCRMEvent('crm:handoff:created', { handoff });
  }

  handoffAccepted(handoff) {
    this.emitCRMEvent('crm:handoff:accepted', { handoff }, handoff.teleCaller);
  }

  handoffRejected(handoff) {
    this.emitCRMEvent('crm:handoff:rejected', { handoff }, handoff.teleCaller);
  }

  // Caller Performance & Status
  callerStatusChanged(callerId, status) {
    this.emitCRMEvent('crm:caller:status_changed', { callerId, status }, callerId);
  }

  callerActivity(callerId, activity) {
    this.emitCRMEvent('crm:caller:activity', { callerId, activity });
  }

  // TV Showcase Events
  tvShowcaseUpdate(showcaseId, data) {
    broadcast('crm:tv:showcase:update', { showcaseId, ...data });
  }

  tvShowcasePlay(showcaseId, propertyIndex) {
    broadcast('crm:tv:showcase:play', { showcaseId, propertyIndex });
  }

  tvShowcaseNext(showcaseId, propertyIndex) {
    broadcast('crm:tv:showcase:next', { showcaseId, propertyIndex });
  }

  tvShowcasePrevious(showcaseId, propertyIndex) {
    broadcast('crm:tv:showcase:previous', { showcaseId, propertyIndex });
  }

  tvShowcaseRemove(showcaseId) {
    broadcast('crm:tv:showcase:remove', { showcaseId });
  }
}

module.exports = new CRMSocketService();
