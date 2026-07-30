'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const logger = require('../../utils/logger');
const razorpay = require('../../utils/razorpay');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { ROLE_PERMISSIONS, PERMISSIONS } = require('../../config/permissions');
const {
  PAYMENT_MODE,
  PAYMENT_STATUS,
  INVOICE_STATUS,
  LEDGER_ENTRY_TYPE,
  LEDGER_SOURCE,
  FINANCIAL_AUDIT_ACTION,
  CASH_REGISTER_STATUS,
} = require('../../config/constants');

/* ── Internal helpers ──────────────────────────────────────────────── */

/** Check if user has full (non-OWN) permission */
function _hasFullAccess(user, permission) {
  const perms = ROLE_PERMISSIONS[user.role] || [];
  return perms.includes(permission);
}

/**
 * Resolve the Patient._id linked to this user (for self-scope filtering).
 * Returns null if no linked patient record exists.
 */
async function _getLinkedPatientId(userId, conn) {
  const Patient = conn.model('Patient');
  const patient = await Patient.findOne({ user: userId }).select('_id').lean();
  return patient ? patient._id : null;
}

/** Round to 2 decimal places for monetary precision */
function _round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Update invoice payment totals after a payment (atomic).
 * Uses findOneAndUpdate with $inc for paidAmount and $push for payments/paidVia
 * to eliminate the read-modify-write race condition.
 *
 * @param {string|ObjectId} invoiceId - The invoice ID
 * @param {Object} payment - The payment document
 * @param {mongoose.Connection} conn - Tenant DB connection
 * @param {Object} [options] - Optional session
 * @returns {Object} The updated invoice document
 */
async function _updateInvoicePayment(invoiceId, payment, conn, options = {}) {
  const Invoice = conn.model('Invoice');

  // Atomically increment paidAmount and push payment tracking data
  const updated = await Invoice.findOneAndUpdate(
    { _id: invoiceId },
    {
      $inc: { paidAmount: _round(payment.amount) },
      $push: {
        payments: payment._id,
        paidVia: {
          mode: payment.mode,
          amount: payment.amount,
          reference: payment.reference || payment.gatewayPaymentId || '',
        },
      },
    },
    { new: true, session: options.session || null },
  );

  if (!updated) {
    throw ApiError.notFound('Invoice not found during payment update');
  }

  // Determine and set invoice status based on new paidAmount
  const newPaidAmount = _round(updated.paidAmount);
  const statusUpdate = {};

  if (newPaidAmount >= updated.totalAmount) {
    statusUpdate.status = INVOICE_STATUS.PAID;
    statusUpdate.paidAt = new Date();
  } else if (newPaidAmount > 0) {
    statusUpdate.status = INVOICE_STATUS.PARTIALLY_PAID;
  }

  if (Object.keys(statusUpdate).length > 0) {
    await Invoice.updateOne(
      { _id: invoiceId },
      { $set: statusUpdate },
      { session: options.session || null },
    );
  }

  return updated;
}

/**
 * Create a FinancialAuditLog entry.
 */
async function _createAuditLog(conn, { action, entity, entityId, actor, actorRole, before, after, metadata, branch }) {
  const FinancialAuditLog = conn.model('FinancialAuditLog');
  return FinancialAuditLog.create({
    action,
    entity,
    entityId,
    actor,
    actorRole,
    before,
    after,
    metadata,
    branch,
  });
}

/**
 * Create a PatientLedger entry (atomic, race-condition-safe).
 *
 * Uses a MongoDB session/transaction to ensure that reading the previous
 * balance and writing the new entry happen atomically, preventing race
 * conditions when concurrent payments update the same patient's ledger.
 */
async function _createLedgerEntry(conn, { patient, type, amount, source, reference, referenceModel, description, createdBy, branch }) {
  const PatientLedger = conn.model('PatientLedger');

  const session = await conn.startSession();
  try {
    let ledgerEntry;

    await session.withTransaction(async () => {
      // Within the transaction: read the latest balance and write the new entry atomically
      const lastEntry = await PatientLedger.findOne({ patient })
        .sort({ createdAt: -1 })
        .select('balance')
        .session(session)
        .lean();

      const previousBalance = lastEntry ? lastEntry.balance : 0;
      const balance = type === LEDGER_ENTRY_TYPE.CREDIT
        ? _round(previousBalance - amount)   // credit = patient paid -> reduces what they owe
        : _round(previousBalance + amount);   // debit = refund -> clinic owes patient

      const created = await PatientLedger.create(
        [
          {
            patient,
            type,
            amount,
            balance,
            source,
            reference,
            referenceModel,
            description,
            createdBy,
            branch,
          },
        ],
        { session },
      );
      ledgerEntry = created[0];
    });

    return ledgerEntry;
  } finally {
    await session.endSession();
  }
}

