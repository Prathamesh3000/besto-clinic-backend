const express = require('express');
const router = express.Router();
const controller = require('./holiday.controller');
const { authenticate } = require('../../middleware/authenticate');
const { tenantResolver } = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const { PERMISSIONS } = require('../../config/permissions');
const asyncHandler = require('../../utils/asyncHandler');
const {
  createHolidaySchema,
  updateHolidaySchema,
  holidayIdParamSchema,
  listHolidaysQuerySchema,
} = require('./holiday.validator');

router.use(authenticate(), tenantResolver());

router.get(
  '/',
  authorize(PERMISSIONS.HOLIDAY_READ),
  validate(listHolidaysQuerySchema, { source: 'query' }),
  asyncHandler(controller.list)
);

router.get(
  '/:id',
  authorize(PERMISSIONS.HOLIDAY_READ),
  validate(holidayIdParamSchema, { source: 'params' }),
  asyncHandler(controller.getById)
);

router.post(
  '/',
  authorize(PERMISSIONS.HOLIDAY_CREATE),
  validate(createHolidaySchema),
  asyncHandler(controller.create)
);

router.put(
  '/:id',
  authorize(PERMISSIONS.HOLIDAY_UPDATE),
  validate(holidayIdParamSchema, { source: 'params' }),
  validate(updateHolidaySchema),
  asyncHandler(controller.update)
);

router.delete(
  '/:id',
  authorize(PERMISSIONS.HOLIDAY_DELETE),
  validate(holidayIdParamSchema, { source: 'params' }),
  asyncHandler(controller.remove)
);

module.exports = router;
