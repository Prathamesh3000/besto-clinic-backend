'use strict';

const ApiError = require('../../utils/ApiError');
const { getTenantConnection } = require('../../db/tenantConnectionManager');

async function createReservation({ appointmentId, procedureId, branch }, tenantSlug, userId) {
  const conn = await getTenantConnection(tenantSlug);
  const Appointment = conn.model('Appointment');
  const ProcedureTemplate = conn.model('ProcedureTemplate');
  const InventoryItem = conn.model('InventoryItem');
  const InventoryTransaction = conn.model('InventoryTransaction');
  const MaterialReservation = conn.model('MaterialReservation');

  // Validate appointment
  const appointment = await Appointment.findById(appointmentId).lean();
  if (!appointment) throw ApiError.notFound('Appointment not found');
  if (appointment.status === 'cancelled') {
    throw ApiError.badRequest('Cannot reserve materials for a cancelled appointment');
  }

  // Check if reservation already exists
  const existing = await MaterialReservation.findOne({
    appointment: appointmentId,
    procedure: procedureId,
    status: 'reserved',
    deletedAt: null,
  }).lean();
  if (existing) throw ApiError.conflict('Materials are already reserved for this appointment and procedure');

  // Get procedure template
  const template = await ProcedureTemplate.findById(procedureId).lean();
  if (!template) throw ApiError.notFound('Procedure template not found');

  // Reserve each required item atomically
  const reservedItems = [];
  const rollbackOps = [];

  for (const material of template.requiredMaterials) {
    if (material.isOptional) {
      // Check if optional item is available, skip if not
      const optItem = await InventoryItem.findOne({
        _id: material.item,
        branch,
        deletedAt: null,
      }).lean();
      const optAvailable = optItem ? (optItem.currentStock - optItem.reservedStock) : 0;
      if (optAvailable < material.quantity) continue;
    }

    // Atomic reserve: only succeed if enough available stock
    const updated = await InventoryItem.findOneAndUpdate(
      {
        _id: material.item,
        branch,
        deletedAt: null,
        $expr: {
          $gte: [
            { $subtract: ['$currentStock', '$reservedStock'] },
            material.quantity,
          ],
        },
      },
      { $inc: { reservedStock: material.quantity } },
      { new: false }, // return old doc for previousReserved
    ).lean();

    if (!updated) {
      // Rollback already reserved items
      for (const op of rollbackOps) {
        await InventoryItem.findByIdAndUpdate(op.itemId, {
          $inc: { reservedStock: -op.quantity },
        });
      }
      throw ApiError.badRequest(
        `Insufficient stock for ${material.itemName || 'item'}. Required: ${material.quantity}`,
      );
    }

    rollbackOps.push({ itemId: material.item, quantity: material.quantity });

    // Create transaction record
    await InventoryTransaction.create({
      item: material.item,
      type: 'reserved',
      quantity: material.quantity,
      previousStock: updated.currentStock,
      newStock: updated.currentStock,
      previousReserved: updated.reservedStock,
      newReserved: updated.reservedStock + material.quantity,
      reason: `Reserved for appointment ${appointmentId}`,
      reference: appointmentId,
      referenceModel: 'Appointment',
      branch,
      performedBy: userId,
    });

    reservedItems.push({
      item: material.item,
      itemName: material.itemName || updated.name,
      quantity: material.quantity,
      status: 'reserved',
    });
  }

  // Create reservation
  const reservation = await MaterialReservation.create({
    appointment: appointmentId,
    patient: appointment.patient,
    procedure: procedureId,
    items: reservedItems,
    status: 'reserved',
    reservedAt: new Date(),
    reservedBy: userId,
    branch,
  });

  return reservation.toObject();
}

async function getReservationByAppointment(appointmentId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const MaterialReservation = conn.model('MaterialReservation');

  const reservation = await MaterialReservation.findOne({
    appointment: appointmentId,
    deletedAt: null,
  })
    .populate('procedure', 'name code category')
    .populate('items.item', 'name code currentStock reservedStock')
    .lean();

  return reservation;
}

async function releaseReservation(id, tenantSlug, userId) {
  const conn = await getTenantConnection(tenantSlug);
  const MaterialReservation = conn.model('MaterialReservation');
  const InventoryItem = conn.model('InventoryItem');
  const InventoryTransaction = conn.model('InventoryTransaction');

  const reservation = await MaterialReservation.findById(id);
  if (!reservation) throw ApiError.notFound('Reservation not found');
  if (reservation.status !== 'reserved') {
    throw ApiError.badRequest('Only reserved reservations can be released');
  }

  // Release each item
  for (const resItem of reservation.items) {
    if (resItem.status !== 'reserved') continue;

    const item = await InventoryItem.findOneAndUpdate(
      { _id: resItem.item },
      { $inc: { reservedStock: -resItem.quantity } },
      { new: false },
    ).lean();

    if (item) {
      await InventoryTransaction.create({
        item: resItem.item,
        type: 'released',
        quantity: resItem.quantity,
        previousStock: item.currentStock,
        newStock: item.currentStock,
        previousReserved: item.reservedStock,
        newReserved: Math.max(0, item.reservedStock - resItem.quantity),
        reason: `Released from reservation ${id}`,
        reference: reservation.appointment,
        referenceModel: 'Appointment',
        branch: reservation.branch,
        performedBy: userId,
      });
    }

    resItem.status = 'released';
  }

  reservation.status = 'released';
  reservation.releasedAt = new Date();
  await reservation.save();

  return reservation.toObject();
}

module.exports = {
  createReservation,
  getReservationByAppointment,
  releaseReservation,
};
