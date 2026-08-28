'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const {
  extractTasks,
  generateReminders,
  scheduleBulkReminders,
  cancelPrescriptionReminders,
} = require('../../utils/careReminderScheduler');

// ── Helpers ─────────────────────────────────────────────────────────

async function _resolvePatientAccess(userId, patientId, conn) {
  const Patient = conn.model('Patient');
  const filter = { $or: [{ user: userId }, { guardian: userId }] };
  if (patientId) filter._id = patientId;
  const patient = await Patient.findOne(filter).lean();
  if (!patient) throw ApiError.forbidden('Access denied to this patient record');
  return patient;
}

// ── Service methods ─────────────────────────────────────────────────

async function enableReminders(prescriptionId, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Prescription = conn.model('Prescription');
  const PrescriptionTask = conn.model('PrescriptionTask');
  const CareReminder = conn.model('CareReminder');

  const prescription = await Prescription.findById(prescriptionId).lean();
  if (!prescription) throw ApiError.notFound('Prescription not found');
  if (prescription.patient.toString() !== patient._id.toString()) {
    throw ApiError.forbidden('This prescription does not belong to you');
  }
  if (prescription.status !== 'active') {
    throw ApiError.badRequest('Can only enable reminders for active prescriptions');
  }
  if (prescription.followUpRemindersEnabled) {
    throw ApiError.badRequest('Reminders are already enabled for this prescription');
  }

  // Extract tasks from medications (handles all task types)
  const taskDocs = extractTasks(prescription);
  const savedTasks = await PrescriptionTask.insertMany(taskDocs);

  // Generate reminders for each task
  let allReminders = [];
  for (const task of savedTasks) {
    const reminders = generateReminders(task);
    allReminders = allReminders.concat(reminders);
  }

  let savedReminders = [];
  if (allReminders.length > 0) {
    savedReminders = await CareReminder.insertMany(allReminders);
    await scheduleBulkReminders(savedReminders, tenantSlug);
  }

  // Update task totalReminders with actual count
  for (const task of savedTasks) {
    const count = savedReminders.filter(r => r.task.toString() === task._id.toString()).length;
    if (count !== task.totalReminders) {
      await PrescriptionTask.findByIdAndUpdate(task._id, { totalReminders: count || 1 });
    }
  }

  // Update prescription flags
  await Prescription.findByIdAndUpdate(prescriptionId, {
    followUpRemindersEnabled: true,
    reminderOptInAt: new Date(),
    tasksExtracted: true,
  });

  // Compute firstReminderAt / lastReminderAt
  let firstReminderAt = null;
  let lastReminderAt = null;
  if (savedReminders.length > 0) {
    const sorted = savedReminders
      .map(r => new Date(r.scheduledAt))
      .sort((a, b) => a - b);
    firstReminderAt = sorted[0];
    lastReminderAt = sorted[sorted.length - 1];
  }

  return {
    prescription: prescriptionId,
    tasksCreated: savedTasks.length,
    totalReminders: savedReminders.length,
    firstReminderAt,
    lastReminderAt,
  };
}

async function disableReminders(prescriptionId, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Prescription = conn.model('Prescription');
  const PrescriptionTask = conn.model('PrescriptionTask');
  const CareReminder = conn.model('CareReminder');

  const prescription = await Prescription.findById(prescriptionId).lean();
  if (!prescription) throw ApiError.notFound('Prescription not found');
  if (prescription.patient.toString() !== patient._id.toString()) {
    throw ApiError.forbidden('This prescription does not belong to you');
  }
  if (!prescription.followUpRemindersEnabled) {
    throw ApiError.badRequest('Reminders are not enabled for this prescription');
  }

  // Find pending/sent reminders to cancel
  const pendingReminders = await CareReminder.find({
    prescription: prescriptionId,
    status: { $in: ['pending', 'sent'] },
  }).select('_id').lean();

  if (pendingReminders.length > 0) {
    const ids = pendingReminders.map(r => r._id);
    await cancelPrescriptionReminders(ids);
    await CareReminder.updateMany(
      { _id: { $in: ids } },
      { status: 'cancelled' },
    );
  }

  // Deactivate tasks
  await PrescriptionTask.updateMany(
    { prescription: prescriptionId, isActive: true },
    { isActive: false, deactivatedAt: new Date() },
  );

  // Update prescription flag
  await Prescription.findByIdAndUpdate(prescriptionId, {
    followUpRemindersEnabled: false,
  });

  return {
    cancelledReminders: pendingReminders.length,
    cancelledJobs: pendingReminders.length,
  };
}

