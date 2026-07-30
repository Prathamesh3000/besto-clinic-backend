'use strict';

const router = require('express').Router();
const ctrl = require('./reservation.controller');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const { tenantResolver } = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const {
  idParamSchema,
  appointmentIdParamSchema,
  createSchema,
} = require('./reservation.validator');

router.use(tenantResolver(), authenticate());

router.post('/',
  authorize(PERMISSIONS.RESERVATION_CREATE),
  validate(createSchema),
  asyncHandler(ctrl.create),
);

router.get('/:appointmentId',
  validate(appointmentIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.RESERVATION_READ),
  asyncHandler(ctrl.getByAppointment),
);

router.delete('/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.RESERVATION_RELEASE),
  asyncHandler(ctrl.release),
);

module.exports = router;
