'use strict';

const paymentService = require('./payment.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.create = async (req, res) => {
  const payment = await paymentService.createPayment(req.body, req.user, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Payment recorded', payment));
};

exports.createOrder = async (req, res) => {
  const { invoiceId, amount } = req.body;
  const order = await paymentService.createGatewayOrder(invoiceId, amount, req.user, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Gateway order created', order));
};

exports.verifyPayment = async (req, res) => {
  const payment = await paymentService.verifyGatewayPayment(req.body, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Payment verified', payment));
};

exports.webhook = async (req, res) => {
  const signature = req.headers['x-razorpay-signature'] || '';
  const result = await paymentService.handleWebhook(req.body, signature);
  // Always return 200 for webhooks — Razorpay retries on non-2xx
  res.json(ApiResponse.success('Webhook processed', result));
};

exports.refund = async (req, res) => {
  const { amount, reason } = req.body;
  const payment = await paymentService.processRefund(req.params.id, amount, reason, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Refund processed', payment));
};

exports.list = async (req, res) => {
  const { items, total, page, limit } = await paymentService.listPayments(req.query, req.user, req.tenantSlug);
  res.json(ApiResponse.paginated('Payments retrieved', items, { page, limit, total }));
};

exports.getById = async (req, res) => {
  const payment = await paymentService.getPaymentById(req.params.id, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Payment retrieved', payment));
};

exports.getForInvoice = async (req, res) => {
  const payments = await paymentService.getPaymentsForInvoice(req.params.invoiceId, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Payments for invoice retrieved', payments));
};

exports.downloadReceipt = async (req, res) => {
  const pdfBuffer = await paymentService.generateReceipt(req.params.id, req.user, req.tenantSlug);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="receipt-${req.params.id}.pdf"`,
    'Content-Length': pdfBuffer.length,
  });
  res.send(pdfBuffer);
};
