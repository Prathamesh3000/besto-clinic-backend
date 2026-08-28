'use strict';

const service = require('./doctorDashboard.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.getStats = async (req, res) => {
  const data = await service.getDoctorDashboardStats(req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Doctor dashboard stats', data));
};

exports.startConsultation = async (req, res) => {
  const result = await service.startConsultation(req.body, req.user.userId, req.tenantSlug, req.user.role);
  res.status(201).json(ApiResponse.created('Consultation started', result));
};

exports.getCurrentRoom = async (req, res) => {
  const room = await service.getDoctorCurrentRoom(req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success(room ? 'Current room found' : 'No room assigned', room));
};

exports.updateConsultation = async (req, res) => {
  const record = await service.updateConsultation(req.params.id, req.body, req.user.userId, req.tenantSlug, req.user.role);
  res.json(ApiResponse.success('Consultation updated', record));
};

exports.completeConsultation = async (req, res) => {
  // Inject client IP into signature metadata
  if (req.body.doctorSignature) {
    req.body.doctorSignature.ipAddress = req.ip;
  }
  const result = await service.completeConsultation(req.params.id, req.body, req.user.userId, req.tenantSlug, req.user.role);
  res.json(ApiResponse.success('Consultation completed', result));
};

exports.uploadAttachment = async (req, res) => {
  const attachment = await service.uploadAttachment(req.body, req.user.userId, req.tenantSlug, req.user.role);
  res.status(201).json(ApiResponse.created('Attachment uploaded', attachment));
};

exports.listAttachments = async (req, res) => {
  const attachments = await service.listAttachments(req.params.treatmentId, req.user.userId, req.tenantSlug, req.user.role);
  res.json(ApiResponse.success('Attachments retrieved', attachments));
};

exports.createFollowUp = async (req, res) => {
  const result = await service.createFollowUp(req.body, req.user.userId, req.tenantSlug, req.user.role);
  res.status(201).json(ApiResponse.created('Follow-up scheduled', result));
};

exports.getProfile = async (req, res) => {
  const data = await service.getDoctorProfile(req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Doctor profile retrieved', data));
};

exports.updateProfile = async (req, res) => {
  const updated = await service.updateDoctorProfile(req.user.userId, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Profile updated', updated));
};

exports.getConsultationByAppointment = async (req, res) => {
  const record = await service.getConsultationByAppointment(req.params.appointmentId, req.user.userId, req.tenantSlug, req.user.role);
  res.json(ApiResponse.success('Consultation retrieved', record));
};

exports.listConsultations = async (req, res) => {
  const { ROLE_GROUPS } = require('../../config/constants');
  const isAdmin = ROLE_GROUPS.ADMIN.includes(req.user.role);
  // Admins can view all consultations or filter by a specific doctor
  const doctorId = (isAdmin && req.query.doctor) ? req.query.doctor : (isAdmin && !req.query.doctor) ? null : req.user.userId;
  const result = await service.listConsultations(req.query, doctorId, req.tenantSlug, req.user.userId, req.user.role);
  const response = ApiResponse.paginated('Consultations retrieved', result.items, {
    total: result.total, page: result.page, limit: result.limit,
  });
  // Attach stat counts so frontend doesn't compute them from a single page
  response.meta.inProgressCount = result.inProgressCount;
  response.meta.completedCount = result.completedCount;
  res.json(response);
};

exports.listMyPatients = async (req, res) => {
  const result = await service.listDoctorPatients(req.query, req.user.userId, req.tenantSlug, req.user.role);
  res.json(ApiResponse.paginated('Doctor patients retrieved', result.items, {
    total: result.total, page: result.page, limit: result.limit,
  }));
};

exports.getComplianceSummary = async (req, res) => {
  const result = await service.getDoctorComplianceSummary(req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Doctor compliance summary', result));
};

exports.listCareTasks = async (req, res) => {
  const { ROLE_GROUPS } = require('../../config/constants');
  const isAdmin = ROLE_GROUPS.ADMIN.includes(req.user.role);
  const doctorId = isAdmin && req.query.doctor ? req.query.doctor : req.user.userId;
  const result = await service.listDoctorCareTasks(doctorId, req.tenantSlug, req.query);
  res.json(ApiResponse.paginated('Care tasks retrieved', result.tasks, result.pagination));
};

exports.sendCareSummary = async (req, res) => {
  const result = await service.sendCareSummaryForPatient(req.user.userId, req.params.patientId, req.tenantSlug);
  res.json(ApiResponse.success('Care summary sent', result));
};
