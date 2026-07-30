'use strict';

const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { notifyAndEmit } = require('../../utils/notifyAndEmit');
const { INVOICE_STATUS } = require('../../config/constants');

function createAutoInvoiceWorker() {
  const worker = new Worker(
    'autoInvoice',
    async (job) => {
      const { tenantSlug, appointmentId, treatmentId, doctorId } = job.data;
      logger.info('AutoInvoice worker: generating invoice for appointment %s (tenant: %s)', appointmentId, tenantSlug);

      const conn = await getTenantConnection(tenantSlug);
      const Invoice = conn.model('Invoice');
      const TreatmentRecord = conn.model('TreatmentRecord');
      const Appointment = conn.model('Appointment');
      const Patient = conn.model('Patient');
      const User = conn.model('User');
      const ServiceItem = conn.model('ServiceItem');

      // Idempotency: skip if invoice already exists for this appointment
      const existing = await Invoice.findOne({ appointment: appointmentId, deletedAt: null }).lean();
      if (existing) {
        logger.info('AutoInvoice worker: invoice already exists for appointment %s — skipping', appointmentId);
        return { skipped: true, invoiceId: existing._id };
      }

      const record = await TreatmentRecord.findById(treatmentId).lean();
      if (!record) {
        logger.warn('AutoInvoice worker: treatment record %s not found — skipping', treatmentId);
        return { skipped: true, reason: 'treatment_not_found' };
      }

      const appointment = await Appointment.findById(appointmentId).lean();
      const patient = await Patient.findById(record.patient).select('name user').lean();
      const doctor = await User.findById(doctorId).select('name consultationFee').lean();

      // Build line items
      const items = [];

      // 1. Consultation fee
      const consultFee = doctor?.consultationFee || 0;
      if (consultFee > 0) {
        items.push({
          description: `Consultation — Dr. ${doctor?.name || 'Doctor'}`,
          quantity: 1,
          unitPrice: consultFee,
          discount: 0,
          taxRate: 0,
          itemType: 'consultation',
        });
      }

      // 2. Procedures from treatment teeth data
      if (record.teeth && record.teeth.length > 0) {
        for (const tooth of record.teeth) {
          if (!tooth.procedure) continue;
          const si = await ServiceItem.findOne({
            name: { $regex: new RegExp(`^${tooth.procedure}$`, 'i') },
            isActive: true,
            deletedAt: null,
          }).lean();

          items.push({
            description: `${tooth.procedure}${tooth.toothNumber ? ` (Tooth #${tooth.toothNumber})` : ''}`,
            quantity: 1,
            unitPrice: si?.defaultPrice || 0,
            discount: 0,
            taxRate: si?.taxRate || 0,
            itemType: 'treatment',
            serviceItem: si?._id || undefined,
            hsnCode: si?.hsnCode || undefined,
          });
        }
      }

      // 3. Medications from prescription
      if (record.prescription && record.prescription.length > 0) {
        for (const rx of record.prescription) {
          const medName = rx.medication || rx.name;
          if (!medName) continue;

          const si = await ServiceItem.findOne({
            name: { $regex: new RegExp(`^${medName}$`, 'i') },
            isActive: true,
            deletedAt: null,
          }).lean();

          items.push({
            description: `${medName}${rx.dosage ? ` (${rx.dosage})` : ''}`,
            quantity: 1,
            unitPrice: si?.defaultPrice || 0,
            discount: 0,
            taxRate: si?.taxRate || 0,
            itemType: 'medicine',
            serviceItem: si?._id || undefined,
            hsnCode: si?.hsnCode || undefined,
          });
        }
      }

      // 4. Material costs from treatment record (actual materials used during consultation)
      if (record.materialsUsed && record.materialsUsed.length > 0) {
        for (const mat of record.materialsUsed) {
          if (mat.costPerUnit > 0) {
            items.push({
              description: `Material: ${mat.itemName}`,
              quantity: mat.quantity,
              unitPrice: mat.costPerUnit,
              discount: 0,
              taxRate: 0,
              itemType: 'equipment',
            });
          }
        }
      }

      if (items.length === 0) {
        logger.info('AutoInvoice worker: no billable items for appointment %s — skipping', appointmentId);
        return { skipped: true, reason: 'no_items' };
      }

      // Calculate totals
      let subtotal = 0;
      let totalTax = 0;
      let totalDiscount = 0;

      for (const item of items) {
        const lineSubtotal = item.quantity * item.unitPrice;
        const lineTax = lineSubtotal * (item.taxRate / 100);
        item.total = lineSubtotal - item.discount + lineTax;
        item.tax = lineTax;
        item.cgst = lineTax / 2;
        item.sgst = lineTax / 2;
        item.igst = 0;

        subtotal += lineSubtotal;
        totalTax += lineTax;
        totalDiscount += item.discount;
      }

      const totalAmount = subtotal - totalDiscount + totalTax;

      // Determine invoice status: if all items are priced, send immediately; otherwise draft for review
      const hasZeroPriceItems = items.some((i) => i.unitPrice === 0);
      const invoiceStatus = hasZeroPriceItems ? INVOICE_STATUS.DRAFT : INVOICE_STATUS.SENT;

      // Set due date to 7 days from now for sent invoices
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      const invoice = await Invoice.create({
        patient: record.patient,
        doctor: doctorId,
        appointment: appointmentId,
        branch: appointment?.branch,
        items,
        subtotal,
        taxAmount: totalTax,
        discountAmount: totalDiscount,
        totalAmount,
        gstDetails: { cgst: totalTax / 2, sgst: totalTax / 2, igst: 0, cessAmount: 0 },
        currency: 'INR',
        status: invoiceStatus,
        dueDate: invoiceStatus === INVOICE_STATUS.SENT ? dueDate : undefined,
        createdBy: doctorId,
      });

      logger.info('AutoInvoice worker: created %s invoice %s for appointment %s (₹%s)', invoiceStatus, invoice._id, appointmentId, totalAmount);

      // Notify billing staff
      const billingStaff = await User.find({
        role: { $in: ['admin', 'billing_officer', 'receptionist'] },
        isActive: true,
      }).select('_id').lean();

      const reviewNote = hasZeroPriceItems ? ' Some items need manual pricing — invoice is in draft.' : '';

      for (const staff of billingStaff.slice(0, 5)) {
        await notifyAndEmit({
          recipient: staff._id,
          title: hasZeroPriceItems ? 'Draft Invoice Needs Review' : 'Invoice Sent to Patient',
          message: `An invoice (₹${totalAmount.toFixed(2)}) for ${patient?.name || 'a patient'} has been auto-generated after consultation with Dr. ${doctor?.name || 'Doctor'}.${reviewNote}`,
          type: 'payment',
          metadata: { invoiceId: invoice._id, appointmentId },
        }, tenantSlug);
      }

      // Notify patient about the invoice (so they can pay from portal)
      if (patient?.user && invoiceStatus === INVOICE_STATUS.SENT) {
        await notifyAndEmit({
          recipient: patient.user,
          title: 'Invoice Ready',
          message: `Your invoice of ₹${totalAmount.toFixed(2)} from your consultation with Dr. ${doctor?.name || 'Doctor'} is ready. You can pay from the app.`,
          type: 'payment',
          metadata: { invoiceId: invoice._id, appointmentId },
        }, tenantSlug);
      }

      return { invoiceId: invoice._id, totalAmount, itemCount: items.length, status: invoiceStatus };
    },
    { connection: getRedis(), concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    logger.error('AutoInvoice worker: job %s failed — %s', job?.id, err.message);
  });

  return worker;
}

module.exports = createAutoInvoiceWorker;
