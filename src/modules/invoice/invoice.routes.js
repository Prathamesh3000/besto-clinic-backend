'use strict';

const router = require('express').Router();
const ctrl = require('./invoice.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const { createInvoiceSchema, updateInvoiceSchema, invoiceIdParamSchema } = require('./invoice.validator');

router.use(authenticate(), tenantResolver());

router.get(
  '/',
  authorizeAny(PERMISSIONS.INVOICE_READ, PERMISSIONS.INVOICE_READ_OWN),
  asyncHandler(ctrl.list),
);

router.get(
  '/:id',
  validate(invoiceIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.INVOICE_READ, PERMISSIONS.INVOICE_READ_OWN),
  asyncHandler(ctrl.getById),
);

router.get(
  '/:id/pdf',
  validate(invoiceIdParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.INVOICE_READ, PERMISSIONS.INVOICE_READ_OWN),
  asyncHandler(ctrl.downloadPdf),
);

router.post(
  '/',
  authorize(PERMISSIONS.INVOICE_CREATE),
  validate(createInvoiceSchema),
  asyncHandler(ctrl.create),
);

router.put(
  '/:id',
  validate(invoiceIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.INVOICE_UPDATE),
  validate(updateInvoiceSchema),
  asyncHandler(ctrl.update),
);

router.delete(
  '/:id',
  validate(invoiceIdParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.INVOICE_VOID),
  asyncHandler(ctrl.remove),
);

module.exports = router;
