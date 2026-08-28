const { getTenantConnection } = require('../../db/tenantConnectionManager');
const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');

async function listHolidays(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ClinicHoliday = conn.model('ClinicHoliday');

  const { skip, limit, page, sort } = parsePagination(query);
  const { year, month, branchId, isActive } = query;
  const filter = { deletedAt: null };

  if (isActive !== undefined) {
    filter.isActive = isActive === 'true' || isActive === true;
  }

  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.name = { $regex: escaped, $options: 'i' };
  }

  if (year) {
    const start = new Date(year, month ? month - 1 : 0, 1);
    const end = month
      ? new Date(year, month, 0, 23, 59, 59, 999)
      : new Date(year, 11, 31, 23, 59, 59, 999);
    filter.$or = [
      { startDate: { $gte: start, $lte: end } },
      { endDate: { $gte: start, $lte: end } },
      { startDate: { $lte: start }, endDate: { $gte: end } },
    ];
  }

  if (branchId) {
    filter.$or = [
      { branches: { $size: 0 } },
      { branches: branchId },
    ];
  }

  const [items, total] = await Promise.all([
    ClinicHoliday.find(filter)
      .populate('branches', 'name code')
      .populate('createdBy', 'name email')
      .sort(query.sort ? sort : { startDate: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ClinicHoliday.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getHolidayById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ClinicHoliday = conn.model('ClinicHoliday');

  const holiday = await ClinicHoliday.findById(id)
    .populate('branches', 'name code')
    .populate('createdBy', 'name email')
    .lean();

  if (!holiday) throw ApiError.notFound('Holiday not found');
  return holiday;
}

async function createHoliday(data, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ClinicHoliday = conn.model('ClinicHoliday');

  const holiday = await ClinicHoliday.create({
    ...data,
    createdBy: userId,
  });

  return holiday.toObject();
}

async function updateHoliday(id, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ClinicHoliday = conn.model('ClinicHoliday');

  const holiday = await ClinicHoliday.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  })
    .populate('branches', 'name code')
    .populate('createdBy', 'name email')
    .lean();

  if (!holiday) throw ApiError.notFound('Holiday not found');
  return holiday;
}

async function deleteHoliday(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ClinicHoliday = conn.model('ClinicHoliday');

  const holiday = await ClinicHoliday.findByIdAndUpdate(
    id,
    { deletedAt: new Date() },
    { new: true }
  );

  if (!holiday) throw ApiError.notFound('Holiday not found');
  return { message: 'Holiday deleted' };
}

async function getHolidaysForDate(date, branchId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ClinicHoliday = conn.model('ClinicHoliday');

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const filter = {
    isActive: true,
    deletedAt: null,
    startDate: { $lte: dayEnd },
    endDate: { $gte: dayStart },
  };

  if (branchId) {
    filter.$or = [
      { branches: { $size: 0 } },
      { branches: branchId },
    ];
  }

  return ClinicHoliday.find(filter).lean();
}

async function getHolidaysForRange(startDate, endDate, branchId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ClinicHoliday = conn.model('ClinicHoliday');

  const filter = {
    isActive: true,
    deletedAt: null,
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };

  if (branchId) {
    filter.$or = [
      { branches: { $size: 0 } },
      { branches: branchId },
    ];
  }

  return ClinicHoliday.find(filter).lean();
}

module.exports = {
  listHolidays,
  getHolidayById,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  getHolidaysForDate,
  getHolidaysForRange,
};
