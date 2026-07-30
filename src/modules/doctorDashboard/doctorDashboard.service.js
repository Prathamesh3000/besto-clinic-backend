'use strict';

const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { APPOINTMENT_STATUS, INVOICE_STATUS, ROLE_GROUPS } = require('../../config/constants');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { uploadFile } = require('../../services/storage.service');
const { notifyAndEmit } = require('../../utils/notifyAndEmit');
const { logAccess } = require('../../utils/logAccess');

// ── Dashboard Stats ─────────────────────────────────────

async function getDoctorDashboardStats(doctorId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');
  const Invoice = conn.model('Invoice');
  const EmergencySession = conn.model('EmergencySession');

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date();
  monthEnd.setMonth(monthEnd.getMonth() + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);

  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(23, 59, 59, 999);

  const doctorOid = new mongoose.Types.ObjectId(doctorId);

  const [
    todayTotal,
    todayCompleted,
    weekTotal,
    patientsThisMonth,
    revenueResult,
    pendingEmergencies,
    nextAppointment,
    upcomingFollowUps,
  ] = await Promise.all([
    // 1. Today's total appointments
    Appointment.countDocuments({
      doctor: doctorId,
      scheduledAt: { $gte: todayStart, $lte: todayEnd },
      status: { $ne: APPOINTMENT_STATUS.CANCELLED },
    }),

    // 2. Today's completed
    Appointment.countDocuments({
      doctor: doctorId,
      scheduledAt: { $gte: todayStart, $lte: todayEnd },
      status: APPOINTMENT_STATUS.COMPLETED,
    }),

    // 3. This week's total appointments
    Appointment.countDocuments({
      doctor: doctorId,
      scheduledAt: { $gte: todayStart, $lte: weekEnd },
      status: { $ne: APPOINTMENT_STATUS.CANCELLED },
    }),

    // 4. Unique patients this month
    Appointment.distinct('patient', {
      doctor: doctorId,
      scheduledAt: { $gte: monthStart, $lte: monthEnd },
      status: APPOINTMENT_STATUS.COMPLETED,
    }),

    // 5. Revenue this month — collected from paid and partially paid invoices
    Invoice.aggregate([
      {
        $match: {
          doctor: doctorOid,
          status: { $in: [INVOICE_STATUS.PAID, INVOICE_STATUS.PARTIALLY_PAID] },
          deletedAt: null,
          $or: [
            { paidAt: { $gte: monthStart, $lte: monthEnd } },
            { status: INVOICE_STATUS.PARTIALLY_PAID, updatedAt: { $gte: monthStart, $lte: monthEnd } },
          ],
        },
      },
      { $group: { _id: null, total: { $sum: '$paidAmount' } } },
    ]),

    // 6. Pending emergency requests (scoped to this doctor)
    EmergencySession.countDocuments({ doctor: doctorId, status: 'requested' }),

    // 7. Next upcoming appointment
    Appointment.findOne({
      doctor: doctorId,
      scheduledAt: { $gt: new Date() },
      status: { $in: [APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.CHECKED_IN, APPOINTMENT_STATUS.REQUESTED] },
    })
      .sort({ scheduledAt: 1 })
      .populate('patient', 'name patientId')
      .lean(),

    // 8. Follow-ups this week
    Appointment.find({
      doctor: doctorId,
      type: 'follow_up',
      scheduledAt: { $gte: todayStart, $lte: weekEnd },
      status: { $in: [APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.REQUESTED] },
    })
      .sort({ scheduledAt: 1 })
      .limit(10)
      .populate('patient', 'name patientId')
      .lean(),
  ]);

  // Current room assignment
  const ConsultationRoom = conn.model('ConsultationRoom');
  const currentRoom = await ConsultationRoom.findOne({
    currentDoctor: doctorId, status: 'occupied', deletedAt: null,
  }).select('name code type floor').populate('branch', 'name').lean();

  return {
    todayTotal,
    todayCompleted,
    weekTotal,
    patientsThisMonth: patientsThisMonth.length,
    revenueThisMonth: revenueResult.length > 0 ? revenueResult[0].total : 0,
    pendingEmergencies,
    nextAppointment,
    upcomingFollowUps,
    currentRoom,
  };
}

// ── Start Consultation ──────────────────────────────────

