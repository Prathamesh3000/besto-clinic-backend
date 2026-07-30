'use strict';

const appointmentService = require('./appointment.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, total, page, limit } = await appointmentService.listAppointments(req.query, req.user, req.tenantSlug);
  res.json(ApiResponse.paginated('Appointments retrieved', items, { page, limit, total }));
};

exports.getById = async (req, res) => {
  const appointment = await appointmentService.getAppointmentById(req.params.id, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Appointment retrieved', appointment));
};

exports.create = async (req, res) => {
  const appointment = await appointmentService.createAppointment(req.body, req.user, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Appointment created', appointment));
};

exports.update = async (req, res) => {
  const appointment = await appointmentService.updateAppointment(req.params.id, req.body, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Appointment updated', appointment));
};

exports.remove = async (req, res) => {
  await appointmentService.deleteAppointment(req.params.id, req.user, req.tenantSlug);
  res.json(ApiResponse.deleted('Appointment deleted'));
};

exports.getAvailability = async (req, res) => {
  const slots = await appointmentService.getDoctorAvailability(req.params.doctorId, req.query.date, req.tenantSlug, req.query.branch || null);
  res.json(ApiResponse.success('Availability fetched', slots));
};

exports.getAvailabilitySummary = async (req, res) => {
  const { month, year, branch } = req.query;
  if (!month || !year) {
    return res.status(400).json(ApiResponse.error('month and year query parameters are required'));
  }
  const availabilityService = require('../../services/availability.service');
  const result = await availabilityService.getMonthlyAvailabilitySummary(
    req.params.doctorId,
    parseInt(month, 10),
    parseInt(year, 10),
    req.tenantSlug,
    branch || null,
  );
  res.json(ApiResponse.success('Availability summary fetched', result));
};

exports.getDoctorsAvailabilityOverview = async (req, res) => {
  const { date, branch, department } = req.query;
  if (!date) {
    return res.status(400).json(ApiResponse.error('date query parameter is required (YYYY-MM-DD)'));
  }

  const { getTenantConnection } = require('../../db/tenantConnectionManager');
  const availabilityService = require('../../services/availability.service');
  const conn = await getTenantConnection(req.tenantSlug);
  const User = conn.model('User');
  const DoctorSchedule = conn.model('DoctorSchedule');

  // Fetch all active doctors
  const filter = { role: 'doctor', isActive: true, deletedAt: null };
  if (branch) filter.branch = branch;
  if (department) filter.department = department;

  const doctors = await User.find(filter)
    .select('name specialization avatar branch department consultationFee')
    .populate('branch', 'name code')
    .populate('department', 'name')
    .lean();

  // Pre-fetch all doctor schedules in one query
  const doctorIds = doctors.map((d) => d._id);
  const schedules = await DoctorSchedule.find({
    doctor: { $in: doctorIds },
    isActive: true,
    deletedAt: null,
  }).select('doctor branch slotDuration bufferMinutes minNoticeMinutes maxAdvanceDays').lean();
  const scheduleByDoctor = {};
  for (const s of schedules) {
    const key = s.doctor.toString();
    if (!scheduleByDoctor[key]) scheduleByDoctor[key] = s;
  }

  // Fetch availability for each doctor in parallel
  const results = await Promise.all(
    doctors.map(async (doc) => {
      try {
        const avail = await availabilityService.getDoctorAvailability(
          doc._id.toString(), date, req.tenantSlug, doc.branch?._id?.toString() || null,
        );
        const slots = avail.slots || [];
        const futureSlots = slots.filter((s) => !s.isPast);
        const totalSlots = futureSlots.length;
        const availableSlots = futureSlots.filter((s) => s.available).length;
        const nextAvailable = futureSlots.find((s) => s.available);

        let status = 'available';
        if (avail.isOnLeave) status = 'leave';
        else if (avail.isOffDay || avail.isOverrideDayOff || avail.isBranchClosed || avail.isBeyondMaxAdvance) status = 'off';
        else if (availableSlots === 0) status = 'fully_booked';
        else if (totalSlots > 0 && availableSlots / totalSlots <= 0.3) status = 'few_left';

        const sched = scheduleByDoctor[doc._id.toString()];
        return {
          doctor: doc,
          status,
          totalSlots,
          availableSlots,
          nextAvailableSlot: nextAvailable?.display || null,
          isOnLeave: !!avail.isOnLeave,
          leaveReason: avail.leaveReason || null,
          policy: {
            slotDuration: sched?.slotDuration ?? 30,
            bufferMinutes: sched?.bufferMinutes ?? 0,
            minNoticeMinutes: sched?.minNoticeMinutes ?? 60,
            maxAdvanceDays: sched?.maxAdvanceDays ?? 60,
          },
        };
      } catch {
        const sched = scheduleByDoctor[doc._id.toString()];
        return {
          doctor: doc, status: 'unavailable', totalSlots: 0, availableSlots: 0, nextAvailableSlot: null,
          policy: {
            slotDuration: sched?.slotDuration ?? 30,
            bufferMinutes: sched?.bufferMinutes ?? 0,
            minNoticeMinutes: sched?.minNoticeMinutes ?? 60,
            maxAdvanceDays: sched?.maxAdvanceDays ?? 60,
          },
        };
      }
    }),
  );

  res.json(ApiResponse.success('Doctors availability overview', results));
};
