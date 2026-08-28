'use strict';

const mongoose = require('mongoose');
const { INVOICE_STATUS } = require('../../config/constants');

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      unique: true,
      required: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      index: true,
    },

    /** Line items */
    items: [
      {
        description: { type: String, required: true },
        quantity: { type: Number, default: 1, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        discount: { type: Number, default: 0, min: 0 },
        tax: { type: Number, default: 0, min: 0 },
        total: { type: Number, required: true, min: 0 },
        itemType: {
          type: String,
          enum: ['treatment', 'medicine', 'equipment', 'lab', 'consultation', 'other'],
          default: 'other',
        },
        serviceItem: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceItem' },
        hsnCode: String,
        taxRate: { type: Number, min: 0, max: 100 },
      },
    ],

    /** Totals */
    subtotal: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },

    /** GST supply type */
    gstType: {
      type: String,
      enum: ['intrastate', 'interstate'],
      default: 'intrastate',
    },

    /** GST breakdown */
    gstDetails: {
      cgst: { type: Number, default: 0, min: 0 },
      sgst: { type: Number, default: 0, min: 0 },
      igst: { type: Number, default: 0, min: 0 },
      cessAmount: { type: Number, default: 0, min: 0 },
    },

    /** Promotion */
    promotionCode: String,
    promotionDiscount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },

    /** Sequential numbering per tenant */
    sequenceNumber: { type: Number, index: true },

    /** Payment */
    status: {
      type: String,
      enum: Object.values(INVOICE_STATUS),
      default: INVOICE_STATUS.DRAFT,
    },
    paidAmount: { type: Number, default: 0, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'upi', 'net_banking', 'insurance', 'credit_balance', 'other'],
    },
    paymentReference: String,
    paidAt: Date,
    dueDate: Date,

    /** Multi-payment tracking */
    payments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }],
    paidVia: [
      {
        mode: String,
        amount: { type: Number, min: 0 },
        reference: String,
      },
    ],

    /** Overdue tracking */
    overdueNotification: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
    },

    notes: String,

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

// Virtual: remaining balance
invoiceSchema.virtual('remainingBalance').get(function () {
  return Math.max((this.totalAmount || 0) - (this.paidAmount || 0), 0);
});

// Indexes
invoiceSchema.index({ status: 1, dueDate: 1 });
invoiceSchema.index({ branch: 1, status: 1 });
invoiceSchema.index({ deletedAt: 1 });

// Soft-delete filter
invoiceSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

// Auto-generate invoice number
invoiceSchema.pre('validate', function (next) {
  if (!this.invoiceNumber) {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    this.invoiceNumber = `INV-${ts}-${rand}`;
  }
  next();
});

// Prevent modification of financial fields after payment
invoiceSchema.pre('save', function (next) {
  if (this.isNew) return next();

  const hasPaidAmount = (this.paidAmount || 0) > 0;
  const hasPayments = this.payments && this.payments.length > 0;

  if (hasPaidAmount || hasPayments) {
    const protectedFields = ['items', 'subtotal', 'taxAmount', 'discountAmount', 'totalAmount'];
    for (const field of protectedFields) {
      if (this.isModified(field)) {
        const err = new Error(`Cannot modify ${field} on an invoice that has received payments`);
        err.statusCode = 400;
        err.isOperational = true;
        return next(err);
      }
    }
  }

  next();
});

module.exports = invoiceSchema;