async function listCareTasks(query, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const PrescriptionTask = conn.model('PrescriptionTask');
  const CareReminder = conn.model('CareReminder');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { patient: patient._id };
  if (query.status === 'active') filter.isActive = true;
  else if (query.status === 'completed') filter.isActive = false;

  const [items, total] = await Promise.all([
    PrescriptionTask.find(filter)
      .populate('prescription', 'diagnosis medications')
      .populate('doctor', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    PrescriptionTask.countDocuments(filter),
  ]);

  // Add nextReminder for each active task
  const enrichedItems = await Promise.all(items.map(async (task) => {
    if (!task.isActive) return task;
    const nextReminder = await CareReminder.findOne({
      task: task._id,
      status: 'pending',
      scheduledAt: { $gt: new Date() },
    })
      .sort({ scheduledAt: 1 })
      .select('scheduledAt')
      .lean();
    return { ...task, nextReminder: nextReminder?.scheduledAt || null };
  }));

  return { items: enrichedItems, total, page, limit };
}

async function respondToReminder(taskId, reminderId, { status, note }, patientId, userId, tenantSlug, opts = {}) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const CareReminder = conn.model('CareReminder');
  const PrescriptionTask = conn.model('PrescriptionTask');

  const reminder = await CareReminder.findById(reminderId);
  if (!reminder) throw ApiError.notFound('Reminder not found');
  if (reminder.task.toString() !== taskId) {
    throw ApiError.badRequest('Reminder does not belong to this task');
  }
  if (reminder.patient.toString() !== patient._id.toString()) {
    throw ApiError.forbidden('This reminder does not belong to you');
  }
  if (!['pending', 'sent'].includes(reminder.status)) {
    throw ApiError.badRequest('This reminder has already been responded to');
  }

  // Update reminder
  reminder.status = status;
  reminder.response = status; // 'done' or 'skipped'
  reminder.respondedAt = new Date();
  if (note) reminder.responseNote = note;
  if (opts.respondedBy) reminder.respondedBy = opts.respondedBy;
  if (opts.respondedByRole) reminder.respondedByRole = opts.respondedByRole;
  await reminder.save();

  // Update task counters
  const incField = status === 'done' ? 'completedCount' : 'skippedCount';
  const task = await PrescriptionTask.findByIdAndUpdate(
    taskId,
    { $inc: { [incField]: 1 } },
    { new: true, lean: true },
  );

  // Cancel the check-missed job for this reminder
  try {
    const { careReminderQueue } = require('../../jobs/queues');
    const job = await careReminderQueue.getJob(`missed-${reminderId}`);
    if (job) await job.remove();
  } catch (_) { /* ignore */ }

  // Auto-complete task if all reminders responded
  if (task) {
    const responded = (task.completedCount || 0) + (task.skippedCount || 0) + (task.missedCount || 0);
    if (responded >= task.totalReminders && task.isActive) {
      await PrescriptionTask.findByIdAndUpdate(taskId, { isActive: false });
    }
  }

  return {
    reminder: reminder.toObject(),
    task: {
      completedCount: task?.completedCount || 0,
      completionRate: task && task.totalReminders > 0
        ? Math.round((task.completedCount / task.totalReminders) * 100)
        : 0,
    },
  };
}

