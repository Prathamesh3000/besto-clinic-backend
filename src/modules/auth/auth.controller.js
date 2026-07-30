'use strict';

const authService = require('./auth.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.register = async (req, res) => {
  const result = await authService.register(req.body, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Registration successful', result));
};

exports.login = async (req, res) => {
  const result = await authService.login(req.body, req.tenantSlug);
  res.status(200).json(ApiResponse.success('Login successful', result));
};

exports.refresh = async (req, res) => {
  const tokens = await authService.refreshTokens(req.body.refreshToken, req.tenantSlug);
  res.status(200).json(ApiResponse.success('Token refreshed', tokens));
};

exports.logout = async (req, res) => {
  await authService.logout(req.user.jti, req.user.userId, req.body.deviceId);
  res.status(200).json(ApiResponse.success('Logged out successfully'));
};

exports.forgotPassword = async (req, res) => {
  const result = await authService.forgotPassword(req.body.email, req.tenantSlug);

  // In production, send email. For now, return token in dev only.
  if (result && process.env.NODE_ENV === 'development') {
    return res.status(200).json(
      ApiResponse.success('Password reset email sent', { resetToken: result.resetToken }),
    );
  }

  // Always respond 200 to prevent email enumeration
  res.status(200).json(ApiResponse.success('If the email exists, a reset link has been sent'));
};

exports.resetPassword = async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.password, req.tenantSlug);
  res.status(200).json(ApiResponse.success('Password reset successful — please login'));
};

exports.me = async (req, res) => {
  const { getTenantModel } = require('../../db/dbManager');
  const { getRolePermissions } = require('../role/role.service');
  const User = await getTenantModel(req, 'User');
  const user = await User.findById(req.user.userId);
  const permissions = user ? await getRolePermissions(user.role, req.tenantSlug) : [];
  res.status(200).json(ApiResponse.success('Current user', { ...user.toJSON(), permissions }));
};

exports.platformLogin = async (req, res) => {
  const result = await authService.platformLogin(req.body);
  res.status(200).json(ApiResponse.success('Platform login successful', result));
};

exports.registerDevice = async (req, res) => {
  await authService.registerDeviceToken(req.user.userId, req.body, req.tenantSlug);
  res.status(200).json(ApiResponse.success('Device registered'));
};

exports.updateReminderSettings = async (req, res) => {
  const result = await authService.updateReminderSettings(req.user.userId, req.body, req.tenantSlug);
  res.status(200).json(ApiResponse.success('Reminder settings updated', result));
};

exports.testNotification = async (req, res) => {
  const fcmService = require('../../services/fcm.service');
  const { isFirebaseAvailable } = require('../../config/firebase');

  if (!isFirebaseAvailable()) {
    return res.status(503).json(ApiResponse.error('Firebase is not configured on this server'));
  }

  const { type = 'general', title, body } = req.body;

  const payloads = {
    appointment_reminder: {
      title: title || 'Test Appointment Reminder',
      body: body || 'This is a test appointment reminder from BestoClinic. Will you attend?',
      data: {
        type: 'appointment_reminder',
        appointmentId: 'test-appt-000',
        patientId: '',
        doctorName: 'Dr. Test',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        actions: JSON.stringify(['confirm', 'decline']),
      },
    },
    care_reminder: {
      title: title || 'Test Care Reminder: Take Medicine',
      body: body || 'This is a test care reminder from BestoClinic.',
      data: {
        type: 'care_reminder',
        reminderId: 'test-reminder-000',
        taskId: 'test-task-000',
        prescriptionId: '',
        patientId: '',
        taskTitle: 'Take Medicine',
        actions: JSON.stringify(['done', 'skip']),
      },
    },
    general: {
      title: title || 'BestoClinic Test Notification',
      body: body || 'If you can see this, push notifications are working correctly!',
      data: { type: 'general' },
    },
  };

  const payload = payloads[type];
  await fcmService.sendToUser(req.user.userId, req.tenantSlug, payload);

  res.status(200).json(ApiResponse.success(`Test ${type} notification sent`, { type }));
};
