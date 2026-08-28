'use strict';

const ApiError = require('./ApiError');
const logger = require('./logger');

let PDFDocument = null;
try {
  PDFDocument = require('pdfkit');
} catch {
  logger.warn('pdfkit npm package is not installed — PDF generation will be unavailable');
}

/**
 * Format a number as Indian Rupee currency string.
 * @param {number} n
 * @returns {string}
 */
function formatINR(n) {
  return `\u20B9${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Safe-stringify: if value is an object (e.g. Mongoose subdocument), join its
 * non-empty leaf values with ", " instead of dumping raw JSON into the PDF.
 * @param {*} val
 * @returns {string}
 */
function _str(val) {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (typeof val !== 'object') return String(val);
  // Handle Mongoose documents that expose toJSON / toObject
  const plain = typeof val.toJSON === 'function' ? val.toJSON() : val;
  return Object.values(plain).filter((v) => v != null && typeof v !== 'object' && String(v).trim()).join(', ');
}

/**
 * Generate a PDF invoice buffer.
 * @param {object} invoice - Full invoice document (populated patient, doctor, items)
 * @param {object} clinic - Clinic settings { name, address, phone, email, gstin, logo }
 * @returns {Promise<Buffer>}
 */
async function generateInvoicePdf(invoice, clinic) {
  if (!PDFDocument) {
    throw ApiError.serviceUnavailable('PDF generation is not available — pdfkit package is not installed');
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // ── Header ──
    doc.fontSize(20).font('Helvetica-Bold').text(_str(clinic.name) || 'BestoClinic', { align: 'center' });
    const clinicAddr = _str(clinic.address);
    if (clinicAddr) doc.fontSize(10).font('Helvetica').text(clinicAddr, { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Phone: ${_str(clinic.phone)} | Email: ${_str(clinic.email)}`, { align: 'center' });
    if (clinic.gstin) doc.text(`GSTIN: ${_str(clinic.gstin)}`, { align: 'center' });
    doc.moveDown();

    // ── Invoice Title ──
    doc.fontSize(16).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
    doc.moveDown(0.5);

    // ── Invoice Meta (two columns) ──
    const metaY = doc.y;
    doc.fontSize(10).font('Helvetica');
    doc.text(`Invoice #: ${invoice.invoiceNumber}`, 50, metaY);
    doc.text(`Date: ${new Date(invoice.createdAt).toLocaleDateString('en-IN')}`, 50);
    if (invoice.dueDate) doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString('en-IN')}`, 50);
    doc.text(`Status: ${(invoice.status || '').toUpperCase()}`, 50);

    // Patient info (right side)
    doc.text('Bill To:', 350, metaY, { underline: true });
    doc.text(_str(invoice.patient?.name) || 'N/A', 350);
    if (invoice.patient?.phone) doc.text(`Phone: ${_str(invoice.patient.phone)}`, 350);
    if (invoice.patient?.email) doc.text(`Email: ${_str(invoice.patient.email)}`, 350);
    doc.moveDown(2);

    // ── Items Table ──
    const tableTop = doc.y;
    const col = { desc: 50, type: 220, qty: 280, price: 330, disc: 390, tax: 440, total: 490 };

    // Header row
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Description', col.desc, tableTop);
    doc.text('Type', col.type, tableTop);
    doc.text('Qty', col.qty, tableTop, { width: 40, align: 'right' });
    doc.text('Price', col.price, tableTop, { width: 50, align: 'right' });
    doc.text('Disc', col.disc, tableTop, { width: 40, align: 'right' });
    doc.text('Tax', col.tax, tableTop, { width: 40, align: 'right' });
    doc.text('Total', col.total, tableTop, { width: 55, align: 'right' });

    doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();
    let y = tableTop + 22;

    // Item rows
    doc.font('Helvetica').fontSize(9);
    for (const item of (invoice.items || [])) {
      if (y > 700) { doc.addPage(); y = 50; }
      doc.text(item.description || '', col.desc, y, { width: 165 });
      doc.text(item.itemType || '', col.type, y, { width: 55 });
      doc.text(String(item.quantity || 1), col.qty, y, { width: 40, align: 'right' });
      doc.text(formatINR(item.unitPrice), col.price, y, { width: 50, align: 'right' });
      doc.text(formatINR(item.discount), col.disc, y, { width: 40, align: 'right' });
      doc.text(formatINR(item.tax), col.tax, y, { width: 40, align: 'right' });
      doc.text(formatINR(item.total), col.total, y, { width: 55, align: 'right' });
      y += 18;
    }

    // Separator
    doc.moveTo(50, y).lineTo(545, y).stroke();
    y += 10;

    // ── Totals ──
    doc.font('Helvetica').fontSize(10);
    const totalsX = 400;
    doc.text('Subtotal:', totalsX, y); doc.text(formatINR(invoice.subtotal), 490, y, { width: 55, align: 'right' }); y += 16;
    if (invoice.discountAmount) { doc.text('Discount:', totalsX, y); doc.text(`-${formatINR(invoice.discountAmount)}`, 490, y, { width: 55, align: 'right' }); y += 16; }
    if (invoice.promotionDiscount) { doc.text('Promo Discount:', totalsX, y); doc.text(`-${formatINR(invoice.promotionDiscount)}`, 490, y, { width: 55, align: 'right' }); y += 16; }
    if (invoice.taxAmount) { doc.text('Tax:', totalsX, y); doc.text(formatINR(invoice.taxAmount), 490, y, { width: 55, align: 'right' }); y += 16; }
    if (invoice.gstDetails) {
      const gst = invoice.gstDetails;
      if (gst.cgst) { doc.text('  CGST:', totalsX, y); doc.text(formatINR(gst.cgst), 490, y, { width: 55, align: 'right' }); y += 14; }
      if (gst.sgst) { doc.text('  SGST:', totalsX, y); doc.text(formatINR(gst.sgst), 490, y, { width: 55, align: 'right' }); y += 14; }
      if (gst.igst) { doc.text('  IGST:', totalsX, y); doc.text(formatINR(gst.igst), 490, y, { width: 55, align: 'right' }); y += 14; }
    }
    y += 4;
    doc.moveTo(totalsX, y).lineTo(545, y).stroke(); y += 6;
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('Total:', totalsX, y); doc.text(formatINR(invoice.totalAmount), 490, y, { width: 55, align: 'right' }); y += 18;
    doc.font('Helvetica').fontSize(10);
    doc.text('Paid:', totalsX, y); doc.text(formatINR(invoice.paidAmount), 490, y, { width: 55, align: 'right' }); y += 16;
    const remaining = Math.max((invoice.totalAmount || 0) - (invoice.paidAmount || 0), 0);
    if (remaining > 0) {
      doc.font('Helvetica-Bold').fillColor('red');
      doc.text('Balance Due:', totalsX, y); doc.text(formatINR(remaining), 490, y, { width: 55, align: 'right' });
      doc.fillColor('black'); y += 18;
    }

    // ── Payment Breakdown ──
    if (invoice.paidVia && invoice.paidVia.length) {
      y += 10;
      doc.font('Helvetica-Bold').fontSize(10).text('Payment Breakdown:', 50, y); y += 16;
      doc.font('Helvetica').fontSize(9);
      for (const pv of invoice.paidVia) {
        doc.text(`${(pv.mode || '').toUpperCase()}: ${formatINR(pv.amount)}${pv.reference ? ` (Ref: ${pv.reference})` : ''}`, 50, y);
        y += 14;
      }
    }

    // ── Doctor ──
    if (invoice.doctor) {
      y += 10;
      doc.fontSize(9).text(`Treating Doctor: Dr. ${_str(invoice.doctor.name)}${invoice.doctor.specialization ? ` (${_str(invoice.doctor.specialization)})` : ''}`, 50, y);
    }

    // ── Notes ──
    if (invoice.notes) {
      y += 16;
      doc.fontSize(9).font('Helvetica-Oblique').text(`Notes: ${invoice.notes}`, 50, y, { width: 495 });
    }

    // ── Footer ──
    doc.fontSize(8).font('Helvetica').text(
      'This is a computer-generated invoice. No signature required.',
      50, 770, { align: 'center', width: 495 },
    );

    doc.end();
  });
}

/**
 * Generate a PDF payment receipt buffer.
 * @param {object} payment - Payment document (populated or lean)
 * @param {object} invoice - Invoice document (populated patient)
 * @param {object} clinic - Clinic settings { name, address, phone, email, gstin }
 * @returns {Promise<Buffer>}
 */
async function generateReceiptPdf(payment, invoice, clinic) {
  if (!PDFDocument) {
    throw ApiError.serviceUnavailable('PDF generation is not available — pdfkit package is not installed');
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // ── Header ──
    doc.fontSize(20).font('Helvetica-Bold').text(_str(clinic.name) || 'BestoClinic', { align: 'center' });
    const clinicAddr = _str(clinic.address);
    if (clinicAddr) doc.fontSize(10).font('Helvetica').text(clinicAddr, { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Phone: ${_str(clinic.phone)} | Email: ${_str(clinic.email)}`, { align: 'center' });
    if (clinic.gstin) doc.text(`GSTIN: ${_str(clinic.gstin)}`, { align: 'center' });
    doc.moveDown();

    // ── Receipt Title ──
    doc.fontSize(16).font('Helvetica-Bold').text('PAYMENT RECEIPT', { align: 'center' });
    doc.moveDown(0.5);

    // ── Receipt Meta (two columns) ──
    const metaY = doc.y;
    doc.fontSize(10).font('Helvetica');
    doc.text(`Receipt #: ${payment._id}`, 50, metaY);
    doc.text(`Date: ${new Date(payment.paidAt || payment.createdAt).toLocaleDateString('en-IN')}`, 50);
    doc.text(`Invoice #: ${invoice.invoiceNumber}`, 50);
    doc.text(`Payment Mode: ${(payment.mode || '').toUpperCase()}`, 50);
    if (payment.reference) doc.text(`Reference: ${payment.reference}`, 50);

    // Patient info (right side)
    doc.text('Received From:', 350, metaY, { underline: true });
    doc.text(_str(invoice.patient?.name) || 'N/A', 350);
    if (invoice.patient?.phone) doc.text(`Phone: ${_str(invoice.patient.phone)}`, 350);
    if (invoice.patient?.email) doc.text(`Email: ${_str(invoice.patient.email)}`, 350);
    doc.moveDown(2);

    // ── Separator ──
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // ── Payment Details ──
    doc.font('Helvetica-Bold').fontSize(11);
    let y = doc.y;
    doc.text('Payment Details', 50, y); y += 20;
    doc.font('Helvetica').fontSize(10);
    doc.text('Invoice Total:', 50, y); doc.text(formatINR(invoice.totalAmount), 250, y); y += 16;
    doc.text('Amount Paid (this receipt):', 50, y); doc.text(formatINR(payment.amount), 250, y); y += 16;
    doc.text('Total Paid to Date:', 50, y); doc.text(formatINR(invoice.paidAmount), 250, y); y += 16;

    const remaining = Math.max((invoice.totalAmount || 0) - (invoice.paidAmount || 0), 0);
    doc.text('Balance Remaining:', 50, y);
    if (remaining > 0) {
      doc.font('Helvetica-Bold').fillColor('red');
    }
    doc.text(formatINR(remaining), 250, y);
    doc.fillColor('black').font('Helvetica');
    y += 20;

    // ── Separator ──
    doc.moveTo(50, y).lineTo(545, y).stroke();
    y += 10;

    doc.font('Helvetica-Bold').fontSize(12);
    doc.text(`Amount Received: ${formatINR(payment.amount)}`, 50, y);
    y += 20;

    // ── Notes ──
    if (payment.notes) {
      doc.font('Helvetica-Oblique').fontSize(9);
      doc.text(`Notes: ${payment.notes}`, 50, y, { width: 495 });
    }

    // ── Footer ──
    doc.fontSize(8).font('Helvetica').text(
      'This is a computer-generated receipt. No signature required.',
      50, 770, { align: 'center', width: 495 },
    );

    doc.end();
  });
}

module.exports = { generateInvoicePdf, generateReceiptPdf };