async function listTaskReminders(taskId, query, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const PrescriptionTask = conn.model('PrescriptionTask');
  const CareReminder = conn.model('CareReminder');

  const task = await PrescriptionTask.findById(taskId).lean();
  if (!task) throw ApiError.notFound('Task not found');
  if (task.patient.toString() !== patient._id.toString()) {
    throw ApiError.forbidden('This task does not belong to you');
  }

  const filter = { task: taskId };

  // Filter by date range: 'today' returns only today's reminders
  if (query.range === 'today') {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    filter.scheduledAt = { $gte: startOfDay, $lte: endOfDay };
  } else if (query.status) {
    filter.status = query.status;
  }

  const reminders = await CareReminder.find(filter)
    .sort({ scheduledAt: 1 })
    .lean();

  return reminders;
}

async function getPatientCompliance(patientId, query, doctorId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const PrescriptionTask = conn.model('PrescriptionTask');
  const CareReminder = conn.model('CareReminder');
  const Patient = conn.model('Patient');

  const patient = await Patient.findById(patientId).select('name patientId').lean();
  if (!patient) throw ApiError.notFound('Patient not found');

  // Get all tasks for this patient grouped by prescription
  const tasks = await PrescriptionTask.find({ patient: patientId })
    .populate('prescription', 'diagnosis createdAt')
    .populate('doctor', 'name')
    .sort({ createdAt: -1 })
    .lean({ virtuals: true });

  // Group tasks by prescription for per-prescription compliance
  const prescriptionMap = {};
  let totalCompleted = 0;
  let totalSkipped = 0;
  let totalMissed = 0;
  let totalReminders = 0;

  for (const task of tasks) {
    const rxId = task.prescription?._id?.toString() || 'unknown';
    if (!prescriptionMap[rxId]) {
      prescriptionMap[rxId] = {
        _id: rxId,
        diagnosis: task.prescription?.diagnosis || '',
        createdAt: task.prescription?.createdAt,
        tasks: [],
        totalCompleted: 0,
        totalSkipped: 0,
        totalMissed: 0,
        totalReminders: 0,
      };
    }

    const rx = prescriptionMap[rxId];
    rx.tasks.push({
      // `_id` and `isActive` are what the compliance screens need to render and
      // operate the per-task toggle. Omitting them meant every switch rendered
      // as ON (`undefined !== false`) and toggling called
      // /care-tasks/undefined/toggle.
      _id: task._id,
      isActive: task.isActive !== false,
      title: task.title,
      taskType: task.taskType,
      frequency: task.frequency,
      completionRate: task.completionRate || 0,
      completedCount: task.completedCount || 0,
      totalReminders: task.totalReminders || 0,
      skippedCount: task.skippedCount || 0,
      missedCount: task.missedCount || 0,
    });

    rx.totalCompleted += task.completedCount || 0;
    rx.totalSkipped += task.skippedCount || 0;
    rx.totalMissed += task.missedCount || 0;
    rx.totalReminders += task.totalReminders || 0;

    totalCompleted += task.completedCount || 0;
    totalSkipped += task.skippedCount || 0;
    totalMissed += task.missedCount || 0;
    totalReminders += task.totalReminders || 0;
  }

  // Compute per-prescription compliance rates
  const prescriptions = Object.values(prescriptionMap).map(rx => ({
    ...rx,
    overallComplianceRate: rx.totalReminders > 0
      ? Math.round((rx.totalCompleted / rx.totalReminders) * 100)
      : 0,
  }));

  const averageCompliance = totalReminders > 0
    ? Math.round((totalCompleted / totalReminders) * 100)
    : 0;

  // Recent 20 reminders
  const recentReminders = await CareReminder.find({ patient: patientId })
    .populate('task', 'title taskType')
    .sort({ scheduledAt: -1 })
    .limit(20)
    .lean();

  return {
    patient,
    prescriptions,
    averageCompliance,
    // Patient-level roll-up. These were already being accumulated above but never
    // returned, so callers could only get skipped/missed by summing the
    // per-prescription figures themselves.
    totals: {
      completed: totalCompleted,
      skipped: totalSkipped,
      missed: totalMissed,
      reminders: totalReminders,
    },
    recentReminders,
  };
}

