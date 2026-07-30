'use strict';

const { getTenantConnection } = require('../../db/tenantConnectionManager');
const {
  APPOINTMENT_STATUS,
  INVOICE_STATUS,
  PAYMENT_STATUS,
  PAYMENT_MODE,
  INSURANCE_CLAIM_STATUS,
  VIDEO_SESSION_STATUS,
  VIDEO_SESSION_TYPE,
  INTEGRATION_TYPES,
} = require('../../config/constants');

/* ── In-memory cache ─────────────────────────────────────────────── */

const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function _getCached(key) {
  const entry = _cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  _cache.delete(key);
  return null;
}

function _setCache(key, data) {
  _cache.set(key, { data, ts: Date.now() });
  // Evict old entries if cache grows too large
  if (_cache.size > 200) {
    const oldest = [..._cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 50; i++) _cache.delete(oldest[i][0]);
  }
}

/* ── Date grouping helpers ───────────────────────────────────────── */

/**
 * Build a MongoDB $dateToString expression for grouping by period.
 * @param {string} period - 'daily' | 'weekly' | 'monthly'
 * @param {string} [dateField='$createdAt'] - the document field to group on
 */
function _dateGroupExpr(period, dateField = '$createdAt') {
  if (period === 'daily') {
    return { $dateToString: { format: '%Y-%m-%d', date: dateField } };
  }
  if (period === 'weekly') {
    return { $dateToString: { format: '%Y-W%V', date: dateField } };
  }
  return { $dateToString: { format: '%Y-%m', date: dateField } };
}

/**
 * Build a base date-range + soft-delete match filter.
 * @param {string} dateField - the schema field name (without $)
 * @param {string|Date} startDate
 * @param {string|Date} endDate
 * @param {Object} [extra] - additional match criteria
 */
function _baseDateMatch(dateField, startDate, endDate, extra = {}) {
  const match = { deletedAt: null, ...extra };
  if (startDate || endDate) {
    match[dateField] = {};
    if (startDate) match[dateField].$gte = new Date(startDate);
    if (endDate) match[dateField].$lte = new Date(endDate);
  }
  return match;
}

/* ═══════════════════════════════════════════════════════════════════
   1. Revenue Trends
   ═══════════════════════════════════════════════════════════════════ */