/* ── createPayment (manual modes: cash / upi / card / etc.) ────────── */

async function createPayment(data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Payment = conn.model('Payment');
  const Invoice = conn.model('Invoice');

  // H2: Idempotency guard — if an idempotencyKey is provided, check for
  // an existing payment with the same key and return it to avoid duplicates.
  if (data.idempotencyKey) {
    const existingPayment = await Payment.findOne({
      idempotencyKey: data.idempotencyKey,
      deletedAt: null,
    }).lean();

    if (existingPayment) {
      logger.info('Duplicate payment blocked by idempotencyKey: %s', data.idempotencyKey);
      return existingPayment;
    }
  }

  // Verify invoice exists and is not terminal
  const invoice = await Invoice.findById(data.invoice);
  if (!invoice) throw ApiError.notFound('Invoice not found');
  if (invoice.status === INVOICE_STATUS.CANCELLED) {
    throw ApiError.badRequest('Cannot pay a cancelled invoice');
  }
  if (invoice.status === INVOICE_STATUS.REFUNDED) {
    throw ApiError.badRequest('Cannot pay a refunded invoice');
  }

  // H3: Overpayment guard — ensure payment does not exceed remaining balance
  const remainingBalance = _round(invoice.totalAmount - (invoice.paidAmount || 0));
  const paymentAmount = _round(data.amount);
  if (paymentAmount > remainingBalance) {
    throw ApiError.badRequest(
      `Payment amount (${paymentAmount}) exceeds remaining balance (${remainingBalance}). ` +
      `Invoice total: ${invoice.totalAmount}, already paid: ${invoice.paidAmount || 0}.`,
    );
  }

  // Create payment with completed status (manual modes are instant)
  const payment = await Payment.create({
    invoice: data.invoice,
    patient: data.patient,
    amount: paymentAmount,
    mode: data.mode,
    status: PAYMENT_STATUS.COMPLETED,
    reference: data.reference,
    notes: data.notes,
    idempotencyKey: data.idempotencyKey || undefined,
    branch: data.branch || invoice.branch,
    cashRegister: data.cashRegister,
    insuranceClaim: data.insuranceClaim,
    processedBy: user.userId,
    processedAt: new Date(),
    createdBy: user.userId,
  });

  // C2: Update Invoice totals atomically (no read-modify-write race)
  await _updateInvoicePayment(invoice._id, payment, conn);

  // For cash mode: update CashRegister atomically (no read-modify-write race)
  if (data.mode === PAYMENT_MODE.CASH) {
    const CashRegister = conn.model('CashRegister');
    const branch = data.branch || invoice.branch;
    if (branch) {
      const registerFilter = data.cashRegister
        ? { _id: data.cashRegister }
        : { branch, status: CASH_REGISTER_STATUS.OPEN };
      await CashRegister.findOneAndUpdate(
        registerFilter,
        { $inc: { cashIn: payment.amount, transactionCount: 1 } },
      );
    }
  }

  // Audit log
  await _createAuditLog(conn, {
    action: FINANCIAL_AUDIT_ACTION.PAYMENT_COMPLETED,
    entity: 'Payment',
    entityId: payment._id,
    actor: user.userId,
    actorRole: user.role,
    after: { amount: payment.amount, mode: payment.mode, status: payment.status },
    metadata: { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber },
    branch: data.branch || invoice.branch,
  });

  // C1: Patient ledger — credit entry (patient paid -> reduces what they owe)
  // Uses transaction internally to prevent balance race conditions
  await _createLedgerEntry(conn, {
    patient: data.patient,
    type: LEDGER_ENTRY_TYPE.CREDIT,
    amount: payment.amount,
    source: LEDGER_SOURCE.PAYMENT,
    reference: payment._id,
    referenceModel: 'Payment',
    description: `Payment of ${payment.amount} via ${payment.mode} for invoice ${invoice.invoiceNumber}`,
    createdBy: user.userId,
    branch: data.branch || invoice.branch,
  });

  return payment;
}

