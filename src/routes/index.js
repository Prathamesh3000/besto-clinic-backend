'use strict';

/**
 * Route registry — mounts all module routers under /api/v1.
 *
 * The app.js file calls:
 *   app.use('/api/v1', require('./routes'));
 */

const router = require('express').Router();
const ApiResponse = require('../utils/ApiResponse');
const { subscriptionActive } = require('../middleware/featureGuard');

// ── Health check (no auth, no tenant) ───────────
router.get('/health', (_req, res) => {
  res.json(ApiResponse.success('BestoClinic API is running', {
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  }));
});

// ── Global subscription enforcement ─────────────
// Blocks suspended/cancelled tenants from ALL tenant-scoped routes.
// Reads x-tenant-id header directly so it works before tenantResolver.
// Auth, public, and platform routes are excluded so that:
//   - Suspended users can still log in (to see the suspension screen)
//   - Public endpoints (registration, plans) remain open
//   - Platform admins are never blocked
//   - The subscription page itself stays reachable, so a lapsed or suspended
//     clinic can see what it owes and pay for it. Blocking /subscriptions made
//     the one screen that fixes the problem the one screen it could not open.
//     The purchase routes under it re-check the tenant's own status, so an
//     administratively suspended clinic can look but cannot pay its way back in.
router.use((req, res, next) => {
  const path = req.path;
  if (
    path === '/health' ||
    path.startsWith('/auth') ||
    path.startsWith('/public') ||
    path.startsWith('/platform') ||
    path.startsWith('/subscriptions') ||
    path.startsWith('/monitoring') ||
    path.startsWith('/contact')
  ) {
    return next();
  }
  return subscriptionActive()(req, res, next);
});

// ── Module routes ───────────────────────────────
router.use('/auth',          require('../modules/auth/auth.routes'));
router.use('/patients',      require('../modules/patient/patient.routes'));
router.use('/appointments',  require('../modules/appointment/appointment.routes'));
router.use('/invoices',      require('../modules/invoice/invoice.routes'));
router.use('/clinic',        require('../modules/clinic/clinic.routes'));
router.use('/users',         require('../modules/user/user.routes'));
router.use('/subscriptions', require('../modules/subscription/subscription.routes'));
router.use('/dashboard',     require('../modules/dashboard/dashboard.routes'));

// ── Branches & Departments ───────────────────────
router.use('/branches',       require('../modules/branch/branch.routes'));
router.use('/departments',    require('../modules/department/department.routes'));

// ── Clinic Operations ───────────────────────────
router.use('/holidays',        require('../modules/holiday/holiday.routes'));
router.use('/booking-policy',  require('../modules/bookingPolicy/bookingPolicy.routes'));

// ── Doctor & Staff management ────────────────────
router.use('/doctors',        require('../modules/doctor/doctor.routes'));
router.use('/staff',          require('../modules/staff/staff.routes'));

// ── Insurance ────────────────────────────────────
router.use('/insurance',      require('../modules/insurance/insurance.routes'));

// ── Payroll ──────────────────────────────────────
router.use('/payroll',        require('../modules/payroll/payroll.routes'));

// ── Notifications ────────────────────────────────
router.use('/notifications',  require('../modules/notification/notification.routes'));

// ── Legacy Data Upload ───────────────────────────
router.use('/legacy-uploads', require('../modules/legacyUpload/legacyUpload.routes'));

// ── Integrations (tenant-scoped) ─────────────────
router.use('/integrations',  require('../modules/integration/integration.routes'));

// ── Roles (read-only role/permission viewer) ─────
router.use('/roles',          require('../modules/role/role.routes'));

// ── Smart Queue ─────────────────────────────────
router.use('/queue',          require('../modules/queue/queue.routes'));

// ── Prescriptions ───────────────────────────────
router.use('/prescriptions',  require('../modules/prescription/prescription.routes'));
router.use('/treatment-plans', require('../modules/treatmentPlan/treatmentPlan.routes'));

// ── Consent Management ──────────────────────────
router.use('/consents',       require('../modules/consent/consent.routes'));

// ── Emergency Chat & Video ──────────────────────
router.use('/emergency',      require('../modules/emergency/emergency.routes'));

// ── Doctor Dashboard ──────────────────────────────
router.use('/doctor',           require('../modules/doctorDashboard/doctorDashboard.routes'));

// ── Integration Data Viewer ─────────────────────
router.use('/integration-data', require('../modules/integrationViewer/integrationViewer.routes'));

// ── Patient Portal ────────────────────────────────
router.use('/portal',        require('../modules/patientPortal/patientPortal.routes'));

// ── Telemedicine ────────────────────────────────
router.use('/telemedicine',  require('../modules/telemedicine/telemedicine.routes'));

// ── Billing & Payments ────────────────────────────
router.use('/payments',      require('../modules/payment/payment.routes'));
router.use('/billing',       require('../modules/billing/billing.routes'));
router.use('/cash-register', require('../modules/cashRegister/cashRegister.routes'));
router.use('/credit-notes',  require('../modules/creditNote/creditNote.routes'));

// ── AI Dental Scans ───────────────────────────────
router.use('/dental-scans',  require('../modules/dentalScan/dentalScan.routes'));

// ── Clinical Inventory ───────────────────────────
router.use('/inventory',     require('../modules/inventory/inventory.routes'));

// ── Vendors & Purchase Orders ─────────────────────
router.use('/purchase-orders', require('../modules/purchaseOrder/purchaseOrder.routes'));

// ── Clinic Analytics ───────────────────────────────
router.use('/analytics',     require('../modules/analytics/analytics.routes'));

// ── Job Portal & Credits ──────────────────────────
router.use('/jobs',          require('../modules/jobPortal/jobPortal.routes'));
router.use('/credits',       require('../modules/credit/credit.routes'));

// ── Calendar Feeds (ICS export) ─────────────────
router.use('/calendar-feeds', require('../modules/calendarFeed/calendarFeed.routes'));

// ── Global Search ────────────────────────────────
router.use('/global-search', require('../modules/globalSearch/globalSearch.routes'));

// ── Public routes (no auth required) ────────────
router.use('/public',        require('../modules/public/public.routes'));

// ── Platform (Product Owner) routes ─────────────
router.use('/platform',      require('../modules/productOwner/productOwner.routes'));

// ── Contact (Landing page) routes ─────────────
router.use('/contact',      require('../modules/productOwner/contactRoutes'));

// ── 404 handler for unmatched API routes ────────
router.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
  });
});

module.exports = router;
