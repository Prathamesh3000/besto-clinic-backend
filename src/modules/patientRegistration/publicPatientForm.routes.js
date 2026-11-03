'use strict';

/**
 * Public (unauthenticated) QR registration endpoints, mounted at /public/patient-form.
 * The tenant is derived from the clinic code; the QR token gates access.
 */

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const { validate } = require('../../middleware/validate');
const { submitRegistrationSchema } = require('./patientRegistration.validator');
const publicService = require('./publicPatientForm.service');

const viewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'Too many submissions. Please try again later.' },
});

const tokenOf = (req) => (typeof req.query.t === 'string' ? req.query.t : '');

router.get(
  '/:clinicCode',
  viewLimiter,
  asyncHandler(async (req, res) => {
    const data = await publicService.getPublicForm(req.params.clinicCode, tokenOf(req));
    res.json(ApiResponse.success('Registration form retrieved', data));
  }),
);

// The app-wide express.json limit (10mb) already covers the ~400 KB signature body.
router.post(
  '/:clinicCode/submit',
  submitLimiter,
  validate(submitRegistrationSchema),
  asyncHandler(async (req, res) => {
    const data = await publicService.submitPublicForm(req.params.clinicCode, tokenOf(req), req.body, req);
    res.status(201).json(ApiResponse.success('Registration submitted', data));
  }),
);

module.exports = router;