/* ── createGatewayOrder (Razorpay) ─────────────────────────────────── */

async function createGatewayOrder(invoiceId, amount, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Invoice = conn.model('Invoice');
  const Payment = conn.model('Payment');

  // Verify invoice
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw ApiError.notFound('Invoice not found');

  // Verify invoice is payable
  if (invoice.status === INVOICE_STATUS.CANCELLED || invoice.status === INVOICE_STATUS.REFUNDED) {
    throw ApiError.badRequest('Cannot create payment order for a cancelled or refunded invoice');
  }
  if (invoice.status === INVOICE_STATUS.PAID) {
    throw ApiError.badRequest('Invoice is already fully paid');
  }

  // Overpayment guard — amount is in paise, convert to rupees for comparison
  const amountInRupees = _round(amount / 100);
  const remainingBalance = _round(invoice.totalAmount - (invoice.paidAmount || 0));
  if (amountInRupees > remainingBalance) {
    throw ApiError.badRequest(
      `Order amount (${amountInRupees}) exceeds remaining balance (${remainingBalance})`,
    );
  }

  // Create Razorpay order — include tenantSlug in notes for webhook routing
  const receipt = `rcpt_${invoice.invoiceNumber}_${Date.now()}`;
  const rzOrder = await razorpay.createOrder(amount, 'INR', receipt, {
    invoiceId: String(invoice._id),
    invoiceNumber: invoice.invoiceNumber,
    tenantSlug,
  });

  // Create Payment record with pending status
  const payment = await Payment.create({
    invoice: invoiceId,
    patient: invoice.patient,
    amount: _round(amount / 100), // convert paise to rupees for our record
    mode: PAYMENT_MODE.CARD, // gateway defaults to card; actual mode resolved after capture
    status: PAYMENT_STATUS.PENDING,
    gatewayProvider: 'razorpay',
    gatewayOrderId: rzOrder.id,
    branch: invoice.branch,
    createdBy: user.userId,
  });

  return {
    orderId: rzOrder.id,
    amount: rzOrder.amount,
    currency: rzOrder.currency,
    paymentId: payment._id,
  };
}

/* ── verifyGatewayPayment ──────────────────────────────────────────── */

async function verifyGatewayPayment(payload, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Payment = conn.model('Payment');

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, invoiceId, amount } = payload;

  // Verify Razorpay signature
  const isValid = razorpay.verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) {
    throw ApiError.badRequest('Invalid payment signature — verification failed');
  }

  // Find the pending payment
  const payment = await Payment.findOne({ gatewayOrderId: razorpay_order_id });
  if (!payment) throw ApiError.notFound('Payment record not found for this order');

  // Idempotency: if already completed, return existing payment
  if (payment.status === PAYMENT_STATUS.COMPLETED) {
    return payment;
  }

  // Atomically update payment status (CAS: only update if still PENDING)
  const updatedPayment = await Payment.findOneAndUpdate(
    { _id: payment._id, status: PAYMENT_STATUS.PENDING },
    {
      $set: {
        status: PAYMENT_STATUS.COMPLETED,
        gatewayPaymentId: razorpay_payment_id,
        gatewaySignature: razorpay_signature,
        processedBy: user.userId,
        processedAt: new Date(),
        amount: _round(amount / 100), // paise to rupees
      },
    },
    { new: true },
  );

  if (!updatedPayment) {
    // Another request already processed this payment
    const current = await Payment.findById(payment._id);
    if (current && current.status === PAYMENT_STATUS.COMPLETED) {
      return current;
    }
    throw ApiError.badRequest('Payment could not be updated — unexpected status');
  }

  // Update invoice atomically
  if (invoiceId) {
    await _updateInvoicePayment(invoiceId, updatedPayment, conn);
  }

  // Audit log
  await _createAuditLog(conn, {
    action: FINANCIAL_AUDIT_ACTION.PAYMENT_COMPLETED,
    entity: 'Payment',
    entityId: updatedPayment._id,
    actor: user.userId,
    actorRole: user.role,
    after: {
      amount: updatedPayment.amount,
      mode: updatedPayment.mode,
      status: updatedPayment.status,
      gatewayPaymentId: razorpay_payment_id,
    },
    metadata: { invoiceId, razorpay_order_id },
    branch: updatedPayment.branch,
  });

  // Patient ledger — credit entry (uses transaction internally)
  await _createLedgerEntry(conn, {
    patient: updatedPayment.patient,
    type: LEDGER_ENTRY_TYPE.CREDIT,
    amount: updatedPayment.amount,
    source: LEDGER_SOURCE.PAYMENT,
    reference: updatedPayment._id,
    referenceModel: 'Payment',
    description: `Online payment of ${updatedPayment.amount} via razorpay for invoice ${invoiceId}`,
    createdBy: user.userId,
    branch: updatedPayment.branch,
  });

  return updatedPayment;
}

