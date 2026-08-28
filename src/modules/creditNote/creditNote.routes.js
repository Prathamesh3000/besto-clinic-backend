'use strict';

const router = require('express').Router();
const ctrl = require('./creditNote.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const {
  createCreditNoteSchema,
  applyCreditNoteSchema,
  creditNoteIdParamSchema,
  patientIdParamSchema,
} = require('./creditNote.validator');

router.use(authenticate(), tenantResolver());

router.post(
  '/',
  authorize(PERMISSIONS.CREDIT_NOTE_CREATE),
  validate(createCreditNoteSchema),
  asyncHandler(ctrl.create),
);

router.put(
  '/:id/issue',
  validate(creditNoteIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CREDIT_NOTE_APPROVE),
  asyncHandler(ctrl.issue),
);

router.put(
  '/:id/apply',
  validate(creditNoteIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CREDIT_NOTE_CREATE),
  validate(applyCreditNoteSchema),
  asyncHandler(ctrl.apply),
);

router.get(
  '/',
  authorizeAny(PERMISSIONS.CREDIT_NOTE_READ, PERMISSIONS.PAYMENT_READ_OWN),
  asyncHandler(ctrl.list),
);

router.get(
  '/:id',
  validate(creditNoteIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.CREDIT_NOTE_READ, PERMISSIONS.PAYMENT_READ_OWN),
  asyncHandler(ctrl.getById),
);

router.get(
  '/patient/:patientId',
  validate(patientIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.CREDIT_NOTE_READ),
  asyncHandler(ctrl.getForPatient),
);

module.exports = router;
