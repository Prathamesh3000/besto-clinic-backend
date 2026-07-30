'use strict';

const payrollService = require('./payroll.service');
const ApiResponse = require('../../utils/ApiResponse');

// ── Salary Structures ───────────────────────────────────────

exports.listSalaryStructures = async (req, res) => {
  const { items, total, page, limit } = await payrollService.listSalaryStructures(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Salary structures retrieved', items, { page, limit, total }));
};

exports.getSalaryStructureById = async (req, res) => {
  const structure = await payrollService.getSalaryStructureById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Salary structure retrieved', structure));
};

exports.createSalaryStructure = async (req, res) => {
  const structure = await payrollService.createSalaryStructure(req.body, req.user.userId, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Salary structure created', structure));
};

exports.updateSalaryStructure = async (req, res) => {
  const structure = await payrollService.updateSalaryStructure(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Salary structure updated', structure));
};

// ── Payslips ────────────────────────────────────────────────

exports.listPayslips = async (req, res) => {
  const { items, total, page, limit } = await payrollService.listPayslips(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Payslips retrieved', items, { page, limit, total }));
};

exports.getPayslipById = async (req, res) => {
  const payslip = await payrollService.getPayslipById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Payslip retrieved', payslip));
};

exports.generatePayslips = async (req, res) => {
  const { month, year } = req.body;
  const result = await payrollService.generatePayslips(month, year, req.user.userId, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Payslips generated', result));
};

exports.approvePayslip = async (req, res) => {
  const payslip = await payrollService.approvePayslip(req.params.id, req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Payslip approved', payslip));
};

exports.markPayslipPaid = async (req, res) => {
  const payslip = await payrollService.markPayslipPaid(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Payslip marked as paid', payslip));
};
