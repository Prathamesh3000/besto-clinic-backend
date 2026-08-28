'use strict';

const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { PERMISSIONS } = require('../../config/permissions');
const logger = require('../../utils/logger');

// Lazy-loaded to avoid circular dependency at startup
let _getRolePermissions;
function resolvePerms(role, tenantSlug) {
  if (!_getRolePermissions) {
    _getRolePermissions = require('../role/role.service').getRolePermissions;
  }
  return _getRolePermissions(role, tenantSlug);
}

/** Escape regex special characters to prevent ReDoS */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Tenant search categories ─────────────────────────────────

const TENANT_CATEGORIES = {
  patients: {
    model: 'Patient',
    label: 'Patients',
    icon: 'Users',
    permAny: [PERMISSIONS.PATIENT_READ, PERMISSIONS.PATIENT_READ_OWN],
    fullPerm: PERMISSIONS.PATIENT_READ,
    fields: ['name', 'email', 'phone', 'patientId'],
    select: 'name email phone patientId gender isActive',
    populate: [{ path: 'primaryDoctor', select: 'name' }],
    urlTemplate: '/clinic/patients',
    subtitle: (item) => item.patientId || item.email || '',
  },
  doctors: {
    model: 'User',
    label: 'Doctors',
    icon: 'Stethoscope',
    permAny: [PERMISSIONS.USER_READ],
    extraFilter: { role: 'doctor' },
    fields: ['name', 'email'],
    select: 'name email specialization role',
    urlTemplate: '/clinic/doctors',
    subtitle: (item) => item.specialization || item.email || '',
  },
  staff: {
    model: 'User',
    label: 'Staff',
    icon: 'UserCog',
    permAny: [PERMISSIONS.USER_READ],
    extraFilter: { role: { $nin: ['doctor', 'patient', 'guardian'] } },
    fields: ['name', 'email'],
    select: 'name email role',
    urlTemplate: '/clinic/staff',
    subtitle: (item) => (item.role || '').replace(/_/g, ' '),
  },
  appointments: {
    model: 'Appointment',
    label: 'Appointments',
    icon: 'CalendarDays',
    permAny: [PERMISSIONS.APPOINTMENT_READ, PERMISSIONS.APPOINTMENT_READ_OWN],
    fullPerm: PERMISSIONS.APPOINTMENT_READ,
    fields: [],
    select: 'scheduledAt status type reason',
    populate: [
      { path: 'patient', select: 'name patientId' },
      { path: 'doctor', select: 'name' },
    ],
    urlTemplate: '/clinic/appointments',
    displayName: (item) => {
      const parts = [];
      if (item.patient?.name) parts.push(item.patient.name);
      if (item.doctor?.name) parts.push(`Dr. ${item.doctor.name}`);
      return parts.join(' — ') || 'Appointment';
    },
    subtitle: (item) => {
      const parts = [];
      if (item.reason) parts.push(item.reason);
      if (item.scheduledAt) {
        parts.push(new Date(item.scheduledAt).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric',
        }));
      }
      return parts.join(' · ');
    },
    // Appointments use a two-step search via patient/doctor name
    customSearch: true,
  },
  invoices: {
    model: 'Invoice',
    label: 'Invoices',
    icon: 'FileText',
    permAny: [PERMISSIONS.INVOICE_READ, PERMISSIONS.INVOICE_READ_OWN],
    fullPerm: PERMISSIONS.INVOICE_READ,
    fields: ['invoiceNumber'],
    select: 'invoiceNumber totalAmount status createdAt',
    populate: [{ path: 'patient', select: 'name' }],
    urlTemplate: '/clinic/billing',
    displayName: (item) => item.invoiceNumber || `Invoice #${item._id.toString().slice(-6)}`,
    subtitle: (item) => {
      const parts = [];
      if (item.patient?.name) parts.push(item.patient.name);
      if (item.totalAmount != null) parts.push(`₹${item.totalAmount}`);
      return parts.join(' · ');
    },
  },
  prescriptions: {
    model: 'Prescription',
    label: 'Prescriptions',
    icon: 'Pill',
    permAny: [PERMISSIONS.PRESCRIPTION_READ, PERMISSIONS.PRESCRIPTION_READ_OWN],
    fullPerm: PERMISSIONS.PRESCRIPTION_READ,
    fields: ['prescriptionId', 'diagnosis'],
    select: 'prescriptionId diagnosis status createdAt',
    populate: [{ path: 'patient', select: 'name' }],
    urlTemplate: '/clinic/prescriptions',
    displayName: (item) => item.prescriptionId || item.diagnosis || 'Prescription',
    subtitle: (item) => {
      const parts = [];
      if (item.patient?.name) parts.push(item.patient.name);
      if (item.diagnosis) parts.push(item.diagnosis);
      return parts.join(' · ');
    },
  },
  branches: {
    model: 'Branch',
    label: 'Branches',
    icon: 'Building2',
    permAny: [PERMISSIONS.BRANCH_READ],
    fields: ['name', 'code'],
    select: 'name code city isActive',
    urlTemplate: '/clinic/branches',
    subtitle: (item) => item.code || '',
  },
  departments: {
    model: 'Department',
    label: 'Departments',
    icon: 'Layers',
    permAny: [PERMISSIONS.DEPARTMENT_READ],
    fields: ['name'],
    select: 'name isActive',
    urlTemplate: '/clinic/departments',
    subtitle: () => '',
  },
  inventory: {
    model: 'InventoryItem',
    label: 'Inventory',
    icon: 'Package',
    permAny: [PERMISSIONS.INVENTORY_READ],
    fields: ['name', 'code', 'category'],
    select: 'name code category currentStock unit isActive',
    urlTemplate: '/clinic/inventory',
    subtitle: (item) => {
      const parts = [];
      if (item.category) parts.push(item.category);
      if (item.currentStock != null) parts.push(`Stock: ${item.currentStock}`);
      return parts.join(' · ');
    },
  },
};

