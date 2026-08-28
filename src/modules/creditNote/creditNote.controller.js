'use strict';

const creditNoteService = require('./creditNote.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.create = async (req, res) => {
  const creditNote = await creditNoteService.createCreditNote(req.body, req.user, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Credit note created', creditNote));
};

exports.issue = async (req, res) => {
  const creditNote = await creditNoteService.issueCreditNote(req.params.id, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Credit note issued', creditNote));
};

exports.apply = async (req, res) => {
  const creditNote = await creditNoteService.applyCreditNote(req.params.id, req.body, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Credit note applied', creditNote));
};

exports.list = async (req, res) => {
  const { items, total, page, limit } = await creditNoteService.listCreditNotes(req.query, req.user, req.tenantSlug);
  res.json(ApiResponse.paginated('Credit notes retrieved', items, { page, limit, total }));
};

exports.getById = async (req, res) => {
  const creditNote = await creditNoteService.getCreditNoteById(req.params.id, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Credit note retrieved', creditNote));
};

exports.getForPatient = async (req, res) => {
  const { items, total, page, limit } = await creditNoteService.getCreditNotesForPatient(
    req.params.patientId, req.query, req.user, req.tenantSlug,
  );
  res.json(ApiResponse.paginated('Patient credit notes retrieved', items, { page, limit, total }));
};
