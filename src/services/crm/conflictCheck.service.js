/**
 * Site Visit Conflict Detection Service
 * Prevents double bookings for field agents, properties, and prospective clients.
 */

const CRMSiteVisit = require('../../models/crm/SiteVisit');

const VISIT_BUFFER_MINUTES = 60; // 1-hour window for each site visit

class ConflictCheckService {
  /**
   * Checks for scheduling conflicts before booking or rescheduling a site visit
   */
  async checkSiteVisitConflicts({
    scheduledAt,
    assignedFieldAgentId,
    propertyId,
    leadId,
    excludeVisitId = null,
  }) {
    const targetDate = new Date(scheduledAt);
    const windowStart = new Date(targetDate.getTime() - VISIT_BUFFER_MINUTES * 60 * 1000);
    const windowEnd = new Date(targetDate.getTime() + VISIT_BUFFER_MINUTES * 60 * 1000);

    const baseQuery = {
      status: { $in: ['requested', 'confirmed', 'agent_assigned', 'in_progress'] },
      scheduledAt: { $gte: windowStart, $lte: windowEnd },
    };

    if (excludeVisitId) {
      baseQuery._id = { $ne: excludeVisitId };
    }

    const conflicts = [];

    // 1. Check Field Agent Availability
    if (assignedFieldAgentId) {
      const agentConflict = await CRMSiteVisit.findOne({
        ...baseQuery,
        assignedFieldAgent: assignedFieldAgentId,
      }).populate('lead', 'name phone').populate('property', 'locality leadId');

      if (agentConflict) {
        conflicts.push({
          type: 'FIELD_AGENT_BUSY',
          message: `Field agent is already scheduled for another visit at ${new Date(
            agentConflict.scheduledAt
          ).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
          conflictVisitId: agentConflict.visitId || agentConflict._id,
        });
      }
    }

    // 2. Check Property Slot Overlap
    if (propertyId) {
      const propertyConflict = await CRMSiteVisit.findOne({
        ...baseQuery,
        property: propertyId,
      });

      if (propertyConflict) {
        conflicts.push({
          type: 'PROPERTY_SLOT_BOOKED',
          message: `Property already has a scheduled visit at ${new Date(
            propertyConflict.scheduledAt
          ).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
          conflictVisitId: propertyConflict.visitId || propertyConflict._id,
        });
      }
    }

    // 3. Check Client/Lead Overlap
    if (leadId) {
      const leadConflict = await CRMSiteVisit.findOne({
        ...baseQuery,
        lead: leadId,
      });

      if (leadConflict) {
        conflicts.push({
          type: 'LEAD_SCHEDULE_CONFLICT',
          message: `Client already has another visit scheduled within this time window`,
          conflictVisitId: leadConflict.visitId || leadConflict._id,
        });
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  }
}

module.exports = new ConflictCheckService();
