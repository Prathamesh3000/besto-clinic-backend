'use strict';

const invoiceService = require('./invoice.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, total, page, limit, stats } = await invoiceService.listInvoices(req.query, req.user, req.tenantSlug);
  const response = ApiResponse.paginated('Invoices retrieved', items, { page, limit, total });
  response.stats = stats;
  res.json(response);
};

exports.getById = async (req, res) => {
  const invoice = await invoiceService.getInvoiceById(req.params.id, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Invoice retrieved', invoice));
};

exports.create = async (req, res) => {
  const invoice = await invoiceService.createInvoice(req.body, req.user.userId, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Invoice created', invoice));
};

exports.update = async (req, res) => {
  const invoice = await invoiceService.updateInvoice(req.params.id, req.body, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Invoice updated', invoice));
};

exports.remove = async (req, res) => {
  await invoiceService.deleteInvoice(req.params.id, req.tenantSlug);
  res.json(ApiResponse.deleted('Invoice deleted'));
};

exports.downloadPdf = async (req, res) => {
  const pdfBuffer = await invoiceService.generateInvoicePdf(req.params.id, req.tenantSlug);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="invoice-${req.params.id}.pdf"`,
    'Content-Length': pdfBuffer.length,
  });
  res.send(pdfBuffer);
};
