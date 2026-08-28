'use strict';

const { getTenantConnection } = require('../../db/tenantConnectionManager');
const {
  INVOICE_STATUS, APPOINTMENT_STATUS, PAYMENT_STATUS, PAYMENT_MODE,
} = require('../../config/constants');

/**
 * Get aggregate dashboard stats for a clinic.
 */
async function getClinicDashboard(tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');
  const Appointment = conn.model('Appointment');
  const Invoice = conn.model('Invoice');
  const Payment = conn.model('Payment');

  // Today's date range
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Current month range
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date();
  monthEnd.setMonth(monthEnd.getMonth() + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);

  const [
    totalPatients,
    todayAppointments,
    pendingInvoices,
    revenueResult,
  ] = await Promise.all([
    // Total active patients
    Patient.countDocuments({ deletedAt: null }),

    // Today's appointments (non-cancelled)
    Appointment.countDocuments({
      deletedAt: null,
      scheduledAt: { $gte: todayStart, $lte: todayEnd },
      status: { $ne: APPOINTMENT_STATUS.CANCELLED },
    }),

    // Pending / unpaid invoices
    Invoice.countDocuments({
      deletedAt: null,
      status: { $in: [INVOICE_STATUS.SENT, INVOICE_STATUS.OVERDUE, INVOICE_STATUS.DRAFT] },
    }),

    // Revenue this month — net cash collected, matching /analytics/summary.
    //
    // This used to sum PAID invoices by paidAt while the analytics card summed
    // PAYMENTS by createdAt, so the same words produced different numbers on two
    // screens. Payments are the honest measure: a part-paid invoice contributes
    // what was actually received, and an invoice marked paid by a credit note
    // contributes nothing. Refunds are netted, and credit-balance settlements
    // excluded, for the same reasons as in analytics.service.
    Payment.aggregate([
      {
        $match: {
          status: { $in: [PAYMENT_STATUS.COMPLETED, PAYMENT_STATUS.REFUNDED] },
          mode: { $ne: PAYMENT_MODE.CREDIT_BALANCE },
          deletedAt: null,
          createdAt: { $gte: monthStart, $lte: monthEnd },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $subtract: ['$amount', { $ifNull: ['$refundAmount', 0] }] } },
        },
      },
    ]),
  ]);

  const revenueThisMonth = revenueResult.length > 0 ? revenueResult[0].total : 0;

  return {
    totalPatients,
    todayAppointments,
    pendingInvoices,
    revenueThisMonth,
  };
}

module.exports = { getClinicDashboard };