async function startConsultation(data, callerId, tenantSlug, callerRole) {
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');
  const TreatmentRecord = conn.model('TreatmentRecord');

  const appointment = await Appointment.findById(data.appointmentId)
    .populate('patient', 'name patientId');
  if (!appointment) throw ApiError.notFound('Appointment not found');
  if (!appointment.patient) throw ApiError.badRequest('This appointment references a deleted patient and cannot be used');

  const isAdmin = ROLE_GROUPS.ADMIN.includes(callerRole);
  const doctorId = isAdmin ? String(appointment.doctor) : callerId;

  if (!isAdmin && String(appointment.doctor) !== callerId) {
    throw ApiError.forbidden('This appointment is not assigned to you');
  }

  // If appointment already in_progress or in a terminal state, return existing TreatmentRecord
  const resumableStatuses = [
    APPOINTMENT_STATUS.IN_PROGRESS,
    APPOINTMENT_STATUS.COMPLETED,
    APPOINTMENT_STATUS.CANCELLED,
    APPOINTMENT_STATUS.NO_SHOW,
  ];
  if (resumableStatuses.includes(appointment.status)) {
    const existingRecord = await TreatmentRecord.findOne({
      appointment: appointment._id,
      doctor: doctorId,
      deletedAt: null,
    });
    if (existingRecord) {
      const ConsultationRoomModel = conn.model('ConsultationRoom');
      const room = await ConsultationRoomModel.findOne({
        currentDoctor: doctorId, status: 'occupied', deletedAt: null,
      }).select('name code type floor').populate('branch', 'name').lean();
      return { record: existingRecord, room };
    }
    // For terminal statuses with no record, don't allow creating one
    if (appointment.status !== APPOINTMENT_STATUS.IN_PROGRESS) {
      throw ApiError.badRequest(`No consultation record found for this ${appointment.status} appointment`);
    }
    // If in_progress with no record (data inconsistency), fall through to create one
  }

  const validStatuses = [APPOINTMENT_STATUS.REQUESTED, APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.CHECKED_IN, APPOINTMENT_STATUS.IN_PROGRESS];
  if (!validStatuses.includes(appointment.status)) {
    throw ApiError.badRequest(`Cannot start consultation — appointment status is "${appointment.status}"`);
  }

  const record = await TreatmentRecord.create({
    patient: appointment.patient._id || appointment.patient,
    doctor: doctorId,
    appointment: appointment._id,
    diagnosis: data.diagnosis || 'In progress',
    treatment: data.treatment || 'In progress',
    notes: data.notes || '',
    createdBy: doctorId,
  });

  appointment.status = APPOINTMENT_STATUS.IN_PROGRESS;
  appointment.startedAt = new Date();
  await appointment.save();

  // Broadcast appointment status change
  try {
    const { emitToTenant } = require('../../websocket');
    emitToTenant(tenantSlug, 'appointment:update', {
      appointmentId: appointment._id,
      status: APPOINTMENT_STATUS.IN_PROGRESS,
      branch: String(appointment.branch || ''),
    });
  } catch (_) { /* non-blocking */ }

  // Assign room + sync queue entry
  const ConsultationRoom = conn.model('ConsultationRoom');
  const QueueEntry = conn.model('QueueEntry');

  const linkedQueue = await QueueEntry.findOne({
    appointment: appointment._id,
    status: { $in: ['waiting', 'in_consultation'] },
  });

  const alreadyHandled = linkedQueue?.status === 'in_consultation' && linkedQueue?.room;

  if (!alreadyHandled) {
    let room = null;
    const patientId = appointment.patient._id || appointment.patient;

    if (data.roomId) {
      // Explicit room selection — use the specific room chosen by user
      room = await ConsultationRoom.findOneAndUpdate(
        { _id: data.roomId, isActive: true, deletedAt: null },
        {
          status: 'occupied',
          currentDoctor: doctorId,
          currentPatient: patientId,
          currentAppointment: appointment._id,
          occupiedSince: new Date(),
        },
        { new: true },
      );
    } else {
      // Auto-assign: resolve branch → find first available room
      let branchId = appointment.branch || (linkedQueue?.branch) || null;

      if (!branchId) {
        const DoctorSchedule = conn.model('DoctorSchedule');
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const today = days[new Date().getDay()];
        const sched = await DoctorSchedule.findOne({
          doctor: doctorId,
          isActive: true,
          'weeklySchedule.day': today,
          'weeklySchedule.isWorking': true,
        }).select('branch').lean();
        if (sched?.branch) branchId = sched.branch;
      }

      if (branchId) {
        room = await ConsultationRoom.findOneAndUpdate(
          { branch: branchId, status: 'available', isActive: true, deletedAt: null },
          {
            status: 'occupied',
            currentDoctor: doctorId,
            currentPatient: patientId,
            currentAppointment: appointment._id,
            occupiedSince: new Date(),
          },
          { new: true, sort: { type: 1, code: 1 } },
        );
      }
    }

    // Sync queue entry: mark as in_consultation + link room
    if (linkedQueue) {
      linkedQueue.status = 'in_consultation';
      linkedQueue.calledAt = linkedQueue.calledAt || new Date();
      if (room) linkedQueue.room = room._id;
      await linkedQueue.save();
    }
  }

  // Notify patient that consultation has started
  const Patient = conn.model('Patient');
  const User = conn.model('User');
  const patientDoc = await Patient.findById(appointment.patient._id || appointment.patient).select('user').lean();
  const doctor = await User.findById(doctorId).select('name').lean();
  if (patientDoc?.user) {
    await notifyAndEmit({
      recipient: patientDoc.user,
      title: 'Consultation Started',
      message: `Dr. ${doctor?.name || 'Your doctor'} has started your consultation.`,
      type: 'appointment',
      metadata: { appointmentId: appointment._id, treatmentId: record._id },
    }, tenantSlug);

    // Send FCM push so patient gets notified even when app is backgrounded/killed
    try {
      const fcmService = require('../../services/fcm.service');
      await fcmService.sendConsultationStarted(patientDoc.user, tenantSlug, {
        doctorName: doctor?.name,
        appointmentId: appointment._id,
        treatmentId: record._id,
      });
    } catch (fcmErr) {
      require('../../utils/logger').warn('FCM consultation-started push failed: %s', fcmErr.message);
    }
  }

  // Notify front-desk and admin staff that consultation started
  const { notifyFrontDesk } = require('../../utils/notifyFrontDesk');
  const { notifyAdmins } = require('../../utils/notifyAdmins');
  const consultStartMsg = `Dr. ${doctor?.name || 'A doctor'} started consultation with ${appointment.patient.name || 'a patient'}.`;
  const consultStartMeta = { appointmentId: appointment._id, treatmentId: record._id };

  notifyFrontDesk(tenantSlug, {
    title: 'Consultation Started',
    message: consultStartMsg,
    type: 'appointment',
    metadata: consultStartMeta,
  }); // fire-and-forget
  notifyAdmins(tenantSlug, {
    title: 'Consultation Started',
    message: consultStartMsg,
    type: 'appointment',
    metadata: consultStartMeta,
  }, { excludeUserId: callerId }); // fire-and-forget

  // Emit dedicated consultation socket event
  try {
    const { emitToTenant: emitConsult } = require('../../websocket');
    emitConsult(tenantSlug, 'consultation:started', {
      treatmentId: record._id,
      appointmentId: appointment._id,
      doctorId,
      patientName: appointment.patient.name,
      branch: String(appointment.branch || ''),
    });
  } catch (_) { /* non-blocking */ }

  // Fetch assigned room to return alongside the record
  const assignedRoom = await ConsultationRoom.findOne({
    currentDoctor: doctorId, status: 'occupied', deletedAt: null,
  }).select('name code type floor').populate('branch', 'name').lean();

  logAccess(conn, {
    patient: appointment.patient._id || appointment.patient,
    accessedBy: callerId,
    accessType: 'create',
    resource: 'treatment',
    resourceId: record._id,
    description: 'Doctor started consultation',
  });

  return { record, room: assignedRoom };
}

