'use strict';

const service = require('./patientPortal.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.getProfiles = async (req, res) => {
  const result = await service.getPatientProfiles(req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Patient profiles retrieved', result));
};

exports.getProfile = async (req, res) => {
  const result = await service.getPatientProfile(req.params.patientId, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Patient profile retrieved', result));
};

exports.getDashboard = async (req, res) => {
  const result = await service.getPortalDashboard(req.params.patientId, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Portal dashboard retrieved', result));
};

exports.listAppointments = async (req, res) => {
  const result = await service.listPatientAppointments(req.query, req.query.patientId, req.user.userId, req.tenantSlug);
  const { items, total, page, limit } = result;
  res.json(ApiResponse.paginated('Appointments retrieved', items, { total, page, limit }));
};

exports.getAppointment = async (req, res) => {
  const result = await service.getAppointmentById(req.params.id, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Appointment retrieved', result));
};

exports.bookAppointment = async (req, res) => {
  const result = await service.bookAppointment(req.body, req.body.patientId, req.user.userId, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Appointment booked', result));
};

exports.cancelAppointment = async (req, res) => {
  const result = await service.cancelAppointment(req.params.id, req.body.reason, req.query.patientId, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Appointment cancelled', result));
};

exports.rescheduleAppointment = async (req, res) => {
  const result = await service.rescheduleAppointment(req.params.id, req.body.scheduledAt, req.query.patientId, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Appointment rescheduled', result));
};

exports.createEmergency = async (req, res) => {
  const result = await service.createEmergencyRequest(req.body, req.body.patientId, req.user.userId, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Emergency request created', result));
};

exports.listPrescriptions = async (req, res) => {
  const result = await service.listPrescriptions(req.query, req.query.patientId, req.user.userId, req.tenantSlug);
  const { items, total, page, limit } = result;
  res.json(ApiResponse.paginated('Prescriptions retrieved', items, { total, page, limit }));
};

exports.getMedicalHistory = async (req, res) => {
  const result = await service.getMedicalHistory(req.query, req.query.patientId, req.user.userId, req.tenantSlug);
  const { items, total, page, limit } = result;
  res.json(ApiResponse.paginated('Medical history retrieved', items, { total, page, limit }));
};

exports.getConsultationDetail = async (req, res) => {
  const result = await service.getConsultationDetail(req.params.appointmentId, req.query.patientId, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Consultation details retrieved', result));
};

exports.listPayments = async (req, res) => {
  const result = await service.listPayments(req.query, req.query.patientId, req.user.userId, req.tenantSlug);
  const { items, total, page, limit } = result;
  res.json(ApiResponse.paginated('Payments retrieved', items, { total, page, limit }));
};

exports.initiatePayment = async (req, res) => {
  const result = await service.initiatePayment(req.params.invoiceId, req.query.patientId, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Payment initiated', result));
};

exports.verifyInvoicePayment = async (req, res) => {
  const result = await service.verifyInvoicePayment(req.body, req.body.patientId, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Payment verified', result));
};

exports.createShareToken = async (req, res) => {
  const result = await service.createShareToken(req.body, req.body.patientId, req.user.userId, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Share token created', result));
};

exports.listShareTokens = async (req, res) => {
  const result = await service.listShareTokens(req.query.patientId, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Share tokens retrieved', result));
};

exports.revokeShareToken = async (req, res) => {
  const result = await service.revokeShareToken(req.params.tokenId, req.query.patientId, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Share token revoked', result));
};

exports.viewSharedRecord = async (req, res) => {
  const result = await service.viewSharedRecord(req.params.token, req.query.tenant, req.ip, req.get('user-agent'));
  res.json(ApiResponse.success('Shared record retrieved', result));
};

exports.listConsents = async (req, res) => {
  const result = await service.listConsents(req.query.patientId, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Consents retrieved', result));
};

exports.approveConsent = async (req, res) => {
  const result = await service.approveConsent(req.params.id, req.query.patientId, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Consent approved', result));
};

exports.revokeConsent = async (req, res) => {
  const result = await service.revokePatientConsent(req.params.id, req.query.patientId, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Consent revoked', result));
};

exports.updateProfile = async (req, res) => {
  const result = await service.updatePatientProfile(req.params.patientId, req.body, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Profile updated', result));
};

exports.uploadInsurance = async (req, res) => {
  const result = await service.uploadInsuranceDoc(req.body, req.body.patientId, req.user.userId, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Insurance document uploaded', result));
};

exports.submitReview = async (req, res) => {
  const result = await service.submitReview(req.body, req.body.patientId, req.user.userId, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Review submitted', result));
};

exports.listReviews = async (req, res) => {
  const result = await service.listPatientReviews(req.query, req.query.patientId, req.user.userId, req.tenantSlug);
  const { items, total, page, limit } = result;
  res.json(ApiResponse.paginated('Reviews retrieved', items, { total, page, limit }));
};

exports.getAccessLog = async (req, res) => {
  const result = await service.getAccessLog(req.query, req.query.patientId, req.user.userId, req.tenantSlug);
  const { items, total, page, limit } = result;
  res.json(ApiResponse.paginated('Access log retrieved', items, { total, page, limit }));
};

// ── Financial & Billing ─────────────────────────────────────────────

exports.financialSummary = async (req, res) => {
  const data = await service.getPatientFinancialSummary(req.params.patientId, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Financial summary retrieved', data));
};

exports.ledger = async (req, res) => {
  const patientId = req.query.patientId;
  const { items, total, page, limit } = await service.getPatientLedger(patientId, req.query, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.paginated('Ledger entries retrieved', items, { page, limit, total }));
};

exports.creditNotes = async (req, res) => {
  const patientId = req.query.patientId;
  const { items, total, page, limit } = await service.getPatientCreditNotes(patientId, req.query, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.paginated('Credit notes retrieved', items, { page, limit, total }));
};

exports.invoicePdf = async (req, res) => {
  const patientId = req.query.patientId;
  const pdfBuffer = await service.downloadPatientInvoicePdf(req.params.invoiceId, patientId, req.user.userId, req.tenantSlug);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="invoice-${req.params.invoiceId}.pdf"`,
    'Content-Length': pdfBuffer.length,
  });
  res.send(pdfBuffer);
};

exports.confirmAttendance = async (req, res) => {
  const result = await service.confirmAttendance(
    req.params.id, req.body.status, req.query.patientId, req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Attendance confirmation updated', result));
};

exports.verifyAppointmentPayment = async (req, res) => {
  const result = await service.verifyAppointmentPayment(req.body, req.body.patientId, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Payment verified', result));
};

// ── Dependent Management (Guardian) ───────────────────────────────

exports.becomeGuardian = async (req, res) => {
  const result = await service.becomeGuardian(
    req.user.userId, req.tenantSlug, req.body.consentAccepted,
  );
  res.json(ApiResponse.success(
    result.alreadyGuardian ? 'Already a guardian account' : 'Account upgraded to guardian',
    result,
  ));
};

exports.listDependents = async (req, res) => {
  const result = await service.listDependents(req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Dependents retrieved', result));
};

exports.createDependent = async (req, res) => {
  const result = await service.createDependent(
    req.body, req.user.userId, req.tenantSlug, req.ip,
  );
  res.status(201).json(ApiResponse.created('Dependent added', result));
};

exports.updateDependent = async (req, res) => {
  const result = await service.updateDependent(req.params.dependentId, req.body, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Dependent updated', result));
};

exports.detachDependent = async (req, res) => {
  const result = await service.detachDependent(req.params.dependentId, req.body, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Dependent detached successfully', result));
};

exports.listDependentArchives = async (req, res) => {
  const result = await service.listDependentArchives(req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Dependent archives', result));
};

exports.getDependentArchive = async (req, res) => {
  const result = await service.getDependentArchive(req.params.id, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Archive detail', result));
};

exports.getDependentConsent = async (req, res) => {
  const result = await service.getDependentConsent(req.params.dependentId, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Consent record', result));
};

exports.updateDependentNotifications = async (req, res) => {
  const result = await service.updateDependentNotificationPrefs(req.params.dependentId, req.body, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Notification preferences updated', result));
};

// ── Check-in & Queue ──────────────────────────────────────────────

exports.checkIn = async (req, res) => {
  const result = await service.checkInAppointment(
    req.params.id, req.query.patientId, req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Checked in successfully', result));
};

exports.getQueuePosition = async (req, res) => {
  const result = await service.getQueuePosition(
    req.params.appointmentId, req.query.patientId, req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Queue position retrieved', result));
};

// ── Clinic browsing (for appointment booking) ─────────────────────

exports.listDepartments = async (req, res) => {
  const result = await service.listAvailableDepartments(req.tenantSlug);
  const { items, total, page, limit } = result;
  res.json(ApiResponse.paginated('Departments retrieved', items, { total, page, limit }));
};

exports.listDoctors = async (req, res) => {
  const result = await service.listAvailableDoctors(req.query, req.tenantSlug);
  const { items, total, page, limit } = result;
  res.json(ApiResponse.paginated('Doctors retrieved', items, { total, page, limit }));
};

exports.getDoctor = async (req, res) => {
  const result = await service.getAvailableDoctor(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Doctor retrieved', result));
};

exports.getDoctorAvailabilitySummary = async (req, res) => {
  const { month, year, branch } = req.query;
  if (!month || !year) {
    return res.status(400).json(ApiResponse.error('month and year query parameters are required'));
  }
  const availabilityService = require('../../services/availability.service');
  const result = await availabilityService.getMonthlyAvailabilitySummary(
    req.params.id,
    parseInt(month, 10),
    parseInt(year, 10),
    req.tenantSlug,
    branch || null,
  );
  res.json(ApiResponse.success('Availability summary fetched', result));
};