// ── Patient search categories ────────────────────────────────

const PATIENT_CATEGORIES = {
  appointments: {
    model: 'Appointment',
    label: 'Appointments',
    icon: 'CalendarDays',
    fields: ['reason'],
    select: 'scheduledAt status type reason',
    populate: [{ path: 'doctor', select: 'name' }],
    urlTemplate: '/patient/appointments',
    displayName: (item) => {
      const parts = [];
      if (item.doctor?.name) parts.push(`Dr. ${item.doctor.name}`);
      if (item.reason) parts.push(item.reason);
      return parts.join(' — ') || 'Appointment';
    },
    subtitle: (item) => {
      if (item.scheduledAt) {
        return new Date(item.scheduledAt).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric',
        });
      }
      return item.status || '';
    },
  },
  prescriptions: {
    model: 'Prescription',
    label: 'Prescriptions',
    icon: 'Pill',
    fields: ['prescriptionId', 'diagnosis'],
    select: 'prescriptionId diagnosis status createdAt',
    populate: [{ path: 'doctor', select: 'name' }],
    urlTemplate: '/patient/health',
    displayName: (item) => item.prescriptionId || item.diagnosis || 'Prescription',
    subtitle: (item) => {
      const parts = [];
      if (item.doctor?.name) parts.push(`Dr. ${item.doctor.name}`);
      if (item.diagnosis && item.prescriptionId) parts.push(item.diagnosis);
      return parts.join(' · ') || '';
    },
  },
  payments: {
    model: 'Invoice',
    label: 'Payments',
    icon: 'CreditCard',
    fields: ['invoiceNumber'],
    select: 'invoiceNumber totalAmount status createdAt',
    urlTemplate: '/patient/payments',
    displayName: (item) => item.invoiceNumber || `Invoice #${item._id.toString().slice(-6)}`,
    subtitle: (item) => {
      const parts = [];
      if (item.totalAmount != null) parts.push(`₹${item.totalAmount}`);
      if (item.status) parts.push(item.status);
      return parts.join(' · ');
    },
  },
  healthRecords: {
    model: 'TreatmentRecord',
    label: 'Health Records',
    icon: 'HeartPulse',
    fields: ['diagnosis', 'treatment', 'chiefComplaint'],
    select: 'diagnosis treatment chiefComplaint createdAt',
    populate: [{ path: 'doctor', select: 'name' }],
    urlTemplate: '/patient/health',
    displayName: (item) => item.diagnosis || item.chiefComplaint || item.treatment || 'Health Record',
    subtitle: (item) => {
      if (item.doctor?.name) return `Dr. ${item.doctor.name}`;
      return '';
    },
  },
};

// ── Platform search categories ───────────────────────────────