// ── Update Consultation ─────────────────────────────────

async function updateConsultation(treatmentId, data, callerId, tenantSlug, callerRole) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentRecord = conn.model('TreatmentRecord');

  const record = await TreatmentRecord.findById(treatmentId);
  if (!record) throw ApiError.notFound('Treatment record not found');

  const isAdmin = ROLE_GROUPS.ADMIN.includes(callerRole);
  if (!isAdmin && String(record.doctor) !== callerId) {
    throw ApiError.forbidden('You can only update your own treatment records');
  }

  // Strip immutable fields
  delete data.patient;
  delete data.doctor;
  delete data.appointment;
  delete data.createdBy;

  const allowedFields = [
    'diagnosis', 'treatment', 'prescription', 'notes', 'followUpDate',
    'chiefComplaint', 'medicalHistory', 'allergies', 'vitals',
    'examination', 'oralFindings', 'severity',
    'assessmentNotes', 'treatmentPlan', 'followUpInstructions',
    'procedure', 'priority', 'estimatedCost', 'visitType',
    'patientConsent', 'careTasks', 'teeth',
    'materialsUsed',
  ];
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      // Convert empty strings to null for enum/number fields so Mongoose doesn't reject them
      const val = data[key];
      record[key] = (val === '' && ['severity', 'priority', 'estimatedCost'].includes(key)) ? null : val;
    }
  }

  // Auto-save signature as draft (dataUrl only, no metadata yet)
  if (typeof data.doctorSignature === 'string' && data.doctorSignature) {
    record.doctorSignature = { dataUrl: data.doctorSignature };
  }

  await record.save();

  logAccess(conn, {
    patient: record.patient,
    accessedBy: callerId,
    accessType: 'update',
    resource: 'treatment',
    resourceId: record._id,
    description: 'Doctor updated consultation notes',
  });

  return record;
}

// ── Complete Consultation ───────────────────────────────

