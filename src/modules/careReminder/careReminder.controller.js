'use strict';

const service = require('./careReminder.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.enableReminders = async (req, res) => {
  const result = await service.enableReminders(
    req.params.id, req.query.patientId, req.user.userId, req.tenantSlug,
  );
  res.status(201).json(ApiResponse.created('Care reminders enabled', result));
};

exports.disableReminders = async (req, res) => {
  const result = await service.disableReminders(
    req.params.id, req.query.patientId, req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Care reminders disabled', result));
};

exports.listCareTasks = async (req, res) => {
  const result = await service.listCareTasks(
    req.query, req.query.patientId, req.user.userId, req.tenantSlug,
  );
  const { items, total, page, limit } = result;
  res.json(ApiResponse.paginated('Care tasks retrieved', items, { total, page, limit }));
};

exports.listTaskReminders = async (req, res) => {
  const result = await service.listTaskReminders(
    req.params.taskId, req.query, req.query.patientId, req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Task reminders retrieved', result));
};

exports.respondToReminder = async (req, res) => {
  const result = await service.respondToReminder(
    req.params.taskId, req.params.id, req.body,
    req.query.patientId, req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Reminder response recorded', result));
};

exports.getPatientCompliance = async (req, res) => {
  const result = await service.getPatientCompliance(
    req.params.patientId, req.query, req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Patient compliance retrieved', result));
};

exports.toggleTaskReminder = async (req, res) => {
  const result = await service.toggleTaskReminder(
    req.params.taskId, req.query.patientId, req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Task reminder toggled', result));
};

exports.getDailyCareSchedule = async (req, res) => {
  const result = await service.getDailyCareSchedule(
    req.query.patientId, req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Daily care schedule retrieved', result));
};

exports.getGuardianDependentCompliance = async (req, res) => {
  const result = await service.getGuardianDependentCompliance(
    req.params.dependentId, req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Dependent compliance retrieved', result));
};

exports.getGuardianDependentDailySchedule = async (req, res) => {
  const result = await service.getGuardianDependentDailySchedule(
    req.params.dependentId, req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Dependent daily schedule retrieved', result));
};

exports.respondToReminderAsGuardian = async (req, res) => {
  const result = await service.respondToReminderAsGuardian(
    req.params.dependentId, req.params.taskId, req.params.id, req.body,
    req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Guardian reminder response recorded', result));
};

exports.toggleTaskReminderAsGuardian = async (req, res) => {
  const result = await service.toggleTaskReminderAsGuardian(
    req.params.dependentId, req.params.taskId,
    req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Guardian task reminder toggled', result));
};

exports.toggleTaskReminderAsDoctor = async (req, res) => {
  const result = await service.toggleTaskReminderAsDoctor(
    req.params.patientId, req.params.taskId,
    req.tenantSlug,
  );
  res.json(ApiResponse.success('Doctor task reminder toggled', result));
};

exports.updateNotificationPreference = async (req, res) => {
  const result = await service.updateNotificationPreference(
    req.query.patientId, req.body.preferredChannel, req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Notification preference updated', result));
};

exports.enableRemindersAsStaff = async (req, res) => {
  const result = await service.enableRemindersAsStaff(
    req.params.prescriptionId, req.params.patientId, req.tenantSlug,
  );
  res.status(201).json(ApiResponse.created('Care reminders enabled', result));
};

exports.disableRemindersAsStaff = async (req, res) => {
  const result = await service.disableRemindersAsStaff(
    req.params.prescriptionId, req.params.patientId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Care reminders disabled', result));
};

exports.batchRespondToReminders = async (req, res) => {
  const result = await service.batchRespondToReminders(
    req.body.responses, req.query.patientId, req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Batch reminder response recorded', result));
};

exports.batchRespondToRemindersAsGuardian = async (req, res) => {
  const result = await service.batchRespondToRemindersAsGuardian(
    req.params.dependentId, req.body.responses, req.user.userId, req.tenantSlug,
  );
  res.json(ApiResponse.success('Guardian batch reminder response recorded', result));
};
