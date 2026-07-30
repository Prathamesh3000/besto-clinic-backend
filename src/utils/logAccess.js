'use strict';

/**
 * Shared access-logging utility for the patient audit trail.
 *
 * Fire-and-forget — NEVER breaks the main request flow.
 * Self-view entries (patient viewing their own records) are silently skipped.
 */
function logAccess(conn, { patient, accessedBy, accessType, resource, resourceId, description, metadata, ipAddress, userAgent, shareToken }) {
  // Skip self-view — patient viewing their own records is noise in the audit trail.
  // Mutations (create, update, cancel, share, etc.) are always logged.
  if (accessedBy && accessType === 'view') {
    const Patient = conn.model('Patient');
    Patient.findById(patient).select('user').lean()
      .then(patDoc => {
        if (patDoc?.user && patDoc.user.toString() === accessedBy.toString()) return; // self-view, skip
        const AccessLog = conn.model('AccessLog');
        AccessLog.create({ patient, accessedBy, accessType, resource, resourceId, description, metadata, ipAddress, userAgent, shareToken })
          .catch(() => {});
      })
      .catch(() => {});
    return;
  }

  const AccessLog = conn.model('AccessLog');
  AccessLog.create({ patient, accessedBy, accessType, resource, resourceId, description, metadata, ipAddress, userAgent, shareToken })
    .catch(() => { /* audit logging must never break the main flow */ });
}

module.exports = { logAccess };
