'use strict';

const router = require('express').Router();
const ctrl = require('./telemedicine.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { featureGuard } = require('../../middleware/featureGuard');
const { PERMISSIONS } = require('../../config/permissions');
const {
  createSessionSchema,
  endSessionSchema,
  cancelSessionSchema,
  consentSchema,
  sendMessageSchema,
  shareFileSchema,
  connectionEventSchema,
  declineSessionSchema,
  markReadParamSchema,
  presenceSchema,
  sessionIdParamSchema,
} = require('./telemedicine.validator');

// All routes require auth + tenant context + telehealth feature
router.use(authenticate(), tenantResolver());
router.use(featureGuard('teleHealthEnabled'));

// ── Sessions ─────────────────────────────────────────────────────

// List sessions
router.get('/',
  authorizeAny(PERMISSIONS.TELEMEDICINE_READ, PERMISSIONS.TELEMEDICINE_READ_OWN),
  asyncHandler(ctrl.list),
);

// ── Presence (declared BEFORE /:id so Express does not misroute /presence → /:id) ─

// Doctor sets their presence status (online/busy/dnd/offline)
router.post('/presence',
  authorizeAny(PERMISSIONS.TELEMEDICINE_JOIN),
  validate(presenceSchema),
  asyncHandler(ctrl.setPresence),
);

// Read current presence snapshot (doctors + receptionists)
router.get('/presence',
  authorizeAny(PERMISSIONS.TELEMEDICINE_READ, PERMISSIONS.TELEMEDICINE_READ_OWN),
  asyncHandler(ctrl.getPresenceSnapshot),
);

// Get session by ID
router.get('/:id',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.TELEMEDICINE_READ, PERMISSIONS.TELEMEDICINE_READ_OWN),
  asyncHandler(ctrl.getById),
);

// Create session
router.post('/',
  authorize(PERMISSIONS.TELEMEDICINE_CREATE),
  validate(createSessionSchema),
  asyncHandler(ctrl.create),
);

// Accept session (doctor takes the call)
router.put('/:id/accept',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.TELEMEDICINE_UPDATE),
  asyncHandler(ctrl.accept),
);

// Join session (get room token)
router.post('/:id/join',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.TELEMEDICINE_JOIN),
  asyncHandler(ctrl.join),
);

// End session
router.put('/:id/end',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.TELEMEDICINE_UPDATE, PERMISSIONS.TELEMEDICINE_JOIN),
  validate(endSessionSchema),
  asyncHandler(ctrl.end),
);

// Cancel session
router.put('/:id/cancel',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.TELEMEDICINE_UPDATE, PERMISSIONS.TELEMEDICINE_CREATE),
  validate(cancelSessionSchema),
  asyncHandler(ctrl.cancel),
);

// Decline incoming call (receiver side — different from cancel which is initiator-side)
router.put('/:id/decline',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.TELEMEDICINE_JOIN),
  validate(declineSessionSchema),
  asyncHandler(ctrl.decline),
);

// Extend session duration (adds 15 minutes, max 2 extensions)
router.put('/:id/extend',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.TELEMEDICINE_JOIN),
  asyncHandler(ctrl.extend),
);

// ── Recording Consent ────────────────────────────────────────────

router.put('/:id/consent',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.TELEMEDICINE_JOIN),
  validate(consentSchema),
  asyncHandler(ctrl.updateConsent),
);

// ── Chat ─────────────────────────────────────────────────────────

// Send message
router.post('/:id/messages',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.TELEMEDICINE_JOIN),
  validate(sendMessageSchema),
  asyncHandler(ctrl.sendMessage),
);

// Get messages
router.get('/:id/messages',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.TELEMEDICINE_READ, PERMISSIONS.TELEMEDICINE_READ_OWN),
  asyncHandler(ctrl.getMessages),
);

// Mark a specific message as read
router.post('/:id/messages/:msgId/read',
  validate(markReadParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.TELEMEDICINE_JOIN),
  asyncHandler(ctrl.markMessageRead),
);

// ── File Sharing ─────────────────────────────────────────────────

router.post('/:id/files',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.TELEMEDICINE_JOIN),
  validate(shareFileSchema),
  asyncHandler(ctrl.shareFile),
);

// ── Connection Events ────────────────────────────────────────────

router.post('/:id/events',
  validate(sessionIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.TELEMEDICINE_JOIN),
  validate(connectionEventSchema),
  asyncHandler(ctrl.logEvent),
);

module.exports = router;
