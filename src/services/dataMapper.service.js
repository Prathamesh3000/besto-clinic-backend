'use strict';

/**
 * Data Mapper Service — maps external vendor schemas to internal BestoClinic schemas.
 * Each vendor has specific field mappings normalized to our Patient / TreatmentRecord models.
 */

// ─── RioView Mappers ─────────────────────────────────

/**
 * Map a RioView patient record to internal Patient fields.
 * @param {object} ext - external patient from RioView API
 * @returns {object} - data ready for Patient.create() or findOneAndUpdate()
 */
function mapRioViewPatient(ext) {
  return {
    name: [ext.firstName, ext.lastName].filter(Boolean).join(' ') || ext.name || 'Unknown',
    email: ext.email || undefined,
    phone: ext.phone || ext.mobilePhone || ext.telephone || '',
    dateOfBirth: ext.dateOfBirth ? new Date(ext.dateOfBirth) : undefined,
    gender: _normalizeGender(ext.gender),
    address: {
      street: ext.address?.street || ext.streetAddress || '',
      city: ext.address?.city || ext.city || '',
      state: ext.address?.state || ext.state || '',
      zipCode: ext.address?.zipCode || ext.postalCode || '',
      country: ext.address?.country || 'IN',
    },
    medicalHistory: {
      allergies: ext.allergies || [],
      conditions: ext.medicalConditions || [],
      notes: ext.medicalNotes || '',
    },
    externalId: String(ext.id || ext.patientId),
    externalSource: 'rioview',
    externalLastSyncAt: new Date(),
  };
}

/**
 * Map a RioView treatment record to internal TreatmentRecord fields.
 */
function mapRioViewTreatmentRecord(ext, internalPatientId) {
  return {
    patient: internalPatientId,
    diagnosis: ext.diagnosis || ext.description || 'External record',
    treatment: ext.treatment || ext.procedure || ext.description || 'Synced from RioView',
    teeth: (ext.teeth || []).map((t) => ({
      number: t.number || t.toothNumber,
      condition: t.condition || '',
      procedure: t.procedure || '',
    })),
    notes: ext.notes || ext.remarks || '',
    attachments: (ext.attachments || ext.images || []).map((a) => ({
      fileName: a.fileName || a.name || 'attachment',
      fileUrl: a.url || a.fileUrl || '',
      fileType: a.type || a.mimeType || '',
    })),
    externalId: String(ext.id || ext.recordId),
    externalSource: 'rioview',
    externalLastSyncAt: new Date(),
  };
}

// ─── Romexis Mappers ─────────────────────────────────

/**
 * Map a Romexis patient record to internal Patient fields.
 */
function mapRomexisPatient(ext) {
  return {
    name: [ext.givenName, ext.familyName].filter(Boolean).join(' ') || ext.patientName || 'Unknown',
    email: ext.emailAddress || undefined,
    phone: ext.phoneNumber || ext.mobile || '',
    dateOfBirth: ext.birthDate ? new Date(ext.birthDate) : undefined,
    gender: _normalizeGender(ext.sex || ext.gender),
    address: {
      street: ext.streetAddress || '',
      city: ext.city || '',
      state: ext.region || '',
      zipCode: ext.postalCode || '',
      country: ext.country || 'IN',
    },
    medicalHistory: {
      allergies: ext.allergies || [],
      conditions: ext.diseases || [],
      notes: ext.anamnesis || '',
    },
    externalId: String(ext.patientId || ext.id),
    externalSource: 'romexis',
    externalLastSyncAt: new Date(),
  };
}

/**
 * Map a Romexis treatment/examination record to internal TreatmentRecord fields.
 */
function mapRomexisTreatmentRecord(ext, internalPatientId) {
  return {
    patient: internalPatientId,
    diagnosis: ext.diagnosis || ext.finding || 'External record',
    treatment: ext.procedure || ext.examinationType || 'Synced from Romexis',
    teeth: (ext.teeth || []).map((t) => ({
      number: t.toothNumber || t.number,
      condition: t.finding || '',
      procedure: t.procedure || '',
    })),
    notes: ext.comments || ext.notes || '',
    attachments: (ext.images || ext.files || []).map((a) => ({
      fileName: a.filename || a.name || 'attachment',
      fileUrl: a.url || a.downloadUrl || '',
      fileType: a.mimeType || a.type || '',
    })),
    externalId: String(ext.examinationId || ext.id),
    externalSource: 'romexis',
    externalLastSyncAt: new Date(),
  };
}

// ─── Validators ──────────────────────────────────────

/**
 * Validate mapped patient data before insert.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateMappedPatient(mapped) {
  const errors = [];
  if (!mapped.name || mapped.name === 'Unknown') errors.push('Missing patient name');
  if (!mapped.phone) errors.push('Missing phone number');
  if (!mapped.externalId) errors.push('Missing external ID');
  return { valid: errors.length === 0, errors };
}

/**
 * Validate mapped treatment record data before insert.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateMappedTreatmentRecord(mapped) {
  const errors = [];
  if (!mapped.patient) errors.push('Missing patient reference');
  if (!mapped.diagnosis) errors.push('Missing diagnosis');
  if (!mapped.externalId) errors.push('Missing external ID');
  return { valid: errors.length === 0, errors };
}

// ─── Helpers ─────────────────────────────────────────

function _normalizeGender(value) {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v === 'm' || v === 'male') return 'male';
  if (v === 'f' || v === 'female') return 'female';
  if (v === 'o' || v === 'other') return 'other';
  return 'prefer_not_to_say';
}

module.exports = {
  mapRioViewPatient,
  mapRioViewTreatmentRecord,
  mapRomexisPatient,
  mapRomexisTreatmentRecord,
  validateMappedPatient,
  validateMappedTreatmentRecord,
};