async function completeConsultation(treatmentId, data, callerId, tenantSlug, callerRole) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentRecord = conn.model('TreatmentRecord');
  const Appointment = conn.model('Appointment');
  const Prescription = conn.model('Prescription');

  const record = await TreatmentRecord.findById(treatmentId);
  if (!record) throw ApiError.notFound('Treatment record not found');

  const isAdmin = ROLE_GROUPS.ADMIN.includes(callerRole);
  const doctorId = isAdmin ? String(record.doctor) : callerId;
  if (!isAdmin && String(record.doctor) !== callerId) {
    throw ApiError.forbidden('You can only complete your own treatment records');
  }

  // Require diagnosis and treatment before completing
  if (!record.diagnosis || !record.diagnosis.trim() || record.diagnosis.trim() === 'In progress') {
    throw ApiError.badRequest('Diagnosis is required before completing the consultation');
  }
  if (!record.treatment || !record.treatment.trim()) {
    throw ApiError.badRequest('Treatment description is required before completing the consultation');
  }

  // Require digital signature
  if (!data?.doctorSignature?.dataUrl) {
    throw ApiError.badRequest('Doctor signature is required to complete the consultation');
  }

  // Store full signature metadata
  record.doctorSignature = {
    dataUrl: data.doctorSignature.dataUrl,
    signedAt: new Date(),
    signedBy: doctorId,
    ipAddress: data.doctorSignature.ipAddress || '',
  };
  record.status = 'completed';
  record.completedAt = new Date();
  await record.save();

  // ── Deduct inventory for materials used during consultation ──
  if (record.materialsUsed && record.materialsUsed.length > 0) {
    const InventoryItem = conn.model('InventoryItem');
    const InventoryTransaction = conn.model('InventoryTransaction');
    const appointmentForBranch = record.appointment
      ? await Appointment.findById(record.appointment).select('branch').lean()
      : null;

    for (const mat of record.materialsUsed) {
      try {
        const invItem = await InventoryItem.findOneAndUpdate(
          { _id: mat.item, currentStock: { $gte: mat.quantity } },
          { $inc: { currentStock: -mat.quantity } },
          { new: false },
        ).lean();

        if (invItem) {
          await InventoryTransaction.create({
            item: mat.item,
            type: 'stock_out',
            quantity: mat.quantity,
            previousStock: invItem.currentStock,
            newStock: invItem.currentStock - mat.quantity,
            reason: 'Used during consultation',
            reference: record._id,
            referenceModel: 'TreatmentRecord',
            patient: record.patient,
            branch: appointmentForBranch?.branch,
            performedBy: doctorId,
          });
        } else {
          require('../../utils/logger').warn('completeConsultation: insufficient stock for item %s (needed %d)', mat.item, mat.quantity);
        }
      } catch (err) {
        require('../../utils/logger').error('completeConsultation: stock deduction failed for item %s: %s', mat.item, err.message);
      }
    }
  }

  let prescription = null;

  // Auto-create Prescription if medications are present
  if (record.prescription && record.prescription.length > 0) {
    const appointment = record.appointment
      ? await Appointment.findById(record.appointment).select('branch').lean()
      : null;

    prescription = await Prescription.create({
      patient: record.patient,
      doctor: doctorId,
      appointment: record.appointment,
      branch: appointment?.branch,
      diagnosis: record.diagnosis,
      medications: record.prescription.map((rx, i) => ({
        name: rx.medication,
        dosage: rx.dosage || '',
        frequency: rx.frequency || '',
        duration: rx.duration || '',
        instructions: rx.notes || '',
        _reminderConfig: data?.reminderConfig?.medications?.[i],
      })),
      notes: record.notes,
      status: 'active',
      createdBy: doctorId,
    });
  }

  // Create PrescriptionTasks from dynamic care tasks
  const { generateReminders, scheduleBulkReminders, scheduleEodChecklistJobs, FREQUENCY_CONFIG } = require('../../utils/careReminderScheduler');
  const PrescriptionTask = conn.model('PrescriptionTask');
  const CareReminder = conn.model('CareReminder');

  const createdCareTasks = [];
  if (prescription && record.careTasks && record.careTasks.length > 0) {
    const enabledTasks = record.careTasks.filter(t => t.enabled && t.reminderEnabled);

    for (const ct of enabledTasks) {
      const freq = ct.frequency || 'once';
      const config = FREQUENCY_CONFIG[freq] || FREQUENCY_CONFIG.once;
      const times = (ct.customTimes && ct.customTimes.length > 0) ? ct.customTimes : config.times;
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const durationDays = 7;
      const totalReminders = times.length * durationDays;

      const task = await PrescriptionTask.create({
        prescription: prescription._id,
        patient: record.patient,
        doctor: doctorId,
        taskType: ct.taskType || 'custom',
        title: ct.title,
        instructions: ct.instructions || '',
        frequency: freq,
        customTimes: times,
        startDate,
        endDate,
        totalReminders,
        reminderMode: ct.reminderMode || 'item_wise',
        eodTime: ct.eodTime || '20:00',
        createdBy: doctorId,
      });

      createdCareTasks.push({ title: task.title, frequency: freq, taskType: task.taskType });

      const remindersData = generateReminders(task);
      if (remindersData.length > 0) {
        const savedReminders = await CareReminder.insertMany(remindersData);
        if (task.reminderMode === 'eod_checklist') {
          scheduleEodChecklistJobs(task.patient, task.eodTime, task.startDate, task.endDate, tenantSlug).catch(() => {});
        } else {
          scheduleBulkReminders(savedReminders, tenantSlug).catch(() => {});
        }
      }
    }
  }

  // Send immediate care summary push notification if care tasks were created
  if (createdCareTasks.length > 0) {
    try {
      const fcmService = require('../../services/fcm.service');
      const Patient = conn.model('Patient');
      const User = conn.model('User');
      const summaryPatient = await Patient.findById(record.patient).select('user').lean();
      const summaryDoctor = await User.findById(doctorId).select('name').lean();
      await fcmService.sendCareSummary(
        record.patient,
        summaryPatient?.user || null,
        summaryDoctor?.name || 'Your doctor',
        tenantSlug,
        createdCareTasks,
      );
    } catch (err) {
      const logger = require('../../utils/logger');
      logger.warn('Failed to send care summary notification: %s', err.message);
    }
  }

  // Complete the linked appointment
  if (record.appointment) {
    await Appointment.findByIdAndUpdate(record.appointment, {
      status: APPOINTMENT_STATUS.COMPLETED,
      completedAt: new Date(),
    });
  }

  // Auto-complete linked queue entry + release room
  const QueueEntry = conn.model('QueueEntry');
  const ConsultationRoom = conn.model('ConsultationRoom');
  const linkedQueue = await QueueEntry.findOne({
    doctor: doctorId,
    status: 'in_consultation',
    ...(record.appointment ? { appointment: record.appointment } : {}),
  });

  if (linkedQueue) {
    // Release room first
    if (linkedQueue.room) {
      await ConsultationRoom.findByIdAndUpdate(linkedQueue.room, {
        status: 'available',
        currentDoctor: null,
        currentPatient: null,
        currentAppointment: null,
        occupiedSince: null,
      });
    }
    linkedQueue.status = 'completed';
    linkedQueue.completedAt = new Date();
    await linkedQueue.save();
  } else {
    // No linked queue entry — still release any room occupied by this doctor
    await ConsultationRoom.updateMany(
      { currentDoctor: doctorId, status: 'occupied' },
      {
        status: 'available',
        currentDoctor: null,
        currentPatient: null,
        currentAppointment: null,
        occupiedSince: null,
      },
    );
  }

  // Notify patient of consultation completion
  const Patient = conn.model('Patient');
  const User = conn.model('User');
  const patient = await Patient.findById(record.patient).select('user name').lean();
  const doctor = await User.findById(doctorId).select('name').lean();
  if (patient?.user) {
    const prescriptionSuffix = prescription ? ' A prescription has been issued.' : '';
    await notifyAndEmit({
      recipient: patient.user,
      title: 'Consultation Completed',
      message: `Dr. ${doctor?.name || 'Your doctor'} has completed your consultation.${prescriptionSuffix}`,
      type: 'appointment',
      metadata: { treatmentId, appointmentId: record.appointment, prescriptionId: prescription?._id },
    }, tenantSlug);
  }

  // Notify front-desk and admin staff that consultation completed
  const { notifyFrontDesk } = require('../../utils/notifyFrontDesk');
  const { notifyAdmins } = require('../../utils/notifyAdmins');
  const completeSuffix = prescription ? ' Prescription issued.' : '';
  const completeMsg = `Dr. ${doctor?.name || 'A doctor'} completed consultation with ${patient?.name || 'a patient'}.${completeSuffix}`;
  const completeMeta = { appointmentId: record.appointment, treatmentId, prescriptionId: prescription?._id };

  notifyFrontDesk(tenantSlug, {
    title: 'Consultation Completed',
    message: completeMsg,
    type: 'appointment',
    metadata: completeMeta,
  }); // fire-and-forget
  notifyAdmins(tenantSlug, {
    title: 'Consultation Completed',
    message: completeMsg,
    type: 'appointment',
    metadata: completeMeta,
  }, { excludeUserId: callerId }); // fire-and-forget

  // Enqueue auto-invoice generation
  if (record.appointment) {
    const { autoInvoiceQueue } = require('../../jobs/queues');
    autoInvoiceQueue.add('generate', {
      tenantSlug,
      appointmentId: record.appointment,
      treatmentId,
      doctorId,
    }).catch((err) => {
      const logger = require('../../utils/logger');
      logger.error('Failed to enqueue auto-invoice: %s', err.message);
    });
  }

  // Broadcast appointment + queue updates for consultation completion
  try {
    const { emitToTenant } = require('../../websocket');
    emitToTenant(tenantSlug, 'appointment:update', {
      appointmentId: record.appointment,
      status: APPOINTMENT_STATUS.COMPLETED,
      branch: linkedQueue ? String(linkedQueue.branch) : null,
    });
    emitToTenant(tenantSlug, 'queue:update', {
      action: 'consultation_completed',
      doctorId,
      branch: linkedQueue ? String(linkedQueue.branch) : null,
    });
    emitToTenant(tenantSlug, 'consultation:completed', {
      treatmentId,
      appointmentId: record.appointment,
      doctorId,
      branch: linkedQueue ? String(linkedQueue.branch) : null,
    });
  } catch (_) { /* socket not critical */ }

  logAccess(conn, {
    patient: record.patient,
    accessedBy: callerId,
    accessType: 'update',
    resource: 'treatment',
    resourceId: record._id,
    description: 'Doctor completed consultation',
  });

  if (prescription) {
    logAccess(conn, {
      patient: record.patient,
      accessedBy: callerId,
      accessType: 'create',
      resource: 'prescription',
      resourceId: prescription._id,
      description: 'Doctor issued prescription',
    });
  }

  return { treatmentRecord: record, prescription };
}