/* ── handleWebhook (Razorpay server-to-server) ────────────────────── */

async function handleWebhook(body, signature) {
  const WebhookEvent = require('../../models/platform/WebhookEvent');

  // Verify webhook signature
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
  const isValid = razorpay.verifyWebhookSignature(rawBody, signature);
  if (!isValid) {
    throw ApiError.badRequest('Invalid webhook signature');
  }

  const event = typeof body === 'string' ? JSON.parse(body) : body;
  const eventType = event.event;
  const razorpayEventId = event.account_id
    ? `${event.account_id}_${event.event}_${event.created_at}`
    : `evt_${event.event}_${event.created_at}`;

  const paymentEntity = event.payload && event.payload.payment && event.payload.payment.entity;
  const orderId = paymentEntity ? paymentEntity.order_id : null;
  const tenantSlug = paymentEntity && paymentEntity.notes ? paymentEntity.notes.tenantSlug : null;

  // ── 1. Persist event (idempotent — duplicate razorpayEventId is ignored) ──
  let webhookDoc;
  try {
    webhookDoc = await WebhookEvent.create({
      razorpayEventId,
      eventType,
      orderId,
      gatewayPaymentId: paymentEntity ? paymentEntity.id : null,
      amount: paymentEntity ? paymentEntity.amount : null,
      currency: paymentEntity ? paymentEntity.currency : 'INR',
      tenantSlug,
      payload: event,
      signature,
      status: 'received',
    });
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate event — already received and processed/processing
      logger.info('Razorpay webhook: duplicate event ignored', { razorpayEventId, eventType });
      return { status: 'duplicate', event: eventType };
    }
    throw err;
  }

  // ── 2. Validate payload structure ──
  if (!paymentEntity || !orderId) {
    await WebhookEvent.updateOne(
      { _id: webhookDoc._id },
      { $set: { status: 'ignored', processedAt: new Date() } },
    );
    logger.warn('Razorpay webhook: missing payment entity or order_id', { eventType });
    return { status: 'ignored', event: eventType };
  }

  if (!tenantSlug) {
    await WebhookEvent.updateOne(
      { _id: webhookDoc._id },
      { $set: { status: 'failed', error: 'No tenantSlug in payment notes', processedAt: new Date() } },
    );
    logger.error('Razorpay webhook: no tenantSlug in notes — cannot route to tenant', { orderId, eventType });
    return { status: 'failed', event: eventType, error: 'No tenantSlug in payment notes' };
  }

  // ── 3. Mark as processing ──
  await WebhookEvent.updateOne(
    { _id: webhookDoc._id },
    { $set: { status: 'processing' }, $inc: { attempts: 1 } },
  );

  try {
    const conn = await getTenantConnection(tenantSlug);
    const Payment = conn.model('Payment');

    // ── 4. Process by event type ──

    if (eventType === 'payment.captured') {
      logger.info('Razorpay webhook: payment.captured', { orderId, paymentId: paymentEntity.id });

      const payment = await Payment.findOne({ gatewayOrderId: orderId });
      if (!payment) {
        throw new Error(`Payment record not found for order ${orderId}`);
      }

      // Skip if already completed (idempotent)
      if (payment.status === PAYMENT_STATUS.COMPLETED) {
        await WebhookEvent.updateOne(
          { _id: webhookDoc._id },
          { $set: { status: 'processed', processedAt: new Date() } },
        );
        return { status: 'already_processed', event: eventType, orderId };
      }

      // CAS: atomically update PENDING → COMPLETED
      const updated = await Payment.findOneAndUpdate(
        { _id: payment._id, status: PAYMENT_STATUS.PENDING },
        {
          $set: {
            status: PAYMENT_STATUS.COMPLETED,
            gatewayPaymentId: paymentEntity.id,
            processedAt: new Date(),
            amount: _round(paymentEntity.amount / 100),
          },
        },
        { new: true },
      );

      if (updated) {
        // Atomic invoice update
        await _updateInvoicePayment(updated.invoice, updated, conn);

        // Audit log
        await _createAuditLog(conn, {
          action: FINANCIAL_AUDIT_ACTION.PAYMENT_COMPLETED,
          entity: 'Payment',
          entityId: updated._id,
          actor: updated.createdBy,
          actorRole: 'system',
          after: { amount: updated.amount, status: updated.status, gatewayPaymentId: paymentEntity.id },
          metadata: { invoiceId: String(updated.invoice), source: 'webhook' },
          branch: updated.branch,
        });

        // Patient ledger credit
        await _createLedgerEntry(conn, {
          patient: updated.patient,
          type: LEDGER_ENTRY_TYPE.CREDIT,
          amount: updated.amount,
          source: LEDGER_SOURCE.PAYMENT,
          reference: updated._id,
          referenceModel: 'Payment',
          description: `Online payment of ${updated.amount} captured via webhook`,
          createdBy: updated.createdBy,
          branch: updated.branch,
        });
      }

      await WebhookEvent.updateOne(
        { _id: webhookDoc._id },
        { $set: { status: 'processed', processedAt: new Date() } },
      );
      return { status: 'captured', event: eventType, orderId };
    }

    if (eventType === 'payment.failed') {
      logger.info('Razorpay webhook: payment.failed', { orderId, paymentId: paymentEntity.id });

      // CAS: atomically update PENDING → FAILED
      const updated = await Payment.findOneAndUpdate(
        { gatewayOrderId: orderId, status: PAYMENT_STATUS.PENDING },
        {
          $set: {
            status: PAYMENT_STATUS.FAILED,
            gatewayPaymentId: paymentEntity.id,
            processedAt: new Date(),
            metadata: {
              failureReason: paymentEntity.error_code,
              failureDescription: paymentEntity.error_description,
              failureSource: paymentEntity.error_source,
            },
          },
        },
        { new: true },
      );

      if (updated) {
        await _createAuditLog(conn, {
          action: FINANCIAL_AUDIT_ACTION.PAYMENT_FAILED,
          entity: 'Payment',
          entityId: updated._id,
          actor: updated.createdBy,
          actorRole: 'system',
          after: {
            status: PAYMENT_STATUS.FAILED,
            error_code: paymentEntity.error_code,
            error_description: paymentEntity.error_description,
          },
          metadata: { invoiceId: String(updated.invoice), source: 'webhook' },
          branch: updated.branch,
        });
      }

      await WebhookEvent.updateOne(
        { _id: webhookDoc._id },
        { $set: { status: 'processed', processedAt: new Date() } },
      );
      return { status: 'failed', event: eventType, orderId };
    }

    if (eventType === 'refund.created') {
      const refundEntity = event.payload && event.payload.refund && event.payload.refund.entity;
      logger.info('Razorpay webhook: refund.created', { orderId, refundId: refundEntity && refundEntity.id });

      // Reconcile: if our payment already has a refundId, skip
      if (refundEntity) {
        const payment = await Payment.findOne({ gatewayOrderId: orderId });
        if (payment && !payment.refundId && payment.status !== PAYMENT_STATUS.REFUNDED) {
          await Payment.updateOne(
            { _id: payment._id },
            { $set: { refundId: refundEntity.id } },
          );
        }
      }

      await WebhookEvent.updateOne(
        { _id: webhookDoc._id },
        { $set: { status: 'processed', processedAt: new Date() } },
      );
      return { status: 'refund_created', event: eventType, orderId };
    }

    // Unhandled event type
    await WebhookEvent.updateOne(
      { _id: webhookDoc._id },
      { $set: { status: 'ignored', processedAt: new Date() } },
    );
    logger.info('Razorpay webhook: unhandled event type', { eventType });
    return { status: 'ignored', event: eventType };

  } catch (processingError) {
    // Mark event as failed with error details
    await WebhookEvent.updateOne(
      { _id: webhookDoc._id },
      { $set: { status: 'failed', error: processingError.message, processedAt: new Date() } },
    );
    logger.error('Razorpay webhook: processing failed', { eventType, orderId, error: processingError.message });
    // Return 200 anyway — we've persisted the event for retry
    return { status: 'failed', event: eventType, error: processingError.message };
  }
}