const PLATFORM_CATEGORIES = {
  tenants: {
    model: 'Clinic',
    label: 'Clinics',
    icon: 'Building2',
    fields: ['name', 'slug', 'email', 'clinicCode'],
    select: 'name slug email status clinicCode',
    urlTemplate: '/platform/tenants',
    subtitle: (item) => item.slug || item.email || '',
  },
  plans: {
    model: 'Plan',
    label: 'Plans',
    icon: 'CreditCard',
    fields: ['name', 'slug'],
    select: 'name slug isActive pricing.monthly pricing.yearly',
    urlTemplate: '/platform/plans',
    subtitle: (item) => {
      if (item.pricing?.monthly) return `₹${item.pricing.monthly}/mo`;
      return item.slug || '';
    },
  },
  platformUsers: {
    model: 'PlatformUser',
    label: 'Platform Users',
    icon: 'Users',
    fields: ['name', 'email'],
    select: 'name email role isActive',
    urlTemplate: '/platform/users',
    subtitle: (item) => item.email || '',
  },
};

// ── Search helpers ───────────────────────────────────────────

/**
 * Build a regex $or filter from searchable fields.
 */
function buildRegexFilter(searchTerm, fields) {
  if (!fields || fields.length === 0) return {};
  const escaped = escapeRegex(searchTerm);
  return {
    $or: fields.map((field) => ({
      [field]: { $regex: escaped, $options: 'i' },
    })),
  };
}

/**
 * Search a single category against a Mongoose connection.
 */
async function searchCategoryOnConn(conn, categoryKey, config, searchTerm, limit, extraFilter) {
  const Model = conn.model(config.model);
  const filter = {
    deletedAt: null,
    ...buildRegexFilter(searchTerm, config.fields),
    ...(config.extraFilter || {}),
    ...(extraFilter || {}),
  };

  let query = Model.find(filter).select(config.select).limit(limit).lean();
  if (config.populate) {
    for (const p of config.populate) {
      query = query.populate(p);
    }
  }

  const items = await query;
  return {
    category: categoryKey,
    label: config.label,
    icon: config.icon,
    items: items.map((item) => ({
      _id: item._id.toString(),
      name: config.displayName ? config.displayName(item) : (item.name || ''),
      subtitle: config.subtitle(item),
      url: config.urlTemplate,
    })),
  };
}

/**
 * Search appointments via patient/doctor name lookup (two-step).
 */
async function searchAppointments(conn, config, searchTerm, limit, scopeFilter) {
  const escaped = escapeRegex(searchTerm);
  const nameRegex = { $regex: escaped, $options: 'i' };

  // Find matching patients and doctors by name
  const [matchingPatients, matchingDoctors] = await Promise.all([
    conn.model('Patient').find({ name: nameRegex, deletedAt: null }).select('_id').limit(20).lean(),
    conn.model('User').find({ name: nameRegex, role: 'doctor', deletedAt: null }).select('_id').limit(20).lean(),
  ]);

  const patientIds = matchingPatients.map((p) => p._id);
  const doctorIds = matchingDoctors.map((d) => d._id);

  // Also check if the search term matches reason
  const orConditions = [
    { reason: nameRegex },
  ];
  if (patientIds.length > 0) orConditions.push({ patient: { $in: patientIds } });
  if (doctorIds.length > 0) orConditions.push({ doctor: { $in: doctorIds } });

  const filter = {
    deletedAt: null,
    $or: orConditions,
    ...(scopeFilter || {}),
  };

  let query = conn.model('Appointment').find(filter)
    .select(config.select)
    .sort({ scheduledAt: -1 })
    .limit(limit)
    .lean();

  if (config.populate) {
    for (const p of config.populate) {
      query = query.populate(p);
    }
  }

  const items = await query;
  return {
    category: 'appointments',
    label: config.label,
    icon: config.icon,
    items: items.map((item) => ({
      _id: item._id.toString(),
      name: config.displayName ? config.displayName(item) : (item.name || ''),
      subtitle: config.subtitle(item),
      url: config.urlTemplate,
    })),
  };
}

// ── Main search functions ────────────────────────────────────

/**
 * Tenant global search — searches across all permitted categories.
 */