// ── Upload Attachment ───────────────────────────────────

async function uploadAttachment(data, callerId, tenantSlug, callerRole) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentRecord = conn.model('TreatmentRecord');

  const record = await TreatmentRecord.findById(data.treatmentId);
  if (!record) throw ApiError.notFound('Treatment record not found');

  const isAdmin = ROLE_GROUPS.ADMIN.includes(callerRole);
  if (!isAdmin && String(record.doctor) !== callerId) {
    throw ApiError.forbidden('You can only upload to your own treatment records');
  }

  const buffer = Buffer.from(data.fileData, 'base64');
  const file = { buffer, originalname: data.fileName, mimetype: data.mimeType };
  const uploaded = await uploadFile(file, 'xrays');

  const attachment = {
    fileName: uploaded.fileName,
    fileUrl: uploaded.fileUrl,
    fileType: uploaded.fileType,
    uploadedAt: new Date(),
  };

  record.attachments.push(attachment);
  await record.save();

  logAccess(conn, {
    patient: record.patient,
    accessedBy: callerId,
    accessType: 'update',
    resource: 'treatment',
    resourceId: record._id,
    description: `Doctor uploaded attachment: ${data.fileName}`,
  });

  return attachment;
}

// ── List Attachments ────────────────────────────────────

async function listAttachments(treatmentId, callerId, tenantSlug, callerRole) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentRecord = conn.model('TreatmentRecord');

  const record = await TreatmentRecord.findById(treatmentId).select('attachments doctor');
  if (!record) throw ApiError.notFound('Treatment record not found');

  const isAdmin = ROLE_GROUPS.ADMIN.includes(callerRole);
  if (!isAdmin && String(record.doctor) !== callerId) {
    throw ApiError.forbidden('You can only view your own treatment records');
  }

  logAccess(conn, {
    patient: record.patient,
    accessedBy: callerId,
    accessType: 'view',
    resource: 'treatment',
    resourceId: record._id,
    description: 'Doctor viewed treatment attachments',
  });

  return record.attachments;
}