async function getRevenueTrends(query, tenantSlug) {
  const cacheKey = `${tenantSlug}:getRevenueTrends:${JSON.stringify(query)}`;
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  const { period = 'monthly', startDate, endDate, branchId } = query;
  const conn = await getTenantConnection(tenantSlug);
  const Payment = conn.model('Payment');
  const Invoice = conn.model('Invoice');

  // --- Payment aggregation (completed payments grouped by period + mode) ---
  const paymentMatch = _baseDateMatch('createdAt', startDate, endDate, {
    status: PAYMENT_STATUS.COMPLETED,
  });
  if (branchId) paymentMatch.branch = branchId;

  const paymentPipeline = [
    { $match: paymentMatch },
    {
      $group: {
        _id: {
          period: _dateGroupExpr(period, '$createdAt'),
          mode: '$mode',
        },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.period': 1 } },
  ];

  // --- Refund aggregation ---
  const refundMatch = _baseDateMatch('refundedAt', startDate, endDate, {
    status: PAYMENT_STATUS.REFUNDED,
  });
  if (branchId) refundMatch.branch = branchId;

  const refundPipeline = [
    { $match: refundMatch },
    {
      $group: {
        _id: null,
        totalRefunded: { $sum: '$refundAmount' },
      },
    },
  ];

  // --- Outstanding invoices ---
  const outstandingMatch = {
    deletedAt: null,
    status: { $in: [INVOICE_STATUS.SENT, INVOICE_STATUS.OVERDUE] },
  };
  if (branchId) outstandingMatch.branch = branchId;

  const outstandingPipeline = [
    { $match: outstandingMatch },
    {
      $group: {
        _id: null,
        outstanding: { $sum: { $subtract: ['$totalAmount', '$paidAmount'] } },
      },
    },
  ];

  const [paymentResults, refundResults, outstandingResults] = await Promise.all([
    Payment.aggregate(paymentPipeline),
    Payment.aggregate(refundPipeline),
    Invoice.aggregate(outstandingPipeline),
  ]);

  // Reshape payment results into data points
  const periodMap = {};
  let totalCollected = 0;

  for (const row of paymentResults) {
    const p = row._id.period;
    const mode = row._id.mode;
    if (!periodMap[p]) {
      periodMap[p] = { period: p, total: 0, byMode: {} };
    }
    periodMap[p].byMode[mode] = (periodMap[p].byMode[mode] || 0) + row.total;
    periodMap[p].total += row.total;
    totalCollected += row.total;
  }

  const dataPoints = Object.values(periodMap).sort((a, b) =>
    a.period.localeCompare(b.period),
  );

  const totalRefunded = refundResults.length > 0 ? refundResults[0].totalRefunded : 0;
  const outstanding = outstandingResults.length > 0 ? outstandingResults[0].outstanding : 0;

  const result = {
    dataPoints,
    totals: {
      collected: totalCollected,
      refunded: totalRefunded,
      net: totalCollected - totalRefunded,
      outstanding,
    },
  };

  _setCache(cacheKey, result);
  return result;
}

/* ═══════════════════════════════════════════════════════════════════
   2. Appointment Trends
   ═══════════════════════════════════════════════════════════════════ */

async function getAppointmentTrends(query, tenantSlug) {
  const cacheKey = `${tenantSlug}:getAppointmentTrends:${JSON.stringify(query)}`;
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  const { period = 'monthly', startDate, endDate, branchId, doctorId } = query;
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');

  const match = _baseDateMatch('scheduledAt', startDate, endDate);
  if (branchId) match.branch = branchId;
  if (doctorId) match.doctor = doctorId;

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: {
          period: _dateGroupExpr(period, '$scheduledAt'),
          status: '$status',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.period': 1 } },
  ];

  const results = await Appointment.aggregate(pipeline);

  // Reshape into data points
  const periodMap = {};
  let grandTotal = 0;
  let totalCompleted = 0;
  let totalCancelled = 0;

  for (const row of results) {
    const p = row._id.period;
    const status = row._id.status;
    if (!periodMap[p]) {
      periodMap[p] = {
        period: p,
        total: 0,
        completed: 0,
        cancelled: 0,
        noShow: 0,
        rescheduled: 0,
      };
    }
    periodMap[p].total += row.count;
    grandTotal += row.count;

    if (status === APPOINTMENT_STATUS.COMPLETED) {
      periodMap[p].completed += row.count;
      totalCompleted += row.count;
    } else if (status === APPOINTMENT_STATUS.CANCELLED) {
      periodMap[p].cancelled += row.count;
      totalCancelled += row.count;
    } else if (status === APPOINTMENT_STATUS.NO_SHOW) {
      periodMap[p].noShow += row.count;
    }
    // Note: rescheduled is not a distinct status in APPOINTMENT_STATUS;
    // it would require a separate field if tracked. Defaulting to 0.
  }

  const dataPoints = Object.values(periodMap).sort((a, b) =>
    a.period.localeCompare(b.period),
  );

  // Calculate avg appointments per day from date range
  let avgPerDay = 0;
  if (startDate && endDate) {
    const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
    const days = Math.max(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), 1);
    avgPerDay = Math.round((grandTotal / days) * 100) / 100;
  }

  const result = {
    dataPoints,
    summary: {
      total: grandTotal,
      completionRate: grandTotal > 0
        ? Math.round((totalCompleted / grandTotal) * 10000) / 100
        : 0,
      cancellationRate: grandTotal > 0
        ? Math.round((totalCancelled / grandTotal) * 10000) / 100
        : 0,
      avgPerDay,
    },
  };

  _setCache(cacheKey, result);
  return result;
}

/* ═══════════════════════════════════════════════════════════════════
   3. Doctor Performance
   ═══════════════════════════════════════════════════════════════════ */

async function getDoctorPerformance(query, tenantSlug) {
  const cacheKey = `${tenantSlug}:getDoctorPerformance:${JSON.stringify(query)}`;
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  const { startDate, endDate, branchId, doctorId } = query;
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');
  const Payment = conn.model('Payment');
  const Invoice = conn.model('Invoice');
  const User = conn.model('User');

  // --- Appointment aggregation by doctor ---
  const apptMatch = _baseDateMatch('scheduledAt', startDate, endDate);
  if (branchId) apptMatch.branch = branchId;
  if (doctorId) apptMatch.doctor = doctorId;

  apptMatch.doctor = apptMatch.doctor || { $ne: null };

  const apptPipeline = [
    { $match: apptMatch },
    {
      $group: {
        _id: {
          doctor: '$doctor',
          status: '$status',
        },
        count: { $sum: 1 },
      },
    },
  ];

  // --- Revenue aggregation by doctor (via invoices + payments) ---
  const invoiceMatch = _baseDateMatch('createdAt', startDate, endDate, {
    status: { $in: [INVOICE_STATUS.PAID, INVOICE_STATUS.PARTIALLY_PAID] },
  });
  if (branchId) invoiceMatch.branch = branchId;
  if (doctorId) invoiceMatch.doctor = doctorId;
  if (!invoiceMatch.doctor) invoiceMatch.doctor = { $ne: null };

  const revenuePipeline = [
    { $match: invoiceMatch },
    {
      $group: {
        _id: '$doctor',
        totalRevenue: { $sum: '$paidAmount' },
      },
    },
  ];

  const [apptResults, revenueResults] = await Promise.all([
    Appointment.aggregate(apptPipeline),
    Invoice.aggregate(revenuePipeline),
  ]);

  // Collect unique doctor IDs
  const doctorIds = new Set();
  for (const row of apptResults) {
    if (row._id.doctor) doctorIds.add(String(row._id.doctor));
  }
  for (const row of revenueResults) {
    if (row._id) doctorIds.add(String(row._id));
  }

  // Fetch doctor names
  const doctorUsers = await User.find({
    _id: { $in: [...doctorIds] },
  }).select('name').lean();

  const doctorNameMap = {};
  for (const u of doctorUsers) {
    doctorNameMap[String(u._id)] = u.name;
  }

  // Build doctor stats map
  const doctorMap = {};

  for (const row of apptResults) {
    const did = String(row._id.doctor);
    if (!doctorMap[did]) {
      doctorMap[did] = {
        doctorId: row._id.doctor,
        doctorName: doctorNameMap[did] || 'Unknown',
        totalAppointments: 0,
        completed: 0,
        noShowCount: 0,
        noShowRate: 0,
        cancellations: 0,
        revenue: 0,
        avgRevenuePerVisit: 0,
      };
    }
    doctorMap[did].totalAppointments += row.count;

    if (row._id.status === APPOINTMENT_STATUS.COMPLETED) {
      doctorMap[did].completed += row.count;
    } else if (row._id.status === APPOINTMENT_STATUS.NO_SHOW) {
      doctorMap[did].noShowCount += row.count;
    } else if (row._id.status === APPOINTMENT_STATUS.CANCELLED) {
      doctorMap[did].cancellations += row.count;
    }
  }

  for (const row of revenueResults) {
    const did = String(row._id);
    if (!doctorMap[did]) {
      doctorMap[did] = {
        doctorId: row._id,
        doctorName: doctorNameMap[did] || 'Unknown',
        totalAppointments: 0,
        completed: 0,
        noShowCount: 0,
        noShowRate: 0,
        cancellations: 0,
        revenue: 0,
        avgRevenuePerVisit: 0,
      };
    }
    doctorMap[did].revenue = row.totalRevenue;
  }

  // Calculate derived metrics
  const doctors = Object.values(doctorMap).map((d) => {
    d.noShowRate = d.totalAppointments > 0
      ? Math.round((d.noShowCount / d.totalAppointments) * 10000) / 100
      : 0;
    d.avgRevenuePerVisit = d.completed > 0
      ? Math.round((d.revenue / d.completed) * 100) / 100
      : 0;
    return d;
  });

  const result = { doctors };

  _setCache(cacheKey, result);
  return result;
}

/* ═══════════════════════════════════════════════════════════════════
   4. No-Show Analysis
   ═══════════════════════════════════════════════════════════════════ */

async function getNoShowAnalysis(query, tenantSlug) {
  const cacheKey = `${tenantSlug}:getNoShowAnalysis:${JSON.stringify(query)}`;
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  const { startDate, endDate, branchId } = query;
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');
  const User = conn.model('User');

  const baseMatch = _baseDateMatch('scheduledAt', startDate, endDate);
  if (branchId) baseMatch.branch = branchId;

  // Total appointments in range (for rate calculations)
  const totalMatch = { ...baseMatch };
  const noShowMatch = { ...baseMatch, status: APPOINTMENT_STATUS.NO_SHOW };

  // --- By day of week ---
  const byDayPipeline = [
    { $match: noShowMatch },
    {
      $group: {
        _id: { $dayOfWeek: '$scheduledAt' }, // 1=Sunday … 7=Saturday
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ];

  // --- By hour ---
  const byHourPipeline = [
    { $match: noShowMatch },
    {
      $group: {
        _id: { $hour: '$scheduledAt' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ];

  // --- By doctor ---
  const byDoctorPipeline = [
    { $match: noShowMatch },
    {
      $group: {
        _id: '$doctor',
        count: { $sum: 1 },
      },
    },
  ];

  // --- Total appointments by doctor (for per-doctor no-show rate) ---
  const totalByDoctorPipeline = [
    { $match: totalMatch },
    {
      $group: {
        _id: '$doctor',
        total: { $sum: 1 },
      },
    },
  ];

  const [
    totalCount,
    noShowCount,
    byDayResults,
    byHourResults,
    byDoctorResults,
    totalByDoctorResults,
  ] = await Promise.all([
    Appointment.countDocuments(totalMatch),
    Appointment.countDocuments(noShowMatch),
    Appointment.aggregate(byDayPipeline),
    Appointment.aggregate(byHourPipeline),
    Appointment.aggregate(byDoctorPipeline),
    Appointment.aggregate(totalByDoctorPipeline),
  ]);

  // Build total-by-doctor map for rate calculation
  const totalByDoctorMap = {};
  for (const row of totalByDoctorResults) {
    totalByDoctorMap[String(row._id)] = row.total;
  }

  // Fetch doctor names for no-show doctors
  const doctorIds = byDoctorResults.map((r) => r._id).filter(Boolean);
  const doctorUsers = await User.find({ _id: { $in: doctorIds } })
    .select('name')
    .lean();
  const doctorNameMap = {};
  for (const u of doctorUsers) {
    doctorNameMap[String(u._id)] = u.name;
  }

  // Build byDayOfWeek (convert MongoDB 1-7 to 0-6 where 0=Sunday)
  const byDayOfWeek = byDayResults.map((row) => ({
    day: row._id - 1, // MongoDB $dayOfWeek: 1=Sun → 0=Sun
    count: row.count,
    rate: totalCount > 0
      ? Math.round((row.count / totalCount) * 10000) / 100
      : 0,
  }));

  const byHour = byHourResults.map((row) => ({
    hour: row._id,
    count: row.count,
  }));

  const byDoctor = byDoctorResults.map((row) => {
    const did = String(row._id);
    const doctorTotal = totalByDoctorMap[did] || 0;
    return {
      doctorId: row._id,
      name: doctorNameMap[did] || 'Unknown',
      count: row.count,
      rate: doctorTotal > 0
        ? Math.round((row.count / doctorTotal) * 10000) / 100
        : 0,
    };
  });

  const result = {
    overall: {
      total: totalCount,
      noShowCount,
      rate: totalCount > 0
        ? Math.round((noShowCount / totalCount) * 10000) / 100
        : 0,
    },
    byDayOfWeek,
    byHour,
    byDoctor,
  };

  _setCache(cacheKey, result);
  return result;
}

/* ═══════════════════════════════════════════════════════════════════
   5. Insurance Claim Trends
   ═══════════════════════════════════════════════════════════════════ */

async function getInsuranceClaimTrends(query, tenantSlug) {
  const cacheKey = `${tenantSlug}:getInsuranceClaimTrends:${JSON.stringify(query)}`;
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  const { period = 'monthly', startDate, endDate } = query;
  const conn = await getTenantConnection(tenantSlug);
  const InsuranceClaim = conn.model('InsuranceClaim');

  const match = _baseDateMatch('createdAt', startDate, endDate);

  // --- Group by period + status ---
  const trendPipeline = [
    { $match: match },
    {
      $group: {
        _id: {
          period: _dateGroupExpr(period, '$createdAt'),
          status: '$status',
        },
        count: { $sum: 1 },
        totalAmount: { $sum: '$claimAmount' },
      },
    },
    { $sort: { '_id.period': 1 } },
  ];

  // --- Avg processing time (submitted → settled) ---
  const processingPipeline = [
    {
      $match: {
        ...match,
        status: INSURANCE_CLAIM_STATUS.SETTLED,
        submittedAt: { $ne: null },
        settledAt: { $ne: null },
      },
    },
    {
      $project: {
        processingMs: { $subtract: ['$settledAt', '$submittedAt'] },
      },
    },
    {
      $group: {
        _id: null,
        avgProcessingMs: { $avg: '$processingMs' },
      },
    },
  ];

  // --- Summary totals ---
  const summaryPipeline = [
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$claimAmount' },
        totalSettled: { $sum: '$settledAmount' },
      },
    },
  ];

  const [trendResults, processingResults, summaryResults] = await Promise.all([
    InsuranceClaim.aggregate(trendPipeline),
    InsuranceClaim.aggregate(processingPipeline),
    InsuranceClaim.aggregate(summaryPipeline),
  ]);

  // Reshape trend data
  const periodMap = {};
  for (const row of trendResults) {
    const p = row._id.period;
    if (!periodMap[p]) {
      periodMap[p] = {
        period: p,
        submitted: 0,
        approved: 0,
        rejected: 0,
        settled: 0,
        totalAmount: 0,
      };
    }
    periodMap[p].totalAmount += row.totalAmount;

    if (row._id.status === INSURANCE_CLAIM_STATUS.SUBMITTED) {
      periodMap[p].submitted += row.count;
    } else if (row._id.status === INSURANCE_CLAIM_STATUS.APPROVED) {
      periodMap[p].approved += row.count;
    } else if (row._id.status === INSURANCE_CLAIM_STATUS.REJECTED) {
      periodMap[p].rejected += row.count;
    } else if (row._id.status === INSURANCE_CLAIM_STATUS.SETTLED) {
      periodMap[p].settled += row.count;
    }
  }

  const dataPoints = Object.values(periodMap).sort((a, b) =>
    a.period.localeCompare(b.period),
  );

  // Build summary
  let totalClaims = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  let totalSettledAmount = 0;
  let totalPendingAmount = 0;

  for (const row of summaryResults) {
    totalClaims += row.count;
    if (row._id === INSURANCE_CLAIM_STATUS.APPROVED) {
      approvedCount += row.count;
    } else if (row._id === INSURANCE_CLAIM_STATUS.REJECTED) {
      rejectedCount += row.count;
    } else if (row._id === INSURANCE_CLAIM_STATUS.SETTLED) {
      totalSettledAmount += row.totalSettled;
      approvedCount += row.count; // settled implies was approved
    } else if ([
      INSURANCE_CLAIM_STATUS.PENDING,
      INSURANCE_CLAIM_STATUS.SUBMITTED,
      INSURANCE_CLAIM_STATUS.UNDER_REVIEW,
    ].includes(row._id)) {
      totalPendingAmount += row.totalAmount;
    }
  }

  const decidedCount = approvedCount + rejectedCount;
  const avgProcessingMs = processingResults.length > 0
    ? processingResults[0].avgProcessingMs
    : 0;
  const avgProcessingDays = Math.round((avgProcessingMs / (1000 * 60 * 60 * 24)) * 100) / 100;

  const result = {
    dataPoints,
    summary: {
      totalClaims,
      approvalRate: decidedCount > 0
        ? Math.round((approvedCount / decidedCount) * 10000) / 100
        : 0,
      avgProcessingDays,
      totalSettled: totalSettledAmount,
      totalPending: totalPendingAmount,
    },
  };

  _setCache(cacheKey, result);
  return result;
}

/* ═══════════════════════════════════════════════════════════════════
   6. Telemedicine Usage
   ═══════════════════════════════════════════════════════════════════ */

async function getTelemedicineUsage(query, tenantSlug) {
  const cacheKey = `${tenantSlug}:getTelemedicineUsage:${JSON.stringify(query)}`;
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  const { period = 'monthly', startDate, endDate } = query;
  const conn = await getTenantConnection(tenantSlug);
  const VideoSession = conn.model('VideoSession');

  const match = _baseDateMatch('createdAt', startDate, endDate);

  // --- Group by period + type ---
  const trendPipeline = [
    { $match: match },
    {
      $group: {
        _id: {
          period: _dateGroupExpr(period, '$createdAt'),
          type: '$type',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.period': 1 } },
  ];

  // --- Summary stats ---
  const summaryPipeline = [
    { $match: match },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        avgDuration: { $avg: '$duration' },
        endedCount: {
          $sum: { $cond: [{ $eq: ['$status', VIDEO_SESSION_STATUS.ENDED] }, 1, 0] },
        },
        activeCount: {
          $sum: { $cond: [{ $eq: ['$status', VIDEO_SESSION_STATUS.ACTIVE] }, 1, 0] },
        },
      },
    },
  ];

  // --- By type summary ---
  const byTypePipeline = [
    { $match: match },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
      },
    },
  ];

  const [trendResults, summaryResults, byTypeResults] = await Promise.all([
    VideoSession.aggregate(trendPipeline),
    VideoSession.aggregate(summaryPipeline),
    VideoSession.aggregate(byTypePipeline),
  ]);

  // Reshape trend data
  const periodMap = {};
  for (const row of trendResults) {
    const p = row._id.period;
    if (!periodMap[p]) {
      periodMap[p] = {
        period: p,
        total: 0,
        emergency: 0,
        scheduled: 0,
        followUp: 0,
      };
    }
    periodMap[p].total += row.count;

    if (row._id.type === VIDEO_SESSION_TYPE.EMERGENCY) {
      periodMap[p].emergency += row.count;
    } else if (row._id.type === VIDEO_SESSION_TYPE.SCHEDULED) {
      periodMap[p].scheduled += row.count;
    } else if (row._id.type === VIDEO_SESSION_TYPE.FOLLOW_UP) {
      periodMap[p].followUp += row.count;
    }
  }

  const dataPoints = Object.values(periodMap).sort((a, b) =>
    a.period.localeCompare(b.period),
  );

  const summary = summaryResults.length > 0 ? summaryResults[0] : {};
  const totalSessions = summary.totalSessions || 0;
  const endedCount = summary.endedCount || 0;
  const avgDuration = summary.avgDuration
    ? Math.round(summary.avgDuration)
    : 0;

  // Completion rate: ended sessions / total non-cancelled sessions
  const completionRate = totalSessions > 0
    ? Math.round((endedCount / totalSessions) * 10000) / 100
    : 0;

  // By type map
  const byTypeMap = { emergency: 0, scheduled: 0, followUp: 0 };
  for (const row of byTypeResults) {
    if (row._id === VIDEO_SESSION_TYPE.EMERGENCY) byTypeMap.emergency = row.count;
    else if (row._id === VIDEO_SESSION_TYPE.SCHEDULED) byTypeMap.scheduled = row.count;
    else if (row._id === VIDEO_SESSION_TYPE.FOLLOW_UP) byTypeMap.followUp = row.count;
  }

  const result = {
    dataPoints,
    summary: {
      totalSessions,
      avgDuration,
      completionRate,
      byType: byTypeMap,
    },
  };

  _setCache(cacheKey, result);
  return result;
}

/* ═══════════════════════════════════════════════════════════════════
   7. Patient Growth
   ═══════════════════════════════════════════════════════════════════ */

async function getPatientGrowth(query, tenantSlug) {
  const cacheKey = `${tenantSlug}:getPatientGrowth:${JSON.stringify(query)}`;
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  const { period = 'monthly', startDate, endDate } = query;
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');
  const Appointment = conn.model('Appointment');

  const match = _baseDateMatch('createdAt', startDate, endDate);

  // --- New patients grouped by period ---
  const growthPipeline = [
    { $match: match },
    {
      $group: {
        _id: _dateGroupExpr(period, '$createdAt'),
        newPatients: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ];

  // --- Total patients (all time, active) ---
  const totalPatients = await Patient.countDocuments({ deletedAt: null });

  // --- New this month ---
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const newThisMonth = await Patient.countDocuments({
    createdAt: { $gte: monthStart },
    deletedAt: null,
  });

  // --- Retention: patients with appointments in last 90 days / total ---
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const retentionPipeline = [
    {
      $match: {
        scheduledAt: { $gte: ninetyDaysAgo },
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: '$patient',
      },
    },
    {
      $count: 'activePatients',
    },
  ];

  const [growthResults, retentionResults] = await Promise.all([
    Patient.aggregate(growthPipeline),
    Appointment.aggregate(retentionPipeline),
  ]);

  // Build data points with cumulative totals
  // We need total patients *before* the date range to start cumulative count
  let cumulativeBefore = totalPatients;
  // Subtract all patients created within the range to get the baseline
  let totalInRange = 0;
  for (const row of growthResults) {
    totalInRange += row.newPatients;
  }
  cumulativeBefore = totalPatients - totalInRange;

  let runningTotal = cumulativeBefore;
  const dataPoints = growthResults.map((row) => {
    runningTotal += row.newPatients;
    return {
      period: row._id,
      newPatients: row.newPatients,
      cumulativeTotal: runningTotal,
    };
  });

  const activePatients = retentionResults.length > 0
    ? retentionResults[0].activePatients
    : 0;
  const retentionRate = totalPatients > 0
    ? Math.round((activePatients / totalPatients) * 10000) / 100
    : 0;

  const numPeriods = dataPoints.length || 1;
  const avgNewPerMonth = Math.round((totalInRange / numPeriods) * 100) / 100;

  const result = {
    dataPoints,
    summary: {
      totalPatients,
      newThisMonth,
      retentionRate,
      avgNewPerMonth,
    },
  };

  _setCache(cacheKey, result);
  return result;
}

/* ═══════════════════════════════════════════════════════════════════
   8. Integration Usage
   ═══════════════════════════════════════════════════════════════════ */

async function getIntegrationUsage(tenantSlug) {
  const cacheKey = `${tenantSlug}:getIntegrationUsage:{}`;
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  const conn = await getTenantConnection(tenantSlug);
  const IntegrationCredential = conn.model('IntegrationCredential');
  const SyncLog = conn.model('SyncLog');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // --- Fetch all integration credentials ---
  const credentials = await IntegrationCredential.find({ deletedAt: null })
    .select('integrationType isActive lastTestedAt')
    .lean();

  // --- SyncLog aggregation per integration type (last 30 days) ---
  const syncPipeline = [
    {
      $match: {
        createdAt: { $gte: thirtyDaysAgo },
      },
    },
    {
      $group: {
        _id: '$integrationType',
        syncCount: { $sum: 1 },
        successCount: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
        },
        totalRecords: { $sum: '$stats.totalRecords' },
        lastSync: { $max: '$completedAt' },
      },
    },
  ];

  const syncResults = await SyncLog.aggregate(syncPipeline);

  // Build sync stats map
  const syncMap = {};
  for (const row of syncResults) {
    syncMap[row._id] = {
      syncCount: row.syncCount,
      successCount: row.successCount,
      totalRecords: row.totalRecords,
      lastSync: row.lastSync,
    };
  }

  // Build integration output for each known type
  const integrations = INTEGRATION_TYPES.map((type) => {
    const cred = credentials.find((c) => c.integrationType === type);
    const sync = syncMap[type] || {};

    return {
      type,
      isActive: cred ? cred.isActive : false,
      lastSync: sync.lastSync || null,
      syncCount30d: sync.syncCount || 0,
      successRate: sync.syncCount > 0
        ? Math.round((sync.successCount / sync.syncCount) * 10000) / 100
        : 0,
      totalRecords: sync.totalRecords || 0,
    };
  });

  const result = { integrations };

  _setCache(cacheKey, result);
  return result;
}

/* ═══════════════════════════════════════════════════════════════════
   9. Analytics Summary (Quick overview)
   ═══════════════════════════════════════════════���═══════════════════ */

async function getAnalyticsSummary(tenantSlug) {
  const cacheKey = `${tenantSlug}:getAnalyticsSummary:{}`;
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  const conn = await getTenantConnection(tenantSlug);
  const Payment = conn.model('Payment');
  const Appointment = conn.model('Appointment');
  const Patient = conn.model('Patient');
  const VideoSession = conn.model('VideoSession');
  const InsuranceClaim = conn.model('InsuranceClaim');
  const Invoice = conn.model('Invoice');

  const now = new Date();

  // --- Date ranges ---
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // --- Revenue this month ---
  const revenueThisMonthPipeline = [
    {
      $match: {
        status: PAYMENT_STATUS.COMPLETED,
        deletedAt: null,
        createdAt: { $gte: thisMonthStart, $lte: thisMonthEnd },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ];

  // --- Revenue last month ---
  const revenueLastMonthPipeline = [
    {
      $match: {
        status: PAYMENT_STATUS.COMPLETED,
        deletedAt: null,
        createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ];

  // --- Appointments today ---
  const appointmentsTodayMatch = {
    scheduledAt: { $gte: todayStart, $lte: todayEnd },
    deletedAt: null,
  };

  // --- Appointments this week ---
  const appointmentsWeekMatch = {
    scheduledAt: { $gte: weekStart, $lte: todayEnd },
    deletedAt: null,
  };

  // --- Completion rate (this month) ---
  const completionPipeline = [
    {
      $match: {
        scheduledAt: { $gte: thisMonthStart, $lte: thisMonthEnd },
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', APPOINTMENT_STATUS.COMPLETED] }, 1, 0] },
        },
        noShow: {
          $sum: { $cond: [{ $eq: ['$status', APPOINTMENT_STATUS.NO_SHOW] }, 1, 0] },
        },
      },
    },
  ];

  // --- New patients this month ---
  const newPatientsMatch = {
    createdAt: { $gte: thisMonthStart },
    deletedAt: null,
  };

  // --- Retention (patients with appointments in last 90 days) ---
  const retentionPipeline = [
    {
      $match: {
        scheduledAt: { $gte: ninetyDaysAgo },
        deletedAt: null,
      },
    },
    { $group: { _id: '$patient' } },
    { $count: 'activePatients' },
  ];

  // --- Active video sessions ---
  const activeVideoMatch = {
    status: { $in: [VIDEO_SESSION_STATUS.ACTIVE, VIDEO_SESSION_STATUS.WAITING] },
    deletedAt: null,
  };

  // --- Video sessions this month ---
  const videoThisMonthMatch = {
    createdAt: { $gte: thisMonthStart, $lte: thisMonthEnd },
    deletedAt: null,
  };

  // --- Pending insurance claims ---
  const pendingClaimsMatch = {
    status: {
      $in: [
        INSURANCE_CLAIM_STATUS.PENDING,
        INSURANCE_CLAIM_STATUS.SUBMITTED,
        INSURANCE_CLAIM_STATUS.UNDER_REVIEW,
      ],
    },
    deletedAt: null,
  };

  // --- Insurance approval rate (all time for simplicity) ---
  const insuranceApprovalPipeline = [
    {
      $match: {
        status: {
          $in: [
            INSURANCE_CLAIM_STATUS.APPROVED,
            INSURANCE_CLAIM_STATUS.SETTLED,
            INSURANCE_CLAIM_STATUS.REJECTED,
          ],
        },
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        approved: {
          $sum: {
            $cond: [
              { $in: ['$status', [INSURANCE_CLAIM_STATUS.APPROVED, INSURANCE_CLAIM_STATUS.SETTLED]] },
              1,
              0,
            ],
          },
        },
      },
    },
  ];

  // --- Revenue today (billing cards) ---
  const revenueTodayPipeline = [
    {
      $match: {
        status: PAYMENT_STATUS.COMPLETED,
        deletedAt: null,
        createdAt: { $gte: todayStart, $lte: todayEnd },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ];

  // --- Invoices created today ---
  const invoicesTodayMatch = {
    createdAt: { $gte: todayStart, $lte: todayEnd },
    deletedAt: null,
  };

  // --- Outstanding total (unpaid invoices) ---
  const outstandingPipeline = [
    {
      $match: {
        status: { $in: [INVOICE_STATUS.SENT, INVOICE_STATUS.OVERDUE, INVOICE_STATUS.PARTIALLY_PAID] },
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $subtract: ['$totalAmount', '$paidAmount'] } },
      },
    },
  ];

  // Run all queries in parallel
  const [
    revenueThisMonthResult,
    revenueLastMonthResult,
    appointmentsToday,
    appointmentsThisWeek,
    completionResult,
    totalPatients,
    newPatientsThisMonth,
    retentionResult,
    activeSessions,
    videoSessionsThisMonth,
    pendingClaims,
    insuranceApprovalResult,
    revenueTodayResult,
    invoicesTodayCount,
    outstandingResult,
  ] = await Promise.all([
    Payment.aggregate(revenueThisMonthPipeline),
    Payment.aggregate(revenueLastMonthPipeline),
    Appointment.countDocuments(appointmentsTodayMatch),
    Appointment.countDocuments(appointmentsWeekMatch),
    Appointment.aggregate(completionPipeline),
    Patient.countDocuments({ deletedAt: null }),
    Patient.countDocuments(newPatientsMatch),
    Appointment.aggregate(retentionPipeline),
    VideoSession.countDocuments(activeVideoMatch),
    VideoSession.countDocuments(videoThisMonthMatch),
    InsuranceClaim.countDocuments(pendingClaimsMatch),
    InsuranceClaim.aggregate(insuranceApprovalPipeline),
    Payment.aggregate(revenueTodayPipeline),
    Invoice.countDocuments(invoicesTodayMatch),
    Invoice.aggregate(outstandingPipeline),
  ]);

  const revenueThisMonth = revenueThisMonthResult.length > 0
    ? revenueThisMonthResult[0].total
    : 0;
  const revenueLastMonth = revenueLastMonthResult.length > 0
    ? revenueLastMonthResult[0].total
    : 0;
  const revenueGrowth = revenueLastMonth > 0
    ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 10000) / 100
    : 0;

  const completion = completionResult.length > 0 ? completionResult[0] : {};
  const completionTotal = completion.total || 0;
  const completedCount = completion.completed || 0;
  const noShowTotal = completion.noShow || 0;
  const completionRate = completionTotal > 0
    ? Math.round((completedCount / completionTotal) * 10000) / 100
    : 0;
  const noShowRate = completionTotal > 0
    ? Math.round((noShowTotal / completionTotal) * 10000) / 100
    : 0;

  const activePatients = retentionResult.length > 0
    ? retentionResult[0].activePatients
    : 0;
  const retentionRate = totalPatients > 0
    ? Math.round((activePatients / totalPatients) * 10000) / 100
    : 0;

  const insuranceApproval = insuranceApprovalResult.length > 0
    ? insuranceApprovalResult[0]
    : {};
  const insuranceApprovalRate = (insuranceApproval.total || 0) > 0
    ? Math.round(((insuranceApproval.approved || 0) / insuranceApproval.total) * 10000) / 100
    : 0;

  const revenueToday = revenueTodayResult.length > 0 ? revenueTodayResult[0].total : 0;
  const outstandingTotal = outstandingResult.length > 0 ? outstandingResult[0].total : 0;

  const result = {
    revenue: {
      today: revenueToday,
      thisMonth: revenueThisMonth,
      lastMonth: revenueLastMonth,
      growth: revenueGrowth,
    },
    invoices: {
      today: invoicesTodayCount,
    },
    payments: {
      today: revenueToday,
    },
    outstanding: {
      total: outstandingTotal,
    },
    appointments: {
      today: appointmentsToday,
      thisWeek: appointmentsThisWeek,
      completionRate,
    },
    patients: {
      total: totalPatients,
      newThisMonth: newPatientsThisMonth,
      retentionRate,
    },
    noShowRate,
    telemedicine: {
      activeSessions,
      totalThisMonth: videoSessionsThisMonth,
    },
    insurance: {
      pendingClaims,
      approvalRate: insuranceApprovalRate,
    },
  };

  _setCache(cacheKey, result);
  return result;
}

/* ═══════════════════════════════════════════════════════════════════
   10. Compliance Overview (clinic-wide)
   ═══════════════════════════════════════════════════════════════════ */

async function getComplianceOverview(tenantSlug) {
  const cacheKey = `${tenantSlug}:getComplianceOverview:{}`;
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  const conn = await getTenantConnection(tenantSlug);
  const PrescriptionTask = conn.model('PrescriptionTask');
  const ComplianceAlert = conn.model('ComplianceAlert');
  const User = conn.model('User');

  const taskPipeline = [
    { $match: { deletedAt: null } },
    {
      $group: {
        _id: '$doctor',
        totalTasks: { $sum: 1 },
        activeTasks: { $sum: { $cond: ['$isActive', 1, 0] } },
        totalCompleted: { $sum: '$completedCount' },
        totalReminders: { $sum: '$totalReminders' },
        totalMissed: { $sum: '$missedCount' },
        totalSkipped: { $sum: '$skippedCount' },
      },
    },
  ];

  const [taskResults, activeAlerts, patientIds] = await Promise.all([
    PrescriptionTask.aggregate(taskPipeline),
    ComplianceAlert.countDocuments({ status: 'active', deletedAt: null }),
    PrescriptionTask.distinct('patient', { deletedAt: null }),
  ]);

  const totalPatients = patientIds.length;
  let grandCompleted = 0;
  let grandReminders = 0;

  const doctorIds = taskResults.map((r) => r._id).filter(Boolean);
  const doctors = await User.find({ _id: { $in: doctorIds } }).select('name').lean();
  const doctorNameMap = {};
  for (const d of doctors) doctorNameMap[String(d._id)] = d.name;

  const byDoctor = taskResults.map((r) => {
    grandCompleted += r.totalCompleted;
    grandReminders += r.totalReminders;
    const rate = r.totalReminders > 0 ? Math.round((r.totalCompleted / r.totalReminders) * 100) : 0;
    return {
      doctorId: r._id,
      doctorName: doctorNameMap[String(r._id)] || 'Unknown',
      totalTasks: r.totalTasks,
      activeTasks: r.activeTasks,
      complianceRate: rate,
      totalReminders: r.totalReminders,
      totalCompleted: r.totalCompleted,
      totalMissed: r.totalMissed,
    };
  });

  const lowCompPipeline = [
    { $match: { deletedAt: null, totalReminders: { $gte: 3 } } },
    { $group: { _id: '$patient', completed: { $sum: '$completedCount' }, total: { $sum: '$totalReminders' } } },
    { $match: { $expr: { $lt: [{ $divide: ['$completed', '$total'] }, 0.5] } } },
    { $count: 'count' },
  ];
  const lowCompResult = await PrescriptionTask.aggregate(lowCompPipeline);
  const lowComplianceCount = lowCompResult.length > 0 ? lowCompResult[0].count : 0;

  const avgCompliance = grandReminders > 0 ? Math.round((grandCompleted / grandReminders) * 100) : 0;

  const result = { totalPatients, avgCompliance, lowComplianceCount, activeAlerts, byDoctor };
  _setCache(cacheKey, result);
  return result;
}

/* ═══════════════════════════════════════════════════════════════════
   11. Compliance Alerts (paginated list)
   ═══════════════════════════════════════════════════════════════════ */

async function getComplianceAlerts(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ComplianceAlert = conn.model('ComplianceAlert');
  const { parsePagination } = require('../../utils/pagination');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.severity) filter.severity = query.severity;
  if (query.alertType) filter.alertType = query.alertType;

  const [items, total] = await Promise.all([
    ComplianceAlert.find(filter)
      .populate('patient', 'name patientId')
      .populate('doctor', 'name')
      .populate('task', 'title taskType')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    ComplianceAlert.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/* ═══════════════════════════════════════════════════════════════════
   12. Compliance Trends (weekly/monthly rates)
   ═══════════════════════════════════════════════════════════════════ */

async function getComplianceTrends(query, tenantSlug) {
  const cacheKey = `${tenantSlug}:getComplianceTrends:${JSON.stringify(query)}`;
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  const { period = 'weekly', startDate, endDate } = query;
  const conn = await getTenantConnection(tenantSlug);
  const CareReminder = conn.model('CareReminder');

  const match = _baseDateMatch('scheduledAt', startDate, endDate, {
    status: { $in: ['done', 'skipped', 'missed'] },
  });

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: _dateGroupExpr(period, '$scheduledAt'),
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        skipped: { $sum: { $cond: [{ $eq: ['$status', 'skipped'] }, 1, 0] } },
        missed: { $sum: { $cond: [{ $eq: ['$status', 'missed'] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ];

  const results = await CareReminder.aggregate(pipeline);

  const dataPoints = results.map((r) => ({
    period: r._id,
    total: r.total,
    completed: r.completed,
    skipped: r.skipped,
    missed: r.missed,
    complianceRate: r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0,
  }));

  const result = { dataPoints };
  _setCache(cacheKey, result);
  return result;
}

/* ═══════════════════════════════════════════════════════════════════
   13. Resolve Compliance Alert
   ═══════════════════════════════════════════════════════════════════ */

async function resolveComplianceAlert(alertId, data, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ComplianceAlert = conn.model('ComplianceAlert');
  const ApiError = require('../../utils/ApiError');

  const alert = await ComplianceAlert.findById(alertId);
  if (!alert) throw ApiError.notFound('Compliance alert not found');
  if (alert.status !== 'active') throw ApiError.badRequest('Only active alerts can be resolved');

  alert.status = 'resolved';
  alert.resolvedAt = new Date();
  alert.resolvedBy = userId;
  if (data.note) alert.resolveNote = data.note;
  await alert.save();

  return alert;
}

module.exports = {
  getRevenueTrends,
  getAppointmentTrends,
  getDoctorPerformance,
  getNoShowAnalysis,
  getInsuranceClaimTrends,
  getTelemedicineUsage,
  getPatientGrowth,
  getIntegrationUsage,
  getAnalyticsSummary,
  getComplianceOverview,
  getComplianceAlerts,
  getComplianceTrends,
  resolveComplianceAlert,
};
