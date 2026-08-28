'use strict';

const router = require('express').Router();
const ctrl = require('./auth.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authLimiter } = require('../../middleware/rateLimiter');
const {
  registerSchema, loginSchema, refreshSchema,
  forgotPasswordSchema, resetPasswordSchema, registerDeviceSchema,
  reminderSettingsSchema, testNotificationSchema,
} = require('./auth.validator');

// Platform login (NO tenant context required)
router.post('/platform/login', authLimiter(), validate(loginSchema), asyncHandler(ctrl.platformLogin));

// All other auth routes need tenant context
router.use(tenantResolver());

// Public — rate-limited. These were left uncommented-out, leaving credential
// stuffing and password-reset abuse unthrottled. authLimiter() is a no-op
// against Redis in development only because the global limiter is skipped there;
// these stay on so the brute-force path is always covered.
router.post('/register',        authLimiter(), validate(registerSchema),       asyncHandler(ctrl.register));
router.post('/login',           authLimiter(), validate(loginSchema),          asyncHandler(ctrl.login));
router.post('/refresh',         authLimiter(), validate(refreshSchema),        asyncHandler(ctrl.refresh));
router.post('/forgot-password', authLimiter(), validate(forgotPasswordSchema), asyncHandler(ctrl.forgotPassword));
router.post('/reset-password',  authLimiter(), validate(resetPasswordSchema),  asyncHandler(ctrl.resetPassword));

// Protected — tenantResolver() is called again AFTER authenticate() so that
// the cross-check (JWT tenantSlug vs header) runs with req.user already set.
// The earlier router.use(tenantResolver()) cannot perform this check because
// req.user does not exist yet at that point.
router.get('/me',              authenticate(), tenantResolver(), asyncHandler(ctrl.me));
router.post('/logout',          authenticate(), tenantResolver(), asyncHandler(ctrl.logout));
router.post('/register-device', authenticate(), tenantResolver(), validate(registerDeviceSchema), asyncHandler(ctrl.registerDevice));
router.put('/reminder-settings', authenticate(), tenantResolver(), validate(reminderSettingsSchema), asyncHandler(ctrl.updateReminderSettings));
router.post('/test-notification', authenticate(), tenantResolver(), validate(testNotificationSchema), asyncHandler(ctrl.testNotification));

module.exports = router;