// ── Create Follow-Up ────────────────────────────────────

async function createFollowUp(data, callerId, tenantSlug, callerRole) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentRecord = conn.model('TreatmentRecord');
  const Appointment = conn.model('Appointment');
  const Patient = conn.model('Patient');
  const User = conn.model('User');

  const record = await TreatmentRecord.findById(data.treatmentId);
  if (!record) throw ApiError.notFound('Treatment record not found');

  const isAdmin = ROLE_GROUPS.ADMIN.includes(callerRole);
  const doctorId = isAdmin ? String(record.doctor) : callerId;
  if (!isAdmin && String(record.doctor) !== callerId) {
    throw ApiError.forbidden('You can only manage your own treatment records');
  }

  record.followUpDate = new Date(data.followUpDate);
  await record.save();

  // Create an actual follow-up appointment
  let followUpAppointment = null;
  try {
    // Resolve branch from the original appointment
    const originalAppointment = record.appointment
      ? await Appointment.findById(record.appointment).select('branch duration').lean()
      : null;

    // Resolve reminder timings from doctor defaults
    const doctor = await User.findById(doctorId).select('name defaultReminderTimings').lean();
    const reminderTimings = (doctor?.defaultReminderTimings?.length > 0)
      ? doctor.defaultReminderTimings
      : [1440]; // 24h default

    followUpAppointment = await Appointment.create({
      patient: record.patient,
      doctor: doctorId,
      scheduledAt: new Date(data.followUpDate),
      duration: data.duration || originalAppointment?.duration || 30,
      type: 'follow_up',
      status: APPOINTMENT_STATUS.CONFIRMED,
      source: 'follow_up',
      branch: originalAppointment?.branch,
      notes: data.message || `Follow-up from consultation on ${new Date(record.createdAt).toLocaleDateString()}`,
      createdBy: doctorId,
      reminderTimings,
      parentAppointment: record.appointment || undefined,
    });

    // Schedule reminders for the follow-up appointment
    const { scheduleReminders } = require('../../utils/reminderScheduler');
    const reminderEntries = await scheduleReminders(
      followUpAppointment._id.toString(),
      tenantSlug,
      data.followUpDate,
      reminderTimings,
    );
    if (reminderEntries.length > 0) {
      followUpAppointment.reminders = reminderEntries;
      followUpAppointment.reminderJobId = reminderEntries[0].jobId;
      await followUpAppointment.save();
    }
  } catch (err) {
    const logger = require('../../utils/logger');
    logger.error('Failed to create follow-up appointment for treatment %s: %s', data.treatmentId, err.message);
  }

  // Notify the patient
  const patient = await Patient.findById(record.patient).select('user name').lean();
  if (patient?.user) {
    const doctor = await User.findById(doctorId).select('name').lean();
    const doctorName = doctor?.name || 'Your doctor';
    const dateStr = new Date(data.followUpDate).toLocaleDateString();

    await notifyAndEmit({
      recipient: patient.user,
      title: 'Follow-up Scheduled',
      message: data.message || `${doctorName} has scheduled a follow-up appointment on ${dateStr}.`,
      type: 'appointment',
      metadata: {
        treatmentId: record._id,
        followUpDate: data.followUpDate,
        appointmentId: followUpAppointment?._id,
      },
    }, tenantSlug);
  }

  logAccess(conn, {
    patient: record.patient,
    accessedBy: callerId,
    accessType: 'create',
    resource: 'appointment',
    resourceId: followUpAppointment?._id,
    description: 'Doctor scheduled follow-up',
  });

  return {
    followUpDate: record.followUpDate,
    treatmentId: record._id,
    appointmentId: followUpAppointment?._id,
  };
}

// ── Doctor's Patient List ───────────────────────────────

