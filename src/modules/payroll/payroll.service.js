'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');

// ── Salary Structures ───────────────────────────────────────

async function listSalaryStructures(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const SalaryStructure = conn.model('SalaryStructure');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.user) filter.user = query.user;

  const [items, total] = await Promise.all([
    SalaryStructure.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('user', 'name email role'),
    SalaryStructure.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getSalaryStructureById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const SalaryStructure = conn.model('SalaryStructure');
  const structure = await SalaryStructure.findById(id)
    .populate('user', 'name email role');
  if (!structure) throw ApiError.notFound('Salary structure not found');
  return structure;
}

async function createSalaryStructure(data, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const SalaryStructure = conn.model('SalaryStructure');
  const User = conn.model('User');

  // Validate that the referenced user exists
  const userExists = await User.findById(data.user);
  if (!userExists) throw ApiError.notFound('User not found');

  data.createdBy = userId;
  return SalaryStructure.create(data);
}

async function updateSalaryStructure(id, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const SalaryStructure = conn.model('SalaryStructure');
  const structure = await SalaryStructure.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!structure) throw ApiError.notFound('Salary structure not found');
  return structure;
}

// ── Payslips ────────────────────────────────────────────────

async function listPayslips(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Payslip = conn.model('Payslip');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.user) filter.user = query.user;
  if (query.month) filter.month = Number(query.month);
  if (query.year) filter.year = Number(query.year);
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    Payslip.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('user', 'name email role')
      .populate('approvedBy', 'name'),
    Payslip.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getPayslipById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Payslip = conn.model('Payslip');
  const payslip = await Payslip.findById(id)
    .populate('user', 'name email role')
    .populate('salaryStructure')
    .populate('approvedBy', 'name');
  if (!payslip) throw ApiError.notFound('Payslip not found');
  return payslip;
}

async function generatePayslips(month, year, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const SalaryStructure = conn.model('SalaryStructure');
  const Payslip = conn.model('Payslip');

  // 1. Get all active salary structures effective for this pay period
  const structures = await SalaryStructure.find({
    isActive: true,
    deletedAt: null,
    effectiveFrom: { $lte: new Date(year, month - 1, 28) },
  });

  // 2. Filter out structures whose effectiveTo is before the pay period start
  const payPeriodStart = new Date(year, month - 1, 1);
  const activeStructures = structures.filter(
    (s) => !s.effectiveTo || s.effectiveTo >= payPeriodStart,
  );

  let created = 0;
  let skipped = 0;
  const payslips = [];

  for (const structure of activeStructures) {
    // 3. Check if payslip already exists for this user + month + year
    const existing = await Payslip.findOne({
      user: structure.user,
      month,
      year,
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    // 4. Calculate earnings and deductions
    const base = structure.baseSalary;

    const allowanceItems = (structure.allowances || []).map((a) => ({
      name: a.name,
      amount: a.isFixed ? a.amount : (base * a.amount) / 100,
    }));

    const grossPay = base + allowanceItems.reduce((sum, a) => sum + a.amount, 0);

    const deductionItems = (structure.deductions || []).map((d) => ({
      name: d.name,
      amount: d.isFixed ? d.amount : (base * d.amount) / 100,
    }));

    const totalDeductions = deductionItems.reduce((sum, d) => sum + d.amount, 0);
    const netPay = grossPay - totalDeductions;

    // 5. Create the payslip
    const payslip = await Payslip.create({
      user: structure.user,
      salaryStructure: structure._id,
      month,
      year,
      earnings: {
        base,
        allowances: allowanceItems,
        grossPay,
      },
      deductions: {
        items: deductionItems,
        totalDeductions,
      },
      netPay,
      status: 'draft',
      createdBy: userId,
    });

    payslips.push(payslip);
    created += 1;
  }

  return { created, skipped, payslips };
}

async function approvePayslip(id, approvedById, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Payslip = conn.model('Payslip');

  const payslip = await Payslip.findById(id);
  if (!payslip) throw ApiError.notFound('Payslip not found');

  if (payslip.status !== 'draft') {
    throw ApiError.badRequest('Only draft payslips can be approved');
  }

  payslip.status = 'approved';
  payslip.approvedBy = approvedById;
  payslip.approvedAt = new Date();

  await payslip.save();
  return payslip;
}

async function markPayslipPaid(id, paymentData, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Payslip = conn.model('Payslip');

  const payslip = await Payslip.findById(id);
  if (!payslip) throw ApiError.notFound('Payslip not found');

  if (payslip.status !== 'approved') {
    throw ApiError.badRequest('Only approved payslips can be marked as paid');
  }

  payslip.status = 'paid';
  payslip.paidAt = new Date();
  payslip.paymentMethod = paymentData.paymentMethod;
  payslip.paymentReference = paymentData.paymentReference;

  await payslip.save();
  return payslip;
}

module.exports = {
  listSalaryStructures,
  getSalaryStructureById,
  createSalaryStructure,
  updateSalaryStructure,
  listPayslips,
  getPayslipById,
  generatePayslips,
  approvePayslip,
  markPayslipPaid,
};
