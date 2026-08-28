'use strict';

const router = require('express').Router();
const ctrl = require('./payroll.controller');
const {validate} = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/authenticate');
const {tenantResolver} = require('../../middleware/tenantResolver');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { PERMISSIONS } = require('../../config/permissions');
const {
  createSalaryStructureSchema,
  updateSalaryStructureSchema,
  generatePayslipsSchema,
  markPayslipPaidSchema,
  idParamSchema,
} = require('./payroll.validator');

router.use(authenticate(), tenantResolver());

// ── Salary Structures ───────────────────────────────────────

router.get(
  '/salary-structures',
  authorizeAny(PERMISSIONS.PAYROLL_READ, PERMISSIONS.PAYROLL_MANAGE),
  asyncHandler(ctrl.listSalaryStructures),
);

router.get(
  '/salary-structures/:id',
  validate(idParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.PAYROLL_READ, PERMISSIONS.PAYROLL_MANAGE),
  asyncHandler(ctrl.getSalaryStructureById),
);

router.post(
  '/salary-structures',
  authorize(PERMISSIONS.PAYROLL_MANAGE),
  validate(createSalaryStructureSchema),
  asyncHandler(ctrl.createSalaryStructure),
);

router.put(
  '/salary-structures/:id',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.PAYROLL_MANAGE),
  validate(updateSalaryStructureSchema),
  asyncHandler(ctrl.updateSalaryStructure),
);

// ── Payslips ────────────────────────────────────────────────

router.get(
  '/payslips',
  authorizeAny(PERMISSIONS.PAYROLL_READ, PERMISSIONS.PAYROLL_MANAGE),
  asyncHandler(ctrl.listPayslips),
);

router.get(
  '/payslips/:id',
  validate(idParamSchema, { source: 'params' }),
  authorizeAny(PERMISSIONS.PAYROLL_READ, PERMISSIONS.PAYROLL_MANAGE),
  asyncHandler(ctrl.getPayslipById),
);

router.post(
  '/payslips/generate',
  authorize(PERMISSIONS.PAYROLL_MANAGE),
  validate(generatePayslipsSchema),
  asyncHandler(ctrl.generatePayslips),
);

router.put(
  '/payslips/:id/approve',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.PAYROLL_MANAGE),
  asyncHandler(ctrl.approvePayslip),
);

router.put(
  '/payslips/:id/pay',
  validate(idParamSchema, { source: 'params' }),
  authorize(PERMISSIONS.PAYROLL_MANAGE),
  validate(markPayslipPaidSchema),
  asyncHandler(ctrl.markPayslipPaid),
);

module.exports = router;
