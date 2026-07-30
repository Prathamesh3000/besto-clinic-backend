'use strict';

const mongoose = require('mongoose');
const { getTenantConnection } = require('../../db/tenantConnectionManager');

async function getBranchOverview(tenantSlug, date) {
  const conn = await getTenantConnection(tenantSlug);
  const Branch = conn.model('Branch');
  const Appointment = conn.model('Appointment');
  const QueueEntry = conn.model('QueueEntry');

  const branches = await Branch.find({ isActive: true, deletedAt: null }).select('name code address phone').lean();

  const targetDate = date ? new Date(date) : new Date();
  const dayStart = new Date(targetDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const results = await Promise.all(
    branches.map(async (branch) => {
      const branchId = branch._id;

      // Appointment stats for the day
      const [apptStats, queueStats] = await Promise.all([
        Appointment.aggregate([
          {
            $match: {
              branch: new mongoose.Types.ObjectId(branchId),
              scheduledAt: { $gte: dayStart, $lte: dayEnd },
              deletedAt: null,
            },
          },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
        ]),
        QueueEntry.aggregate([
          {
            $match: {
              branch: new mongoose.Types.ObjectId(branchId),
              createdAt: { $gte: dayStart, $lte: dayEnd },
              deletedAt: null,
            },
          },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      // Transform aggregation results
      const appointments = {};
      let totalAppointments = 0;
      for (const s of apptStats) {
        appointments[s._id] = s.count;
        totalAppointments += s.count;
      }

      const queue = {};
      let totalQueue = 0;
      for (const s of queueStats) {
        queue[s._id] = s.count;
        totalQueue += s.count;
      }

      return {
        ...branch,
        appointments: {
          total: totalAppointments,
          confirmed: appointments.confirmed || 0,
          checked_in: appointments.checked_in || 0,
          in_progress: appointments.in_progress || 0,
          completed: appointments.completed || 0,
          cancelled: appointments.cancelled || 0,
          requested: appointments.requested || 0,
          no_show: appointments.no_show || 0,
        },
        queue: {
          total: totalQueue,
          waiting: queue.waiting || 0,
          in_consultation: queue.in_consultation || 0,
          completed: queue.completed || 0,
          cancelled: queue.cancelled || 0,
        },
      };
    }),
  );

  return results;
}

module.exports = { getBranchOverview };
