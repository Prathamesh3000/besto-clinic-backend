'use strict';

/**
 * Notification service — in-app notifications via WebSocket + optional push.
 */

const logger = require('../utils/logger');
const emailService = require('./email.service');

/**
 * Send an invoice overdue notice.
 */
async function sendInvoiceOverdueNotice({ patient, invoice }) {
  if (patient.email) {
    try {
      await emailService.sendInvoiceOverdueNotice({
        email: patient.email,
        name: patient.name,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
        dueDate: invoice.dueDate,
      });
    } catch (err) {
      logger.error('Notification: overdue email failed for invoice %s — %s', invoice.invoiceNumber, err.message);
    }
  }
}

/**
 * Generic in-app notification via WebSocket.
 */
function notifyUser(userId, event, payload) {
  try {
    const { emitToUser } = require('../websocket');
    emitToUser(userId, event, payload);
  } catch (err) {
    logger.error('Notification: WebSocket emit failed — %s', err.message);
  }
}

module.exports = { sendInvoiceOverdueNotice, notifyUser };