async function listDoctorPatients(query, doctorId, tenantSlug, _callerRole) {
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');
  const Patient = conn.model('Patient');
  const { skip, limit, page } = parsePagination(query);

  // Get distinct patient IDs from doctor's appointments
  const patientIds = await Appointment.distinct('patient', { doctor: doctorId });

  if (patientIds.length === 0) {
    return { items: [], total: 0, page: 1, limit };
  }

  const filter = { _id: { $in: patientIds } };

  if (query.gender) filter.gender = query.gender;

  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { patientId: { $regex: escaped, $options: 'i' } },
      { phone: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    Patient.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('name patientId phone email gender dateOfBirth'),
    Patient.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

// ── Get Consultation by Appointment ─────────────────────

async function getConsultationByAppointment(appointmentId, callerId, tenantSlug, callerRole) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentRecord = conn.model('TreatmentRecord');

  const record = await TreatmentRecord.findOne({ appointment: appointmentId, deletedAt: null })
    .populate('patient', 'name patientId phone email gender dateOfBirth')
    .populate('doctor', 'name specialization')
    .populate('appointment', 'scheduledAt status type duration branch reason notes');

  if (!record) throw ApiError.notFound('No consultation record found for this appointment');

  // Non-admin doctors can only view their own records
  const isAdmin = ROLE_GROUPS.ADMIN.includes(callerRole);
  if (!isAdmin && String(record.doctor._id || record.doctor) !== callerId) {
    throw ApiError.forbidden('You can only view your own consultation records');
  }

  return record;
}

// ── List Consultations ──────────────────────────────────

async function listConsultations(query, doctorId, tenantSlug, _callerId, _callerRole) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentRecord = conn.model('TreatmentRecord');
  const { skip, limit, page } = parsePagination(query);

  const filter = {};
  if (doctorId) filter.doctor = doctorId;

  // Status filter — accept both legacy ('active') and standard status values
  if (query.status === 'active' || query.status === 'in_progress') {
    const Appointment = conn.model('Appointment');
    const apptFilter = { status: APPOINTMENT_STATUS.IN_PROGRESS };
    if (doctorId) apptFilter.doctor = doctorId;
    const activeApptIds = await Appointment.find(apptFilter).distinct('_id');
    filter.appointment = { $in: activeApptIds };
  } else if (query.status === 'completed') {
    filter.status = 'completed';
  }

  // Search by patient name, diagnosis, or treatment
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const Patient = conn.model('Patient');
    const matchingPatientIds = await Patient.find({
      name: { $regex: escaped, $options: 'i' },
    }).distinct('_id');

    filter.$or = [
      { diagnosis: { $regex: escaped, $options: 'i' } },
      { treatment: { $regex: escaped, $options: 'i' } },
      ...(matchingPatientIds.length > 0 ? [{ patient: { $in: matchingPatientIds } }] : []),
    ];
  }

  // Parse sort param: "-fieldName" = desc, "fieldName" = asc
  let sortObj = { createdAt: -1 };
  if (query.sort) {
    const desc = query.sort.startsWith('-');
    const field = desc ? query.sort.slice(1) : query.sort;
    const allowed = ['createdAt', 'diagnosis', 'status'];
    if (allowed.includes(field)) sortObj = { [field]: desc ? -1 : 1 };
  }

  // Date range filter
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) {
      const toDate = new Date(query.to);
      toDate.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = toDate;
    }
  }

  // Build an unfiltered base for stat counts (same doctor + search + date, ignoring status)
  const baseFilter = { ...filter };
  delete baseFilter.appointment;
  delete baseFilter.status;
  if (doctorId) baseFilter.doctor = doctorId;

  const Appointment = conn.model('Appointment');
  const apptFilterIP = { status: APPOINTMENT_STATUS.IN_PROGRESS };
  if (doctorId) apptFilterIP.doctor = doctorId;

  const [items, total, inProgressApptIds, completedCount] = await Promise.all([
    TreatmentRecord.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .populate('patient', 'name patientId phone gender dateOfBirth')
      .populate('doctor', 'name specialization')
      .populate('appointment', 'scheduledAt status type duration')
      .lean(),
    TreatmentRecord.countDocuments(filter),
    Appointment.find(apptFilterIP).distinct('_id'),
    TreatmentRecord.countDocuments({ ...baseFilter, status: 'completed' }),
  ]);

  const inProgressCount = await TreatmentRecord.countDocuments({
    ...baseFilter,
    appointment: { $in: inProgressApptIds },
  });

  return { items, total, page, limit, inProgressCount, completedCount };
}

async function getDoctorProfile(doctorId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor' })
    .select('-password -__v')
    .populate('department', 'name')
    .lean();
  if (!doctor) throw ApiError.notFound('Doctor not found');
  return doctor;
}

async function updateDoctorProfile(doctorId, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');

  const allowedFields = ['name', 'phone', 'specialization', 'consultationFee'];
  const update = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) update[key] = data[key];
  }

  const doctor = await User.findOneAndUpdate(
    { _id: doctorId, role: 'doctor' },
    update,
    { new: true, runValidators: true },
  ).select('-password -__v').populate('department', 'name').lean();
  if (!doctor) throw ApiError.notFound('Doctor not found');
  return doctor;
}

// ── Doctor Current Room ────────────────────────────────

async function getDoctorCurrentRoom(doctorId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ConsultationRoom = conn.model('ConsultationRoom');

  return ConsultationRoom.findOne({
    currentDoctor: doctorId,
    status: 'occupied',
    deletedAt: null,
  })
    .select('name code type floor')
    .populate('branch', 'name')
    .lean();
}

// ── Doctor Compliance Summary ──────────────────────────────

async function getDoctorComplianceSummary(doctorId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const PrescriptionTask = conn.model('PrescriptionTask');
  const Patient = conn.model('Patient');

  const tasks = await PrescriptionTask.find({ doctor: doctorId, deletedAt: null })
    .lean({ virtuals: true });

  let totalCompleted = 0;
  let totalReminders = 0;
  const lowCompliancePatientIds = new Set();

  for (const task of tasks) {
    totalCompleted += task.completedCount || 0;
    totalReminders += task.totalReminders || 0;
    if (task.totalReminders >= 3) {
      const rate = task.totalReminders > 0
        ? (task.completedCount || 0) / task.totalReminders
        : 0;
      if (rate < 0.5) lowCompliancePatientIds.add(task.patient.toString());
    }
  }

  const avgCompliance = totalReminders > 0
    ? Math.round((totalCompleted / totalReminders) * 100)
    : 0;

  // Fetch low-compliance patient details
  let lowCompliancePatients = [];
  if (lowCompliancePatientIds.size > 0) {
    lowCompliancePatients = await Patient.find({
      _id: { $in: [...lowCompliancePatientIds] },
      deletedAt: null,
    }).select('name patientId').lean();
  }

  return {
    avgCompliance,
    totalTasks: tasks.length,
    activeTasks: tasks.filter((t) => t.isActive).length,
    lowComplianceCount: lowCompliancePatientIds.size,
    lowCompliancePatients,
  };
}