/* ── processRefund ─────────────────────────────────────────────────── */

async function processRefund(paymentId, amount, reason, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Payment = conn.model('Payment');
  const Invoice = conn.model('Invoice');

  const payment = await Payment.findById(paymentId);
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.status !== PAYMENT_STATUS.COMPLETED) {
    throw ApiError.badRequest('Only completed payments can be refunded');
  }

  // Default refund amount to full payment amount
  const refundAmount = _round(amount || payment.amount);
  if (refundAmount > payment.amount) {
    throw ApiError.badRequest('Refund amount cannot exceed payment amount');
  }

  // If gateway payment: initiate refund via Razorpay
  let gatewayRefundId;
  if (payment.gatewayProvider === 'razorpay' && payment.gatewayPaymentId) {
    const refundAmountPaise = Math.round(refundAmount * 100);
    const rzRefund = await razorpay.initiateRefund(payment.gatewayPaymentId, refundAmountPaise, {
      reason,
      paymentId: String(payment._id),
    });
    gatewayRefundId = rzRefund.id;
  }

  // Update payment atomically with CAS — only if still COMPLETED (prevents double-refund race)
  const beforeState = { status: payment.status, refundAmount: payment.refundAmount };
  const updatedPaymentDoc = await Payment.findOneAndUpdate(
    { _id: paymentId, status: PAYMENT_STATUS.COMPLETED },
    {
      $set: {
        refundAmount,
        refundReason: reason,
        refundedAt: new Date(),
        status: PAYMENT_STATUS.REFUNDED,
        ...(gatewayRefundId ? { refundId: gatewayRefundId } : {}),
      },
    },
    { new: true },
  );
  if (!updatedPaymentDoc) {
    throw ApiError.badRequest('Payment has already been refunded or is no longer in completed state');
  }

  // C2: Update invoice atomically — decrease paidAmount with floor clamp in single operation
  const updatedInvoice = await Invoice.findOneAndUpdate(
    { _id: payment.invoice },
    [
      {
        $set: {
          paidAmount: {
            $round: [{ $max: [0, { $subtract: ['$paidAmount', refundAmount] }] }, 2],
          },
        },
      },
    ],
    { new: true },
  );

  if (updatedInvoice) {
    const clampedPaidAmount = _round(updatedInvoice.paidAmount);

    // Recalculate invoice status based on the new paidAmount
    let newStatus;
    if (clampedPaidAmount <= 0) {
      newStatus = INVOICE_STATUS.REFUNDED;
    } else if (clampedPaidAmount < updatedInvoice.totalAmount) {
      newStatus = INVOICE_STATUS.PARTIALLY_PAID;
    }

    if (newStatus && newStatus !== updatedInvoice.status) {
      await Invoice.updateOne(
        { _id: payment.invoice },
        { $set: { status: newStatus } },
      );
    }
  }

  // For cash payments: update CashRegister cashOut atomically
  if (payment.mode === PAYMENT_MODE.CASH) {
    const CashRegister = conn.model('CashRegister');
    const registerFilter = payment.cashRegister
      ? { _id: payment.cashRegister }
      : { branch: payment.branch, status: CASH_REGISTER_STATUS.OPEN };
    await CashRegister.findOneAndUpdate(
      registerFilter,
      { $inc: { cashOut: refundAmount, transactionCount: 1 } },
    );
  }

  // Audit log
  await _createAuditLog(conn, {
    action: FINANCIAL_AUDIT_ACTION.PAYMENT_REFUNDED,
    entity: 'Payment',
    entityId: payment._id,
    actor: user.userId,
    actorRole: user.role,
    before: beforeState,
    after: { status: payment.status, refundAmount: payment.refundAmount, refundReason: reason },
    metadata: { invoiceId: payment.invoice },
    branch: payment.branch,
  });

  // Patient ledger — debit entry (refund -> clinic owes patient)
  // Uses transaction internally to prevent balance race conditions
  await _createLedgerEntry(conn, {
    patient: payment.patient,
    type: LEDGER_ENTRY_TYPE.DEBIT,
    amount: refundAmount,
    source: LEDGER_SOURCE.REFUND,
    reference: payment._id,
    referenceModel: 'Payment',
    description: `Refund of ${refundAmount} for payment ${payment._id} — ${reason}`,
    createdBy: user.userId,
    branch: payment.branch,
  });

  return payment;
}