async function toggleTaskReminder(taskId, patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const PrescriptionTask = conn.model('PrescriptionTask');
  const CareReminder = conn.model('CareReminder');
  const Prescription = conn.model('Prescription');

  const task = await PrescriptionTask.findById(taskId);
  if (!task) throw ApiError.notFound('Task not found');
  if (task.patient.toString() !== patient._id.toString()) {
    throw ApiError.forbidden('This task does not belong to you');
  }

  if (task.isActive) {
    // ── Deactivate ──
    const pendingReminders = await CareReminder.find({
      task: taskId,
      status: { $in: ['pending', 'sent'] },
    }).select('_id').lean();

    if (pendingReminders.length > 0) {
      const ids = pendingReminders.map(r => r._id);
      await cancelPrescriptionReminders(ids);
      await CareReminder.updateMany({ _id: { $in: ids } }, { status: 'cancelled' });
    }

    task.isActive = false;
    task.deactivatedAt = new Date();
    await task.save();

    // If no other active tasks for this prescription, disable prescription flag
    const otherActive = await PrescriptionTask.countDocuments({
      prescription: task.prescription,
      isActive: true,
      _id: { $ne: taskId },
    });
    if (otherActive === 0) {
      await Prescription.findByIdAndUpdate(task.prescription, {
        followUpRemindersEnabled: false,
      });
    }

    return { taskId, isActive: false, cancelledReminders: pendingReminders.length };
  } else {
    // ── Reactivate ──
    if (task.endDate && new Date(task.endDate) <= new Date()) {
      throw ApiError.badRequest('Cannot reactivate an expired task');
    }

    task.isActive = true;
    task.deactivatedAt = undefined;
    await task.save();

    // Regenerate future reminders
    const newReminders = generateReminders(task.toObject());
    let savedReminders = [];
    if (newReminders.length > 0) {
      savedReminders = await CareReminder.insertMany(newReminders);
      await scheduleBulkReminders(savedReminders, tenantSlug);
    }

    // Update task totalReminders
    const totalCount = await CareReminder.countDocuments({
      task: taskId,
      status: { $ne: 'cancelled' },
    });
    await PrescriptionTask.findByIdAndUpdate(taskId, { totalReminders: totalCount });

    // Ensure prescription flag is on
    await Prescription.findByIdAndUpdate(task.prescription, {
      followUpRemindersEnabled: true,
    });

    return { taskId, isActive: true, newReminders: savedReminders.length };
  }
}

async function getDailyCareSchedule(patientId, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const CareReminder = conn.model('CareReminder');

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const reminders = await CareReminder.find({
    patient: patient._id,
    scheduledAt: { $gte: startOfDay, $lte: endOfDay },
  })
    .populate({
      path: 'task',
      select: 'title taskType frequency instructions',
      populate: { path: 'prescription', select: 'diagnosis' },
    })
    .sort({ scheduledAt: 1 })
    .lean();

  const stats = { total: reminders.length, completed: 0, pending: 0, skipped: 0, missed: 0 };
  for (const r of reminders) {
    if (r.status === 'done') stats.completed++;
    else if (r.status === 'skipped') stats.skipped++;
    else if (r.status === 'missed') stats.missed++;
    else stats.pending++;
  }

  return { date: startOfDay.toISOString().slice(0, 10), reminders, stats };
}

