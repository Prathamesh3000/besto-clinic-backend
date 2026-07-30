'use strict';

/**
 * Test utility helpers — auth tokens, sample data factories, etc.
 */

const jwt = require('jsonwebtoken');

const TEST_SECRET = 'test-access-secret-that-is-at-least-32-chars';
const TENANT_SLUG = 'test-clinic';

/**
 * Generate a mock JWT for authenticated test requests.
 */
function generateTestToken({ userId = '507f1f77bcf86cd799439011', role = 'doctor', tenantSlug = TENANT_SLUG } = {}) {
  return jwt.sign(
    { userId, role, tenantSlug },
    TEST_SECRET,
    { expiresIn: '1h', audience: 'bestoclinic-client', issuer: 'bestoclinic', jwtid: 'test-jti' },
  );
}

/**
 * Common test data factories.
 */
const factories = {
  patient: (overrides = {}) => ({
    name: 'John Doe',
    email: 'john@example.com',
    phone: '9876543210',
    dateOfBirth: '1990-01-15',
    gender: 'male',
    ...overrides,
  }),

  appointment: (overrides = {}) => ({
    patient: '507f1f77bcf86cd799439011',
    doctor: '507f1f77bcf86cd799439022',
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    duration: 30,
    type: 'consultation',
    reason: 'Routine checkup',
    ...overrides,
  }),

  invoice: (overrides = {}) => ({
    patient: '507f1f77bcf86cd799439011',
    items: [
      { description: 'Consultation', quantity: 1, unitPrice: 500, discount: 0, tax: 90, total: 590 },
    ],
    subtotal: 500,
    taxAmount: 90,
    discountAmount: 0,
    totalAmount: 590,
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    ...overrides,
  }),
};

module.exports = { generateTestToken, factories, TENANT_SLUG };
