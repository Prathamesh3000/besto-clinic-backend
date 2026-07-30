'use strict';

/**
 * Tenant model registry — exports raw Mongoose schemas (NOT models).
 *
 * The tenantConnectionManager registers these schemas on each
 * tenant's isolated connection via conn.model(name, schema).
 */

module.exports = {
  User:                  require('./User'),
  Patient:               require('./Patient'),
  Appointment:           require('./Appointment'),
  TreatmentRecord:       require('./TreatmentRecord'),
  Invoice:               require('./Invoice'),
  Branch:                require('./Branch'),
  Department:            require('./Department'),
  InsuranceProvider:      require('./InsuranceProvider'),
  InsuranceClaim:        require('./InsuranceClaim'),
  SalaryStructure:       require('./SalaryStructure'),
  Payslip:               require('./Payslip'),
  Notification:          require('./Notification'),
  LegacyUpload:          require('./LegacyUpload'),
  IntegrationCredential: require('./IntegrationCredential'),
  SyncLog:               require('./SyncLog'),
  Prescription:          require('./Prescription'),
  Consent:               require('./Consent'),
  QueueEntry:            require('./QueueEntry'),
  EmergencySession:      require('./EmergencySession'),
  ShareToken:            require('./ShareToken'),
  AccessLog:             require('./AccessLog'),
  Review:                require('./Review'),

  // ── Telemedicine ────────────────────────────────
  VideoSession:          require('./VideoSession'),
  ChatMessage:           require('./ChatMessage'),

  // ── AI Dental Scan ─────────────────────────────────
  DentalScan:            require('./DentalScan'),
  DentalScanResult:      require('./DentalScanResult'),

  // ── Care Reminders ────────────────────────────────
  PrescriptionTask:      require('./PrescriptionTask'),
  CareReminder:          require('./CareReminder'),
  ComplianceAlert:       require('./ComplianceAlert'),

  // ── Inventory Management ────────────────────────
  InventoryItem:         require('./InventoryItem'),
  InventoryTransaction:  require('./InventoryTransaction'),

  // ── Vendor & Purchase Orders ──────────────────
  Vendor:                require('./Vendor'),
  PurchaseOrder:         require('./PurchaseOrder'),

  // ── Consultation Templates ─────────────────────
  ConsultationTemplate:  require('./ConsultationTemplate'),

  // ── Doctor Scheduling ──────────────────────────
  DoctorSchedule:         require('./DoctorSchedule'),
  DoctorScheduleOverride: require('./DoctorScheduleOverride'),
  DoctorLeave:            require('./DoctorLeave'),

  // ── Clinic Operations ─────────────────────────
  ClinicHoliday:          require('./ClinicHoliday'),
  ClinicBookingPolicy:    require('./ClinicBookingPolicy'),

  // ── Calendar Feeds ───────────────────────────
  CalendarFeed:           require('./CalendarFeed'),

  // ── Rooms ─────────────────────────────────────
  ConsultationRoom:      require('./ConsultationRoom'),

  // ── Guardian / Dependent ─────────────────────────
  GuardianConsent:       require('./GuardianConsent'),
  DependentArchive:      require('./DependentArchive'),

  // ── Role Master ─────────────────────────────────
  Role:                  require('./Role'),

  // ── Billing & Payments ──────────────────────────
  Payment:               require('./Payment'),
  CreditNote:            require('./CreditNote'),
  CashRegister:          require('./CashRegister'),
  ServiceItem:           require('./ServiceItem'),
  PatientLedger:         require('./PatientLedger'),
  FinancialAuditLog:     require('./FinancialAuditLog'),
};