async function getGuardianDependentCompliance(dependentId, guardianUserId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');

  const dependent = await Patient.findOne({
    _id: dependentId,
    guardian: guardianUserId,
    deletedAt: null,
  }).select('name patientId').lean();
  if (!dependent) throw ApiError.forbidden('Not authorized to view this dependent');

  // Reuse compliance logic
  const PrescriptionTask = conn.model('PrescriptionTask');
  const CareReminder = conn.model('CareReminder');

  const tasks = await PrescriptionTask.find({ patient: dependentId })
    .populate('prescription', 'diagnosis createdAt')
    .populate('doctor', 'name')
    .sort({ createdAt: -1 })
    .lean({ virtuals: true });

  const prescriptionMap = {};
  let totalCompleted = 0, totalReminders = 0;

  for (const task of tasks) {
    const rxId = task.prescription?._id?.toString() || 'unknown';
    if (!prescriptionMap[rxId]) {
      prescriptionMap[rxId] = {
        _id: rxId,
        diagnosis: task.prescription?.diagnosis || '',
        createdAt: task.prescription?.createdAt,
        tasks: [],
        totalCompleted: 0,
        totalSkipped: 0,
        totalMissed: 0,
        totalReminders: 0,
      };
    }
    const rx = prescriptionMap[rxId];
    rx.tasks.push({
      // `_id` and `isActive` are what the compliance screens need to render and
      // operate the per-task toggle. Omitting them meant every switch rendered
      // as ON (`undefined !== false`) and toggling called
      // /care-tasks/undefined/toggle.
      _id: task._id,
      isActive: task.isActive !== false,
      title: task.title,
      taskType: task.taskType,
      frequency: task.frequency,
      completionRate: task.completionRate || 0,
      completedCount: task.completedCount || 0,
      totalReminders: task.totalReminders || 0,
      skippedCount: task.skippedCount || 0,
      missedCount: task.missedCount || 0,
    });
    rx.totalCompleted += task.completedCount || 0;
    rx.totalSkipped += task.skippedCount || 0;
    rx.totalMissed += task.missedCount || 0;
    rx.totalReminders += task.totalReminders || 0;
    totalCompleted += task.completedCount || 0;
    totalReminders += task.totalReminders || 0;
  }

  const prescriptions = Object.values(prescriptionMap).map(rx => ({
    ...rx,
    overallComplianceRate: rx.totalReminders > 0
      ? Math.round((rx.totalCompleted / rx.totalReminders) * 100) : 0,
  }));

  const averageCompliance = totalReminders > 0
    ? Math.round((totalCompleted / totalReminders) * 100) : 0;

  const recentReminders = await CareReminder.find({ patient: dependentId })
    .populate('task', 'title taskType')
    .sort({ scheduledAt: -1 })
    .limit(20)
    .lean();

  return { patient: dependent, prescriptions, averageCompliance, recentReminders };
}

async function getGuardianDependentDailySchedule(dependentId, guardianUserId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');

  const dependent = await Patient.findOne({
    _id: dependentId,
    guardian: guardianUserId,
    deletedAt: null,
  }).select('name patientId').lean();
  if (!dependent) throw ApiError.forbidden('Not authorized to view this dependent');

  const CareReminder = conn.model('CareReminder');
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const reminders = await CareReminder.find({
    patient: dependentId,
    scheduledAt: { $gte: startOfDay, $lte: endOfDay },
  })
    .populate({
      path: 'task',
      select: 'title taskType frequency instructions',
      populate: { path: 'prescription', select: 'diagnosis' },
    })
    .sort({ scheduledAt: 1 })
    .lean();

  const stats = { total: reminders.length, completed: 0, pending: 0, skipped: 0, missed: 0 };
  for (const r of reminders) {
    if (r.status === 'done') stats.completed++;
    else if (r.status === 'skipped') stats.skipped++;
    else if (r.status === 'missed') stats.missed++;
    else stats.pending++;
  }

  return {
    dependent: { _id: dependent._id, name: dependent.name },
    date: startOfDay.toISOString().slice(0, 10),
    reminders,
    stats,
  };
}

// ── Guardian care actions ──────────────────────────────────────────

async function respondToReminderAsGuardian(dependentId, taskId, reminderId, body, guardianUserId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');

  const dependent = await Patient.findOne({
    _id: dependentId,
    guardian: guardianUserId,
    deletedAt: null,
  }).select('_id').lean();
  if (!dependent) throw ApiError.forbidden('Not authorized to manage this dependent');

  // Delegate to respondToReminder with guardian context
  return respondToReminder(taskId, reminderId, body, dependentId, guardianUserId, tenantSlug, {
    respondedBy: guardianUserId,
    respondedByRole: 'guardian',
  });
}

async function toggleTaskReminderAsGuardian(dependentId, taskId, guardianUserId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');

  const dependent = await Patient.findOne({
    _id: dependentId,
    guardian: guardianUserId,
    deletedAt: null,
  }).select('_id').lean();
  if (!dependent) throw ApiError.forbidden('Not authorized to manage this dependent');

  return toggleTaskReminder(taskId, dependentId, guardianUserId, tenantSlug);
}