async function tenantSearch(searchTerm, user, tenantSlug, requestedCategories, limit = 5) {
  const conn = await getTenantConnection(tenantSlug);
  const userPerms = await resolvePerms(user.role, tenantSlug);

  const categoriesToSearch = requestedCategories
    ? requestedCategories.split(',').filter((c) => TENANT_CATEGORIES[c])
    : Object.keys(TENANT_CATEGORIES);

  const tasks = categoriesToSearch.map(async (key) => {
    const config = TENANT_CATEGORIES[key];

    // Permission check — skip silently if user lacks access
    const hasAccess = config.permAny.some((p) => userPerms.includes(p));
    if (!hasAccess) return null;

    // Self-scope: if user only has *_OWN permission, restrict to their own data
    const scopeFilter = {};
    if (config.fullPerm && !userPerms.includes(config.fullPerm)) {
      if (key === 'patients') scopeFilter.user = user.userId;
      else if (key === 'appointments') scopeFilter.doctor = user.userId;
      else if (key === 'invoices' || key === 'prescriptions') scopeFilter.doctor = user.userId;
    }

    // Appointments use custom two-step search
    if (config.customSearch) {
      return searchAppointments(conn, config, searchTerm, limit, scopeFilter);
    }

    return searchCategoryOnConn(conn, key, config, searchTerm, limit, scopeFilter);
  });

  const results = await Promise.allSettled(tasks);
  const output = [];
  let totalResults = 0;

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value && r.value.items.length > 0) {
      output.push(r.value);
      totalResults += r.value.items.length;
    } else if (r.status === 'rejected') {
      logger.warn('Global search category failed', { error: r.reason?.message });
    }
  }

  return { results: output, query: searchTerm, totalResults };
}

/**
 * Patient portal global search — searches patient's own data only.
 */
async function patientSearch(searchTerm, user, tenantSlug, patientId, requestedCategories, limit = 5) {
  const conn = await getTenantConnection(tenantSlug);

  // Resolve the patient document to get its _id
  const Patient = conn.model('Patient');
  const patient = await Patient.findOne({ user: patientId || user.userId, deletedAt: null }).select('_id').lean();
  if (!patient) {
    return { results: [], query: searchTerm, totalResults: 0 };
  }

  const categoriesToSearch = requestedCategories
    ? requestedCategories.split(',').filter((c) => PATIENT_CATEGORIES[c])
    : Object.keys(PATIENT_CATEGORIES);

  const tasks = categoriesToSearch.map(async (key) => {
    const config = PATIENT_CATEGORIES[key];
    const scopeFilter = { patient: patient._id };

    return searchCategoryOnConn(conn, key, config, searchTerm, limit, scopeFilter);
  });

  const results = await Promise.allSettled(tasks);
  const output = [];
  let totalResults = 0;

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value && r.value.items.length > 0) {
      output.push(r.value);
      totalResults += r.value.items.length;
    } else if (r.status === 'rejected') {
      logger.warn('Patient global search category failed', { error: r.reason?.message });
    }
  }

  return { results: output, query: searchTerm, totalResults };
}

/**
 * Platform global search — searches platform-level data.
 */
async function platformSearch(searchTerm, requestedCategories, limit = 5) {
  // Platform models are on the default Mongoose connection
  const mongoose = require('mongoose');

  const categoriesToSearch = requestedCategories
    ? requestedCategories.split(',').filter((c) => PLATFORM_CATEGORIES[c])
    : Object.keys(PLATFORM_CATEGORIES);

  const tasks = categoriesToSearch.map(async (key) => {
    const config = PLATFORM_CATEGORIES[key];
    const Model = mongoose.model(config.model);
    const escaped = escapeRegex(searchTerm);

    const filter = {
      deletedAt: null,
      $or: config.fields.map((field) => ({
        [field]: { $regex: escaped, $options: 'i' },
      })),
    };

    const items = await Model.find(filter).select(config.select).limit(limit).lean();

    return {
      category: key,
      label: config.label,
      icon: config.icon,
      items: items.map((item) => ({
        _id: item._id.toString(),
        name: config.displayName ? config.displayName(item) : (item.name || ''),
        subtitle: config.subtitle(item),
        url: key === 'tenants' ? `${config.urlTemplate}/${item.slug}` : config.urlTemplate,
      })),
    };
  });

  const results = await Promise.allSettled(tasks);
  const output = [];
  let totalResults = 0;

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value && r.value.items.length > 0) {
      output.push(r.value);
      totalResults += r.value.items.length;
    } else if (r.status === 'rejected') {
      logger.warn('Platform global search category failed', { error: r.reason?.message });
    }
  }

  return { results: output, query: searchTerm, totalResults };
}

module.exports = { tenantSearch, patientSearch, platformSearch };
