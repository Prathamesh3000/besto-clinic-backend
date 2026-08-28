'use strict';

const router = require('express').Router();
const ctrl = require('./purchaseOrder.controller');
const { validate } = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const { tenantResolver } = require('../../middleware/tenantResolver');
const { authorize } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const {
  idParamSchema,
  createVendorSchema,
  updateVendorSchema,
  createPOSchema,
  updatePOSchema,
  updatePOStatusSchema,
  listVendorQuerySchema,
  listPOQuerySchema,
} = require('./purchaseOrder.validator');

// authenticate() before tenantResolver() — the cross-tenant guard reads req.user.
// See docs/BestoClinic_Defect_Register.docx §2.1.
router.use(authenticate(), tenantResolver());

/* ── Vendor routes ─────────────────────────────── */

router.post('/vendors',
  authorize(PERMISSIONS.VENDOR_CREATE),
  validate(createVendorSchema),
  asyncHandler(ctrl.createVendor),
);

router.get('/vendors',
  authorize(PERMISSIONS.VENDOR_READ),
  asyncHandler(ctrl.listVendors),
);

router.get('/vendors/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.VENDOR_READ),
  asyncHandler(ctrl.getVendor),
);

router.put('/vendors/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.VENDOR_UPDATE),
  validate(updateVendorSchema),
  asyncHandler(ctrl.updateVendor),
);

router.delete('/vendors/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.VENDOR_DELETE),
  asyncHandler(ctrl.deleteVendor),
);

/* ── Purchase Order routes ─────────────────────── */

router.post('/orders',
  authorize(PERMISSIONS.PO_CREATE),
  validate(createPOSchema),
  asyncHandler(ctrl.createPO),
);

router.get('/orders',
  authorize(PERMISSIONS.PO_READ),
  asyncHandler(ctrl.listPOs),
);

router.get('/orders/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.PO_READ),
  asyncHandler(ctrl.getPO),
);

router.put('/orders/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.PO_UPDATE),
  validate(updatePOSchema),
  asyncHandler(ctrl.updatePO),
);

router.put('/orders/:id/status',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.PO_UPDATE),
  validate(updatePOStatusSchema),
  asyncHandler(ctrl.updatePOStatus),
);

router.put('/orders/:id/cancel',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.PO_CANCEL),
  asyncHandler(ctrl.cancelPO),
);

module.exports = router;