async function toggleTaskReminderAsDoctor(patientId, taskId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');

  const patient = await Patient.findOne({ _id: patientId, deletedAt: null }).select('_id user').lean();
  if (!patient) throw ApiError.notFound('Patient not found');

  // Delegate to core toggle, passing patient's own userId to pass _resolvePatientAccess
  return toggleTaskReminder(taskId, patientId, patient.user.toString(), tenantSlug);
}

// ── Notification preference ────────────────────────────────────────

async function updateNotificationPreference(patientId, channel, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const Patient = conn.model('Patient');
  await Patient.findByIdAndUpdate(patient._id, { preferredReminderChannel: channel });

  return { patientId: patient._id, preferredReminderChannel: channel };
}

// ── Staff-initiated enable/disable (doctor or admin — no patient access check) ──

async function enableRemindersAsStaff(prescriptionId, patientId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Prescription = conn.model('Prescription');
  const PrescriptionTask = conn.model('PrescriptionTask');
  const CareReminder = conn.model('CareReminder');

  const prescription = await Prescription.findById(prescriptionId).lean();
  if (!prescription) throw ApiError.notFound('Prescription not found');
  if (prescription.patient.toString() !== patientId) {
    throw ApiError.badRequest('Prescription does not belong to this patient');
  }
  if (prescription.status !== 'active') {
    throw ApiError.badRequest('Can only enable reminders for active prescriptions');
  }
  if (prescription.followUpRemindersEnabled) {
    throw ApiError.badRequest('Reminders are already enabled for this prescription');
  }

  const taskDocs = extractTasks(prescription);
  const savedTasks = await PrescriptionTask.insertMany(taskDocs);

  let allReminders = [];
  for (const task of savedTasks) {
    const reminders = generateReminders(task);
    allReminders = allReminders.concat(reminders);
  }

  let savedReminders = [];
  if (allReminders.length > 0) {
    savedReminders = await CareReminder.insertMany(allReminders);
    await scheduleBulkReminders(savedReminders, tenantSlug);
  }

  for (const task of savedTasks) {
    const count = savedReminders.filter(r => r.task.toString() === task._id.toString()).length;
    if (count !== task.totalReminders) {
      await PrescriptionTask.findByIdAndUpdate(task._id, { totalReminders: count || 1 });
    }
  }

  await Prescription.findByIdAndUpdate(prescriptionId, {
    followUpRemindersEnabled: true,
    reminderOptInAt: new Date(),
    tasksExtracted: true,
  });

  let firstReminderAt = null;
  let lastReminderAt = null;
  if (savedReminders.length > 0) {
    const sorted = savedReminders.map(r => new Date(r.scheduledAt)).sort((a, b) => a - b);
    firstReminderAt = sorted[0];
    lastReminderAt = sorted[sorted.length - 1];
  }

  return {
    prescription: prescriptionId,
    tasksCreated: savedTasks.length,
    totalReminders: savedReminders.length,
    firstReminderAt,
    lastReminderAt,
  };
}

async function disableRemindersAsStaff(prescriptionId, patientId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Prescription = conn.model('Prescription');
  const PrescriptionTask = conn.model('PrescriptionTask');
  const CareReminder = conn.model('CareReminder');

  const prescription = await Prescription.findById(prescriptionId).lean();
  if (!prescription) throw ApiError.notFound('Prescription not found');
  if (prescription.patient.toString() !== patientId) {
    throw ApiError.badRequest('Prescription does not belong to this patient');
  }
  if (!prescription.followUpRemindersEnabled) {
    throw ApiError.badRequest('Reminders are not enabled for this prescription');
  }

  const pendingReminders = await CareReminder.find({
    prescription: prescriptionId,
    status: { $in: ['pending', 'sent'] },
  }).select('_id').lean();

  if (pendingReminders.length > 0) {
    const ids = pendingReminders.map(r => r._id);
    await cancelPrescriptionReminders(ids);
    await CareReminder.updateMany({ _id: { $in: ids } }, { status: 'cancelled' });
  }

  await PrescriptionTask.updateMany(
    { prescription: prescriptionId, isActive: true },
    { isActive: false, deactivatedAt: new Date() },
  );

  await Prescription.findByIdAndUpdate(prescriptionId, {
    followUpRemindersEnabled: false,
  });

  return {
    cancelledReminders: pendingReminders.length,
    cancelledJobs: pendingReminders.length,
  };
}