/* ── listPayments ──────────────────────────────────────────────────── */

async function listPayments(query, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Payment = conn.model('Payment');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { deletedAt: null };
  if (query.patient) filter.patient = query.patient;
  if (query.invoice) filter.invoice = query.invoice;
  if (query.mode) filter.mode = query.mode;
  if (query.status) filter.status = query.status;
  if (query.branch) filter.branch = query.branch;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  // Self-scope: if user only has PAYMENT_READ_OWN, restrict to their payments
  if (!_hasFullAccess(user, PERMISSIONS.PAYMENT_READ)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (patientId) {
      filter.patient = patientId;
    } else {
      // No linked patient record — return empty
      return { items: [], total: 0, page: 1, limit };
    }
  }

  const [items, total] = await Promise.all([
    Payment.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('invoice', 'invoiceNumber totalAmount status')
      .populate('patient', 'name patientId phone'),
    Payment.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/* ── getPaymentById ────────────────────────────────────────────────── */

async function getPaymentById(id, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Payment = conn.model('Payment');

  const payment = await Payment.findById(id)
    .populate('invoice', 'invoiceNumber totalAmount paidAmount status')
    .populate('patient', 'name patientId phone email')
    .populate('processedBy', 'name');
  if (!payment) throw ApiError.notFound('Payment not found');

  // Self-scope check
  if (!_hasFullAccess(user, PERMISSIONS.PAYMENT_READ)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(payment.patient._id || payment.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only view your own payments');
    }
  }

  return payment;
}

/* ── getPaymentsForInvoice ─────────────────────────────────────────── */

async function getPaymentsForInvoice(invoiceId, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Payment = conn.model('Payment');
  const Invoice = conn.model('Invoice');

  // Verify invoice exists
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw ApiError.notFound('Invoice not found');

  // Self-scope check
  if (!_hasFullAccess(user, PERMISSIONS.PAYMENT_READ)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(invoice.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only view payments for your own invoices');
    }
  }

  const payments = await Payment.find({ invoice: invoiceId })
    .sort({ createdAt: -1 })
    .populate('processedBy', 'name');

  return payments;
}

/* ── generateReceipt ───────────────────────────────────────────────── */

async function generateReceipt(paymentId, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Payment = conn.model('Payment');
  const Invoice = conn.model('Invoice');

  const payment = await Payment.findById(paymentId).lean();
  if (!payment) throw ApiError.notFound('Payment not found');

  // Self-scope check
  if (!_hasFullAccess(user, PERMISSIONS.PAYMENT_READ)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(payment.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only download receipts for your own payments');
    }
  }

  const invoice = await Invoice.findById(payment.invoice)
    .populate('patient', 'name patientId phone email')
    .lean();
  if (!invoice) throw ApiError.notFound('Associated invoice not found');

  let clinic = { name: 'BestoClinic' };
  try {
    const clinicModule = require('../clinic/clinic.service');
    const clinicDoc = await clinicModule.getClinicSettings(tenantSlug);
    const addr = clinicDoc.address || {};
    const addressParts = [addr.street, addr.locality, addr.city, addr.state].filter(Boolean);
    const addressLine = addressParts.join(', ') + (addr.zipCode ? ` - ${addr.zipCode}` : '');
    clinic = {
      name: clinicDoc.name || 'BestoClinic',
      address: addressLine,
      phone: clinicDoc.phone || '',
      email: clinicDoc.email || '',
      gstin: clinicDoc.gstin || '',
    };
  } catch {
    // fallback already set above
  }

  const { generateReceiptPdf } = require('../../utils/pdfGenerator');
  return generateReceiptPdf(payment, invoice, clinic);
}

module.exports = {
  createPayment,
  createGatewayOrder,
  verifyGatewayPayment,
  handleWebhook,
  processRefund,
  listPayments,
  getPaymentById,
  getPaymentsForInvoice,
  generateReceipt,
};