// ── Doctor Care Task List ─────────────────────────────────────────────

async function listDoctorCareTasks(doctorId, tenantSlug, query = {}) {
  const conn = await getTenantConnection(tenantSlug);
  const PrescriptionTask = conn.model('PrescriptionTask');
  const CareReminder = conn.model('CareReminder');
  const Patient = conn.model('Patient');

  const { page = 1, limit = 20, status, patientId, taskType } = query;
  const skip = (page - 1) * limit;

  // Build filter.
  // PrescriptionTask stores `isActive` (Boolean) — there is no `status` field,
  // so the previous filter.status conditions matched nothing and the
  // Active/Completed tabs returned an empty list.
  const filter = { doctor: doctorId };
  if (status === 'active') {
    filter.isActive = true;
  } else if (status === 'completed') {
    filter.isActive = false;
  }
  // default: all statuses
  if (patientId) filter.patient = patientId;
  if (taskType) filter.taskType = taskType;

  const [tasks, total] = await Promise.all([
    PrescriptionTask.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    PrescriptionTask.countDocuments(filter),
  ]);

  // Resolve patient names in bulk
  const patientIds = [...new Set(tasks.map((t) => t.patient.toString()))];
  const patients = await Patient.find({ _id: { $in: patientIds } })
    .select('name patientId')
    .lean();
  const patientMap = {};
  patients.forEach((p) => { patientMap[p._id.toString()] = p; });

  // Get latest reminder status + next pending reminder for each task
  const taskIds = tasks.map((t) => t._id);
  const [latestReminders, nextReminders] = await Promise.all([
    CareReminder.aggregate([
      { $match: { task: { $in: taskIds }, status: { $in: ['done', 'skipped', 'missed', 'sent'] } } },
      { $sort: { scheduledAt: -1 } },
      { $group: { _id: '$task', lastStatus: { $first: '$status' }, lastAt: { $first: '$respondedAt' } } },
    ]),
    CareReminder.aggregate([
      { $match: { task: { $in: taskIds }, status: 'pending' } },
      { $sort: { scheduledAt: 1 } },
      { $group: { _id: '$task', nextAt: { $first: '$scheduledAt' } } },
    ]),
  ]);

  const lastReminderMap = {};
  latestReminders.forEach((r) => { lastReminderMap[r._id.toString()] = r; });
  const nextReminderMap = {};
  nextReminders.forEach((r) => { nextReminderMap[r._id.toString()] = r; });

  const enrichedTasks = tasks.map((t) => {
    const tid = t._id.toString();
    const pat = patientMap[t.patient.toString()];
    const completed = t.completedCount || 0;
    const skipped = t.skippedCount || 0;
    const missed = t.missedCount || 0;
    const total = t.totalReminders || 1;
    const complianceRate = total > 0 ? Math.round(((completed) / total) * 100) : 0;

    return {
      _id: t._id,
      title: t.title,
      taskType: t.taskType,
      frequency: t.frequency,
      instructions: t.instructions,
      // Derive the string the UI expects from the stored Boolean. Returning
      // t.status gave undefined, which blanked the status badge and made the
      // row's "Send Summary" action (gated on status === 'active') unreachable.
      status: t.isActive === false ? 'completed' : 'active',
      startDate: t.startDate,
      endDate: t.endDate,
      patient: pat ? { _id: pat._id, name: pat.name, patientId: pat.patientId } : null,
      progress: { completed, skipped, missed, total, complianceRate },
      nextReminder: nextReminderMap[tid]?.nextAt || null,
      lastResponse: lastReminderMap[tid] ? { status: lastReminderMap[tid].lastStatus, at: lastReminderMap[tid].lastAt } : null,
      createdAt: t.createdAt,
    };
  });

  return {
    tasks: enrichedTasks,
    pagination: { total, page: Number(page), pages: Math.ceil(total / limit) },
  };
}

// ── Doctor-triggered Care Summary ────────────────────────────────────

async function sendCareSummaryForPatient(doctorId, patientId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const PrescriptionTask = conn.model('PrescriptionTask');
  const Patient = conn.model('Patient');
  const User = conn.model('User');

  const patient = await Patient.findById(patientId).select('user name').lean();
  if (!patient) throw ApiError.notFound('Patient not found');

  const doctor = await User.findById(doctorId).select('name').lean();

  const activeTasks = await PrescriptionTask.find({
    patient: patientId,
    doctor: doctorId,
    status: 'active',
  }).select('title frequency taskType').lean();

  if (activeTasks.length === 0) {
    throw ApiError.badRequest('No active care tasks for this patient');
  }

  const fcmService = require('../../services/fcm.service');
  await fcmService.sendCareSummary(
    patientId,
    patient.user || null,
    doctor?.name || 'Your doctor',
    tenantSlug,
    activeTasks,
  );

  return { sent: true, taskCount: activeTasks.length };
}

module.exports = {
  getDoctorDashboardStats,
  getDoctorProfile,
  startConsultation,
  updateConsultation,
  completeConsultation,
  uploadAttachment,
  listAttachments,
  createFollowUp,
  listDoctorPatients,
  listConsultations,
  getConsultationByAppointment,
  updateDoctorProfile,
  getDoctorCurrentRoom,
  getDoctorComplianceSummary,
  listDoctorCareTasks,
  sendCareSummaryForPatient,
};