// ── Batch respond (EOD checklist) ────────────────────────────────────

async function batchRespondToReminders(responses, patientId, userId, tenantSlug, opts = {}) {
  const conn = await getTenantConnection(tenantSlug);
  const patient = await _resolvePatientAccess(userId, patientId, conn);

  const CareReminder = conn.model('CareReminder');
  const PrescriptionTask = conn.model('PrescriptionTask');

  const results = [];
  const taskIncs = {}; // { taskId: { completedCount: N, skippedCount: N } }

  for (const { reminderId, taskId, status } of responses) {
    const reminder = await CareReminder.findById(reminderId);
    if (!reminder) continue;
    if (reminder.patient.toString() !== patient._id.toString()) continue;
    if (!['pending', 'sent'].includes(reminder.status)) continue;

    reminder.status = status;
    reminder.response = status;
    reminder.respondedAt = new Date();
    if (opts.respondedBy) reminder.respondedBy = opts.respondedBy;
    if (opts.respondedByRole) reminder.respondedByRole = opts.respondedByRole;
    await reminder.save();

    if (!taskIncs[taskId]) taskIncs[taskId] = { completedCount: 0, skippedCount: 0 };
    if (status === 'done') taskIncs[taskId].completedCount++;
    else taskIncs[taskId].skippedCount++;

    results.push({ reminderId, taskId, status });
  }

  // Apply batched counter increments per task
  for (const [taskId, incs] of Object.entries(taskIncs)) {
    const update = {};
    if (incs.completedCount) update.completedCount = incs.completedCount;
    if (incs.skippedCount) update.skippedCount = incs.skippedCount;

    const task = await PrescriptionTask.findByIdAndUpdate(
      taskId,
      { $inc: update },
      { new: true, lean: true },
    );

    // Auto-complete task if all reminders responded
    if (task) {
      const responded = (task.completedCount || 0) + (task.skippedCount || 0) + (task.missedCount || 0);
      if (responded >= task.totalReminders && task.isActive) {
        await PrescriptionTask.findByIdAndUpdate(taskId, { isActive: false });
      }
    }
  }

  // Cancel pending missed-check jobs
  try {
    const { careReminderQueue } = require('../../jobs/queues');
    for (const { reminderId } of results) {
      for (const prefix of ['missed-', 'eod-missed-']) {
        const job = await careReminderQueue.getJob(`${prefix}${reminderId}`);
        if (job) await job.remove();
      }
    }
  } catch (_) { /* ignore */ }

  return { responded: results.length, results };
}

async function batchRespondToRemindersAsGuardian(dependentId, responses, guardianUserId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');

  const dependent = await Patient.findOne({
    _id: dependentId,
    guardian: guardianUserId,
    deletedAt: null,
  }).select('_id').lean();
  if (!dependent) throw ApiError.forbidden('Not authorized to manage this dependent');

  return batchRespondToReminders(responses, dependentId, guardianUserId, tenantSlug, {
    respondedBy: guardianUserId,
    respondedByRole: 'guardian',
  });
}

module.exports = {
  enableReminders,
  disableReminders,
  listCareTasks,
  listTaskReminders,
  respondToReminder,
  getPatientCompliance,
  toggleTaskReminder,
  getDailyCareSchedule,
  getGuardianDependentCompliance,
  getGuardianDependentDailySchedule,
  respondToReminderAsGuardian,
  toggleTaskReminderAsGuardian,
  toggleTaskReminderAsDoctor,
  updateNotificationPreference,
  enableRemindersAsStaff,
  disableRemindersAsStaff,
  batchRespondToReminders,
  batchRespondToRemindersAsGuardian,
};
