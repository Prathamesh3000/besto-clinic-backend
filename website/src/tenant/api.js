/**
 * Tenant API client — all calls to /api/v1 tenant-scoped endpoints.
 * Every request includes X-Tenant-ID header for tenant isolation.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'https://bestoclinic.com/api/v1';

function getSlug() {
  return localStorage.getItem('tenant_slug') || '';
}

async function request(path, options = {}) {
  const token = localStorage.getItem('tenant_token');
  const slug = options.tenantSlug || getSlug();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(slug ? { 'x-tenant-id': slug } : {}),
      ...options.headers,
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem('tenant_token');
    localStorage.removeItem('tenant_user');
    localStorage.removeItem('tenant_slug');
    window.location.href = '/clinic/login';
    throw new Error('Session expired');
  }

  // Get response text first, then parse as JSON
  const text = await res.text();
  let data;
  if (!text) {
    // Legitimately empty body — 204 No Content, 304 Not Modified, or a HEAD-like
    // reply. JSON.parse('') throws, which previously surfaced as the misleading
    // "Invalid server response" banner on pages whose data had actually loaded.
    data = {};
  } else {
    try {
      data = JSON.parse(text);
    } catch {
      // A non-JSON body here is usually an upstream proxy/gateway error page
      // rather than anything the API produced.
      console.error(`Non-JSON response from ${path} (HTTP ${res.status}):`, text.slice(0, 300));
      throw new Error(
        res.ok
          ? 'Invalid server response. Please try again or contact support.'
          : `Server error (${res.status}). Please try again or contact support.`,
      );
    }
  }

  // Handle subscription-blocked (403) — suspended/cancelled tenants
  if (res.status === 403 && data.data?.code === 'SUBSCRIPTION_BLOCKED') {
    const err = new Error(data.message || 'Subscription is inactive');
    err.code = 'SUBSCRIPTION_BLOCKED';
    err.subscriptionStatus = data.data.subscriptionStatus;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(data.message || 'Request failed');
    if (data.errors) err.errors = data.errors;
    throw err;
  }
  return data;
}

/**
 * Download a binary file (PDF, etc.) from a tenant-scoped endpoint.
 * Returns a Blob and triggers a browser download.
 */
async function downloadFile(path, filename) {
  const token = localStorage.getItem('tenant_token');
  const slug = getSlug();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(slug ? { 'x-tenant-id': slug } : {}),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('tenant_token');
    localStorage.removeItem('tenant_user');
    localStorage.removeItem('tenant_slug');
    window.location.href = '/clinic/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    // Try to parse error message from JSON body
    let message = 'Download failed';
    try {
      const errData = await res.json();
      message = errData.message || message;
    } catch { /* binary error body — use default message */ }
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function qs(params) {
  const filtered = Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null));
  const s = new URLSearchParams(filtered).toString();
  return s ? `?${s}` : '';
}

// ─── Auth ──────────────────────────────────────
// Login uses /public/login with clinicCode (slug-free).
// Direct fetch to avoid the 401 intercept in request()
// (a login 401 = invalid credentials, NOT session expiry)
export const tenantLogin = async (email, password, clinicCode) => {
  const res = await fetch(`${API_BASE}/public/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinicCode, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Invalid credentials or clinic not found');
  return data;
};

/** Look up which clinic(s) an email belongs to — email-first login flow */
export const lookupEmail = async (email) => {
  const res = await fetch(`${API_BASE}/public/lookup-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.toLowerCase().trim() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Email lookup failed');
  return data;
};

/** Login using clinicId (resolved from email lookup) — slug resolved server-side */
export const tenantLoginByClinicId = async (email, password, clinicId) => {
  const res = await fetch(`${API_BASE}/public/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinicId, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Invalid credentials or clinic not found');
  return data;
};

/** Register a new patient (for doctor discovery funnel — patient self-registration) */
export const tenantRegister = async (data, tenantSlug) => {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(tenantSlug ? { 'x-tenant-id': tenantSlug } : {}),
    },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Registration failed');
  return json;
};

/** Resolve a clinic code to clinic details (standalone registration flow) */
export const resolveClinicCode = async (code) => {
  const res = await fetch(`${API_BASE}/public/resolve-clinic-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.toUpperCase().trim() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Could not resolve clinic code');
  return data;
};

/** Register a new patient using clinicId (slug resolved server-side, auto-login) */
export const publicRegister = async (payload) => {
  const res = await fetch(`${API_BASE}/public/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Registration failed');
  return data;
};

/** Platform-aware register: creates PlatformPatient + tenant records in one step */
export const platformRegister = async (payload) => {
  const res = await fetch(`${API_BASE}/public/platform-register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || 'Registration failed');
    err.code = data.data?.code || null;
    throw err;
  }
  return data;
};

/** Connect existing platform patient to a new clinic (password verification) */
export const connectToClinic = async (payload) => {
  const res = await fetch(`${API_BASE}/public/connect-to-clinic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Connection failed');
  return data;
};

/** Toggle a doctor's featured status on the platform directory */
export const featureDoctor = (id, featured) =>
  request(`/doctors/${id}/feature`, { method: 'PUT', body: { featured } });

// ─── Dashboard ─────────────────────────────────
export const getDashboard = () => request('/dashboard');

// ─── Subscription ─────────────────────────────
export const getSubscription = () => request('/subscriptions');

// ─── Branches ──────────────────────────────────
export const listBranches = (params) => request(`/branches${qs(params)}`);
export const getBranch = (id) => request(`/branches/${id}`);
export const createBranch = (data) => request('/branches', { method: 'POST', body: data });
export const updateBranch = (id, data) => request(`/branches/${id}`, { method: 'PUT', body: data });
export const deleteBranch = (id) => request(`/branches/${id}`, { method: 'DELETE' });
export const bulkImportBranches = (rows) => request('/branches/bulk', { method: 'POST', body: { rows } });

// ─── Departments ───────────────────────────────
export const listDepartments = (params) => request(`/departments${qs(params)}`);
export const getDepartment = (id) => request(`/departments/${id}`);
export const createDepartment = (data) => request('/departments', { method: 'POST', body: data });
export const updateDepartment = (id, data) => request(`/departments/${id}`, { method: 'PUT', body: data });
export const deleteDepartment = (id) => request(`/departments/${id}`, { method: 'DELETE' });
export const bulkImportDepartments = (rows) => request('/departments/bulk', { method: 'POST', body: { rows } });

// ─── Doctors ───────────────────────────────────
export const listDoctors = (params) => request(`/doctors${qs(params)}`);
export const getDoctor = (id) => request(`/doctors/${id}`);
export const createDoctor = (data) => request('/doctors', { method: 'POST', body: data });
export const updateDoctor = (id, data) => request(`/doctors/${id}`, { method: 'PUT', body: data });
export const deleteDoctor = (id) => request(`/doctors/${id}`, { method: 'DELETE' });
export const bulkImportDoctors = (rows) => request('/doctors/bulk', { method: 'POST', body: { rows } });

// ─── Staff ─────────────────────────────────────
export const listStaff = (params) => request(`/staff${qs(params)}`);
export const getStaffMember = (id) => request(`/staff/${id}`);
export const createStaffMember = (data) => request('/staff', { method: 'POST', body: data });
export const updateStaffMember = (id, data) => request(`/staff/${id}`, { method: 'PUT', body: data });
export const deleteStaffMember = (id) => request(`/staff/${id}`, { method: 'DELETE' });
export const changeStaffRole = (id, role) => request(`/staff/${id}/role`, { method: 'PUT', body: { role } });
export const bulkImportStaff = (rows) => request('/staff/bulk', { method: 'POST', body: { rows } });

// ─── Patients ──────────────────────────────────
export const listPatients = (params) => request(`/patients${qs(params)}`);
export const getPatient = (id) => request(`/patients/${id}`);
export const createPatient = (data) => request('/patients', { method: 'POST', body: data });
export const updatePatient = (id, data) => request(`/patients/${id}`, { method: 'PUT', body: data });
export const deletePatient = (id) => request(`/patients/${id}`, { method: 'DELETE' });
export const bulkImportPatients = (rows) => request('/patients/bulk', { method: 'POST', body: { rows } });

// ─── Appointments ──────────────────────────────
export const listAppointments = (params) => request(`/appointments${qs(params)}`);
export const getAppointment = (id) => request(`/appointments/${id}`);
export const createAppointment = (data) => request('/appointments', { method: 'POST', body: data });
export const updateAppointment = (id, data) => request(`/appointments/${id}`, { method: 'PUT', body: data });
export const cancelAppointment = (id) => request(`/appointments/${id}`, { method: 'DELETE' });
export const getDoctorAvailability = (doctorId, date, branch) => request(`/appointments/availability/${doctorId}?date=${date}${branch ? `&branch=${branch}` : ''}`);

// ─── Invoices ──────────────────────────────────
export const listInvoices = (params) => request(`/invoices${qs(params)}`);
export const getInvoice = (id) => request(`/invoices/${id}`);
export const createInvoice = (data) => request('/invoices', { method: 'POST', body: data });
export const updateInvoice = (id, data) => request(`/invoices/${id}`, { method: 'PUT', body: data });
// Void = soft-delete + cascade-fail pending payments (backend: DELETE /invoices/:id)
export const voidInvoice = (id) => request(`/invoices/${id}`, { method: 'DELETE' });

// ─── Prescriptions ─────────────────────────────
export const listPrescriptions = (params) => request(`/prescriptions${qs(params)}`);
export const getPrescription = (id) => request(`/prescriptions/${id}`);
export const createPrescription = (data) => request('/prescriptions', { method: 'POST', body: data });
export const updatePrescription = (id, data) => request(`/prescriptions/${id}`, { method: 'PUT', body: data });

// ─── Queue ─────────────────────────────────────
export const listQueue = (params) => request(`/queue${qs(params)}`);
export const getCurrentQueue = (params) => request(`/queue/current${qs(params)}`);
export const addToQueue = (data) => request('/queue', { method: 'POST', body: data });
export const callQueuePatient = (id, roomId) => request(`/queue/${id}/call`, { method: 'PUT', ...(roomId ? { body: { roomId } } : {}) });
export const completeQueueEntry = (id) => request(`/queue/${id}/complete`, { method: 'PUT' });
export const cancelQueueEntry = (id, data) => request(`/queue/${id}/cancel`, { method: 'PUT', body: data });
export const changeQueuePriority = (id, priority) => request(`/queue/${id}/priority`, { method: 'PUT', body: { priority } });
export const moveQueueEntry = (id, direction) => request(`/queue/${id}/move`, { method: 'PUT', body: { direction } });
export const swapQueueEntries = (entryA, entryB) => request('/queue/swap', { method: 'PUT', body: { entryA, entryB } });

// ─── Insurance ─────────────────────────────────
export const listInsuranceProviders = (params) => request(`/insurance/providers${qs(params)}`);
export const listInsuranceClaims = (params) => request(`/insurance/claims${qs(params)}`);
export const createInsuranceClaim = (data) => request('/insurance/claims', { method: 'POST', body: data });
export const updateInsuranceClaim = (id, data) => request(`/insurance/claims/${id}/status`, { method: 'PUT', body: data });

// ─── Payroll ───────────────────────────────────
export const listSalaryStructures = (params) => request(`/payroll/salary-structures${qs(params)}`);
export const getSalaryStructure = (id) => request(`/payroll/salary-structures/${id}`);
export const createSalaryStructure = (data) => request('/payroll/salary-structures', { method: 'POST', body: data });
export const updateSalaryStructure = (id, data) => request(`/payroll/salary-structures/${id}`, { method: 'PUT', body: data });
export const listPayslips = (params) => request(`/payroll/payslips${qs(params)}`);
export const generatePayslips = (data) => request('/payroll/payslips/generate', { method: 'POST', body: data });
export const approvePayslip = (id) => request(`/payroll/payslips/${id}/approve`, { method: 'PUT' });
export const markPayslipPaid = (id, data) => request(`/payroll/payslips/${id}/pay`, { method: 'PUT', body: data });

// ─── Notifications ─────────────────────────────
export const listNotifications = (params) => request(`/notifications${qs(params)}`);
export const getUnreadCount = () => request('/notifications/unread-count');
export const markNotificationRead = (id) => request(`/notifications/${id}/read`, { method: 'PUT' });
export const markAllNotificationsRead = () => request('/notifications/read-all', { method: 'PUT' });



// ─── Roles (Role Master) ──────────────────────────
export const listRoles    = (params) => request(`/roles${qs(params)}`);
export const getRole      = (slug)   => request(`/roles/${slug}`);
export const createRole   = (data)   => request('/roles', { method: 'POST', body: data });
export const updateRole   = (slug, data) => request(`/roles/${slug}`, { method: 'PUT', body: data });
export const deleteRole   = (slug)   => request(`/roles/${slug}`, { method: 'DELETE' });

// ─── Consent ───────────────────────────────────
export const listConsents = (params) => request(`/consents${qs(params)}`);
export const createConsent = (data) => request('/consents', { method: 'POST', body: data });
export const revokeConsent = (id) => request(`/consents/${id}/revoke`, { method: 'PUT' });

// ─── Emergency ─────────────────────────────────
export const listEmergencySessions = (params) => request(`/emergency${qs(params)}`);
export const createEmergencySession = (data) => request('/emergency', { method: 'POST', body: data });
export const acceptEmergencySession = (id) => request(`/emergency/${id}/accept`, { method: 'PUT' });
export const declineEmergencySession = (id, data) => request(`/emergency/${id}/decline`, { method: 'PUT', body: data || {} });
export const endEmergencySession = (id, data) => request(`/emergency/${id}/end`, { method: 'PUT', body: data });

// ─── Legacy Upload ─────────────────────────────
export const listUploads = (params) => request(`/legacy-uploads${qs(params)}`);
export const createUpload = (data) => request('/legacy-uploads', { method: 'POST', body: data });

// ─── Clinic Settings ───────────────────────────
export const getClinicSettings = () => request('/clinic');
export const updateClinicSettings = (data) => request('/clinic', { method: 'PUT', body: data });
export const uploadClinicLogo = (imageData, mimeType) => request('/clinic/logo', { method: 'POST', body: { imageData, mimeType } });

// ─── Booking Policy ─────────────────────────────
export const getBookingPolicy = () => request('/booking-policy');
export const getRawBookingPolicy = () => request('/booking-policy/raw');
export const updateBookingPolicy = (data) => request('/booking-policy', { method: 'PUT', body: data });

// ── Doctor Dashboard ──────────────────────────
export const getDoctorStats = () => request('/doctor/stats');
export const listDoctorConsultations = (params) => request(`/doctor/consultations${qs(params)}`);
export const getConsultationByAppointment = (appointmentId) => request(`/doctor/consultations/by-appointment/${appointmentId}`);
export const startConsultation = (data) => request('/doctor/consultations', { method: 'POST', body: data });
export const updateConsultation = (id, data) => request(`/doctor/consultations/${id}`, { method: 'PUT', body: data });
export const completeConsultation = (id, data) => request(`/doctor/consultations/${id}/complete`, { method: 'PUT', body: data });
export const uploadDoctorAttachment = (data) => request('/doctor/attachments', { method: 'POST', body: data });
export const listDoctorAttachments = (treatmentId) => request(`/doctor/attachments/${treatmentId}`);
export const createFollowUp = (data) => request('/doctor/follow-ups', { method: 'POST', body: data });
export const listDoctorPatients = (params) => request(`/doctor/patients${qs(params)}`);
export const getDoctorProfile = () => request('/doctor/profile');
export const updateDoctorProfile = (data) => request('/doctor/profile', { method: 'PUT', body: data });
export const updateReminderSettings = (data) => request('/auth/reminder-settings', { method: 'PUT', body: data });
export const getDoctorCurrentRoom = () => request('/doctor/current-room');
export const getDoctorComplianceSummary = () => request('/doctor/compliance-summary');
export const getPatientCompliance = (patientId) => request(`/doctor/patients/${patientId}/compliance`);
export const togglePatientTaskReminder = (patientId, taskId) => request(`/doctor/patients/${patientId}/care-tasks/${taskId}/toggle`, { method: 'PUT' });
export const enablePatientReminders = (patientId, prescriptionId) => request(`/doctor/patients/${patientId}/prescriptions/${prescriptionId}/enable-reminders`, { method: 'POST' });
export const disablePatientReminders = (patientId, prescriptionId) => request(`/doctor/patients/${patientId}/prescriptions/${prescriptionId}/disable-reminders`, { method: 'DELETE' });
export const getDoctorCareTasks = (params) => request(`/doctor/care-tasks${qs(params)}`);
export const sendPatientCareSummary = (patientId) => request(`/doctor/patients/${patientId}/care-summary`, { method: 'POST' });

// ── Consultation Templates ─────────────────────
export const listConsultationTemplates = (params) => request(`/doctor/templates${qs(params)}`);
export const getConsultationTemplate = (id) => request(`/doctor/templates/${id}`);
export const createConsultationTemplate = (data) => request('/doctor/templates', { method: 'POST', body: data });
export const updateConsultationTemplate = (id, data) => request(`/doctor/templates/${id}`, { method: 'PUT', body: data });
export const deleteConsultationTemplate = (id) => request(`/doctor/templates/${id}`, { method: 'DELETE' });

// ─── Payments ─────────────────────────────────
export const listPayments = (params) => request(`/payments${qs(params)}`);
export const getPayment = (id) => request(`/payments/${id}`);
export const createPayment = (data) => request('/payments', { method: 'POST', body: data });
export const createGatewayOrder = (data) => request('/payments/gateway/order', { method: 'POST', body: data });
export const verifyGatewayPayment = (data) => request('/payments/gateway/verify', { method: 'POST', body: data });
export const refundPayment = (id, data) => request(`/payments/${id}/refund`, { method: 'POST', body: data });
export const getInvoicePayments = (invoiceId) => request(`/payments/invoice/${invoiceId}`);

// ─── Billing ──────────────────────────────────
export const createEnhancedInvoice = (data) => request('/billing/invoice', { method: 'POST', body: data });
export const recordPaymentForInvoice = (invoiceId, data) => request(`/billing/invoice/${invoiceId}/payment`, { method: 'POST', body: data });
export const listServiceItems = (params) => request(`/billing/service-items${qs(params)}`);
export const createServiceItem = (data) => request('/billing/service-items', { method: 'POST', body: data });
export const updateServiceItem = (id, data) => request(`/billing/service-items/${id}`, { method: 'PUT', body: data });
export const getRevenueAnalytics = (params) => request(`/billing/analytics/revenue${qs(params)}`);
export const getOutstandingReport = (params) => request(`/billing/analytics/outstanding${qs(params)}`);
export const getDoctorRevenue = (params) => request(`/billing/analytics/doctor-revenue${qs(params)}`);
export const getPatientLedger = (patientId, params) => request(`/billing/ledger/${patientId}${qs(params)}`);
export const recordAdvancePayment = (data) => request('/billing/ledger/advance', { method: 'POST', body: data });
export const adjustLedger = (data) => request('/billing/ledger/adjustment', { method: 'POST', body: data });
export const getDayEndReport = (params) => request(`/billing/reports/day-end${qs(params)}`);
export const getGstSummaryReport = (params) => request(`/billing/reports/gst-summary${qs(params)}`);
export const getCollectionMetrics = (params) => request(`/billing/reports/collection-metrics${qs(params)}`);
export const getFinancialAuditTrail = (params) => request(`/billing/audit-trail${qs(params)}`);
export const writeOffInvoice = (data) => request('/billing/write-off', { method: 'POST', body: data });
export const downloadPaymentReceipt = (id) => downloadFile(`/payments/${id}/receipt`, `receipt-${id}.pdf`);

// ─── Cash Register ────────────────────────────
export const openCashRegister = (data) => request('/cash-register/open', { method: 'POST', body: data });
export const closeCashRegister = (id, data) => request(`/cash-register/${id}/close`, { method: 'PUT', body: data });
export const reconcileCashRegister = (id, data) => request(`/cash-register/${id}/reconcile`, { method: 'PUT', body: data });
export const getCurrentCashRegister = (params) => request(`/cash-register/current${qs(params)}`);
export const listCashRegisters = (params) => request(`/cash-register${qs(params)}`);
export const getCashRegisterDetails = (id) => request(`/cash-register/${id}`);
export const getCashRegisterTransactions = (id) => request(`/cash-register/${id}/transactions`);

// ─── Credit Notes ─────────────────────────────
export const listCreditNotes = (params) => request(`/credit-notes${qs(params)}`);
export const getCreditNote = (id) => request(`/credit-notes/${id}`);
export const createCreditNote = (data) => request('/credit-notes', { method: 'POST', body: data });
export const issueCreditNote = (id) => request(`/credit-notes/${id}/issue`, { method: 'PUT' });
export const applyCreditNote = (id, data) => request(`/credit-notes/${id}/apply`, { method: 'PUT', body: data });
export const getPatientCreditNotes = (patientId) => request(`/credit-notes/patient/${patientId}`);

// ─── Invoice PDF ──────────────────────────────
export const downloadInvoicePdf = (id) => downloadFile(`/invoices/${id}/pdf`, `invoice-${id}.pdf`);

// ─── Insurance (enhanced) ─────────────────────
export const recordPreAuth = (claimId, data) => request(`/insurance/claims/${claimId}/pre-auth`, { method: 'PUT', body: data });
export const calculateCoPay = (claimId) => request(`/insurance/claims/${claimId}/co-pay`);
export const reconcileInsuranceClaim = (claimId, data) => request(`/insurance/claims/${claimId}/reconcile`, { method: 'PUT', body: data });

// ─── Telemedicine ────────────────────────────
export const listVideoSessions = (params) => request(`/telemedicine${qs(params)}`);
export const getVideoSession = (id) => request(`/telemedicine/${id}`);
export const createVideoSession = (data) => request('/telemedicine', { method: 'POST', body: data });
export const acceptVideoSession = (id) => request(`/telemedicine/${id}/accept`, { method: 'PUT' });
export const joinVideoSession = (id) => request(`/telemedicine/${id}/join`, { method: 'POST' });
export const endVideoSession = (id, data) => request(`/telemedicine/${id}/end`, { method: 'PUT', body: data });
export const cancelVideoSession = (id, data) => request(`/telemedicine/${id}/cancel`, { method: 'PUT', body: data });
export const declineVideoSession = (id, data) => request(`/telemedicine/${id}/decline`, { method: 'PUT', body: data });
export const updateVideoConsent = (id, data) => request(`/telemedicine/${id}/consent`, { method: 'PUT', body: data });
export const sendVideoMessage = (id, data) => request(`/telemedicine/${id}/messages`, { method: 'POST', body: data });
export const getVideoMessages = (id, params) => request(`/telemedicine/${id}/messages${qs(params)}`);
export const markVideoMessageRead = (id, messageId) => request(`/telemedicine/${id}/messages/${messageId}/read`, { method: 'POST' });
export const shareVideoFile = (id, data) => request(`/telemedicine/${id}/files`, { method: 'POST', body: data });
export const logVideoEvent = (id, data) => request(`/telemedicine/${id}/events`, { method: 'POST', body: data });
export const extendVideoSession = (id) => request(`/telemedicine/${id}/extend`, { method: 'PUT' });

// ─── Presence ────────────────────────────────
// Doctor toggles presence status; receptionists/doctors fetch the full map.
// status must be one of: 'online' | 'busy' | 'dnd' | 'offline'
export const setPresence = (status) => request('/telemedicine/presence', { method: 'POST', body: { status } });
export const getPresenceSnapshot = () => request('/telemedicine/presence');

// ─── Inventory ───────────────────────────────
export const listInventory = (params) => request(`/inventory${qs(params)}`);
export const getInventoryItem = (id) => request(`/inventory/${id}`);
export const createInventoryItem = (data) => request('/inventory', { method: 'POST', body: data });
export const updateInventoryItem = (id, data) => request(`/inventory/${id}`, { method: 'PUT', body: data });
export const deleteInventoryItem = (id) => request(`/inventory/${id}`, { method: 'DELETE' });
export const restockInventoryItem = (id, data) => request(`/inventory/${id}/restock`, { method: 'PUT', body: data });
export const getLowStockItems = (params) => request(`/inventory/low-stock${qs(params)}`);
export const getExpiringItems = (params) => request(`/inventory/expiring${qs(params)}`);
export const getInventoryReports = (params) => request(`/inventory/reports${qs(params)}`);
export const bulkImportInventory = (rows) => request('/inventory/bulk', { method: 'POST', body: { rows } });

// ─── Analytics Dashboard ──────────────────────
export const getAnalyticsSummary = (params) => request(`/analytics/summary${qs(params)}`);
export const getRevenueTrends = (params) => request(`/analytics/revenue${qs(params)}`);
export const getAppointmentTrends = (params) => request(`/analytics/appointments${qs(params)}`);
export const getDoctorPerformance = (params) => request(`/analytics/doctors${qs(params)}`);
export const getNoShowAnalysis = (params) => request(`/analytics/no-shows${qs(params)}`);
export const getInsuranceClaimTrends = (params) => request(`/analytics/insurance${qs(params)}`);
export const getTelemedicineUsage = (params) => request(`/analytics/telemedicine${qs(params)}`);
export const getPatientGrowth = (params) => request(`/analytics/patients${qs(params)}`);
export const getIntegrationUsage = (params) => request(`/analytics/integrations${qs(params)}`);


// ─── Compliance Analytics ─────────────────────
export const getComplianceOverview = (params) => request(`/analytics/compliance-overview${qs(params)}`);
export const getComplianceAlerts = (params) => request(`/analytics/compliance-alerts${qs(params)}`);
export const getComplianceTrends = (params) => request(`/analytics/compliance-trends${qs(params)}`);
export const resolveComplianceAlert = (id, data) => request(`/analytics/compliance-alerts/${id}/resolve`, { method: 'PUT', body: data });

// ─── Doctor Schedules & Leaves ────────────────────────
export const getDoctorSchedule = (doctorId) => request(`/doctors/${doctorId}/schedule`);
export const updateDoctorSchedule = (doctorId, data) => request(`/doctors/${doctorId}/schedule`, { method: 'PUT', body: data });
export const getDoctorLeaves = (doctorId, params) => request(`/doctors/${doctorId}/leaves${qs(params)}`);
export const createDoctorLeave = (doctorId, data) => request(`/doctors/${doctorId}/leaves`, { method: 'POST', body: data });
export const deleteDoctorLeave = (doctorId, leaveId) => request(`/doctors/${doctorId}/leaves/${leaveId}`, { method: 'DELETE' });
export const getAllDoctorSchedules = (params) => request(`/doctors/schedules/all${qs(params)}`);
export const getAllDoctorLeaves = (params) => request(`/doctors/leaves/all${qs(params)}`);
export const getDoctorOverrides = (doctorId, params) => request(`/doctors/${doctorId}/overrides${qs(params)}`);
export const createDoctorOverride = (doctorId, data) => request(`/doctors/${doctorId}/overrides`, { method: 'POST', body: data });
export const updateDoctorOverride = (doctorId, overrideId, data) => request(`/doctors/${doctorId}/overrides/${overrideId}`, { method: 'PUT', body: data });
export const deleteDoctorOverride = (doctorId, overrideId) => request(`/doctors/${doctorId}/overrides/${overrideId}`, { method: 'DELETE' });
export const approveDoctorLeave = (doctorId, leaveId) => request(`/doctors/${doctorId}/leaves/${leaveId}/approve`, { method: 'PUT' });
export const rejectDoctorLeave = (doctorId, leaveId) => request(`/doctors/${doctorId}/leaves/${leaveId}/reject`, { method: 'PUT' });

// ─── Schedule Conflict Resolution ────────────────────────
export const detectScheduleConflicts = (data) => request('/doctors/schedule/conflicts/detect', { method: 'POST', body: data });
export const detectLeaveConflicts = (data) => request('/doctors/schedule/conflicts/detect-leave', { method: 'POST', body: data });
export const getNextAvailableSlots = (params) => request(`/doctors/schedule/conflicts/next-slots${qs(params)}`);
export const adminRescheduleAppointment = (appointmentId, data) => request(`/appointments/${appointmentId}/admin-reschedule`, { method: 'POST', body: data });
export const cancelAppointmentWithRefund = (appointmentId, data) => request(`/appointments/${appointmentId}/cancel-refund`, { method: 'POST', body: data });
export const cancelAppointmentWithCredit = (appointmentId, data) => request(`/appointments/${appointmentId}/cancel-credit`, { method: 'POST', body: data });
export const cancelUnpaidAppointment = (appointmentId, data) => request(`/appointments/${appointmentId}/cancel-unpaid`, { method: 'POST', body: data });
export const markAppointmentContacted = (appointmentId, data) => request(`/appointments/${appointmentId}/mark-contacted`, { method: 'POST', body: data });
export const bulkCancelRefundAppointments = (data) => request('/appointments/bulk-cancel-refund', { method: 'POST', body: data });

// ─── Availability (Admin) ────────────────────────────────
export const getDoctorAvailabilitySummary = (doctorId, month, year, branch) => request(`/appointments/availability/${doctorId}/summary?month=${month}&year=${year}${branch ? `&branch=${branch}` : ''}`);
export const getDoctorsAvailabilityOverview = (params) => request(`/appointments/availability-overview${qs(params)}`);

// ─── Doctor Self-Service Schedule ─────────────────────
export const getOwnSchedule = () => request('/doctor/schedule');
export const getOwnLeaves = (params) => request(`/doctor/leaves${qs(params)}`);
export const requestOwnLeave = (data) => request('/doctor/leaves', { method: 'POST', body: data });
/** Cancel one's own leave request. Self-service — no admin permission needed,
 *  unlike deleteDoctorLeave() which targets /doctors/:id/leaves/:leaveId. */
export const deleteOwnLeave = (leaveId) => request(`/doctor/leaves/${leaveId}`, { method: 'DELETE' });
export const getOwnOverrides = (params) => request(`/doctor/overrides${qs(params)}`);
export const createOwnOverride = (data) => request('/doctor/overrides', { method: 'POST', body: data });
export const deleteOwnOverride = (overrideId) => request(`/doctor/overrides/${overrideId}`, { method: 'DELETE' });
export const getOwnHolidays = (params) => request(`/doctor/holidays${qs(params)}`);

// ─── Calendar Feeds (ICS) ──────────────────────────────
export const generateCalendarFeed = (data) => request('/calendar-feeds/my-feed', { method: 'POST', body: data });
export const listCalendarFeeds = () => request('/calendar-feeds/my-feeds');
export const updateCalendarFeed = (feedId, data) => request(`/calendar-feeds/${feedId}`, { method: 'PUT', body: data });
export const revokeCalendarFeed = (feedId) => request(`/calendar-feeds/${feedId}`, { method: 'DELETE' });
export const regenerateCalendarFeed = (feedId) => request(`/calendar-feeds/${feedId}/regenerate`, { method: 'POST' });

// ─── Branch Overview & Monitor ──────────────────────────
export const getBranchOverview = (params) => request(`/branches/overview${qs(params)}`);
export const getDoctorPresence = (params) => request(`/branches/monitor/presence${qs(params)}`);
export const getWaitingPatients = (params) => request(`/branches/monitor/waiting${qs(params)}`);
export const getBranchCapacity = () => request('/branches/monitor/capacity');
export const getActivityFeed = (params) => request(`/branches/monitor/activity${qs(params)}`);

// ─── Consultation Rooms ─────────────────────────────────
export const listRooms = (params) => request(`/branches/rooms${qs(params)}`);
export const createRoom = (data) => request('/branches/rooms', { method: 'POST', body: data });
export const updateRoomApi = (id, data) => request(`/branches/rooms/${id}`, { method: 'PUT', body: data });
export const assignRoomApi = (id, data) => request(`/branches/rooms/${id}/assign`, { method: 'PUT', body: data });
export const releaseRoomApi = (id) => request(`/branches/rooms/${id}/release`, { method: 'PUT' });
export const deleteRoomApi = (id) => request(`/branches/rooms/${id}`, { method: 'DELETE' });

// ─── Clinic Holidays ──────────────────────────────────────
export const listHolidays = (params) => request(`/holidays${qs(params)}`);
export const getHoliday = (id) => request(`/holidays/${id}`);
export const createHoliday = (data) => request('/holidays', { method: 'POST', body: data });
export const updateHoliday = (id, data) => request(`/holidays/${id}`, { method: 'PUT', body: data });
export const deleteHoliday = (id) => request(`/holidays/${id}`, { method: 'DELETE' });

// ─── Dependent Management (Guardian) ─────────────────────
export const listDependents = () => request('/portal/dependents');
export const createDependentApi = (data) => request('/portal/dependents', { method: 'POST', body: data });
export const updateDependentApi = (id, data) => request(`/portal/dependents/${id}`, { method: 'PUT', body: data });
export const detachDependentApi = (id, data) => request(`/portal/dependents/${id}/detach`, { method: 'POST', body: data });
export const removeDependentApi = (id) => request(`/portal/dependents/${id}`, { method: 'DELETE' });

// ─── Job Portal ─────────────────────────────────────────
export const listJobs = (params) => request(`/jobs${qs(params)}`);
export const getJob = (id) => request(`/jobs/${id}`);
export const getJobDashboard = () => request('/jobs/dashboard');
export const getJobDepartments = () => request('/jobs/departments');
export const createJob = (data) => request('/jobs', { method: 'POST', body: data });
export const updateJob = (id, data) => request(`/jobs/${id}`, { method: 'PUT', body: data });
export const publishJob = (id) => request(`/jobs/${id}/publish`, { method: 'POST' });
export const closeJob = (id, data) => request(`/jobs/${id}/close`, { method: 'POST', body: data });
export const deleteJob = (id) => request(`/jobs/${id}`, { method: 'DELETE' });
export const listJobApplications = (jobId, params) => request(`/jobs/${jobId}/applications${qs(params)}`);
/** Resumes are PII and sit outside the public static dirs, so they must be
 *  fetched with the auth token — a plain <a href> cannot send one. */
export const downloadApplicantResume = (applicationId, fileName) =>
  downloadFile(`/jobs/applications/${applicationId}/resume`, fileName || `resume-${applicationId}.pdf`);

// ─── Credits ─────────────────────────────────────────────
export const getCreditBalance = () => request('/credits/balance');
export const getCreditTransactions = (params) => request(`/credits/transactions${qs(params)}`);
export const getCreditPacks = () => request('/credits/packs');
export const purchaseCredits = (data) => request('/credits/purchase', { method: 'POST', body: data });
export const verifyCreditPurchase = (data) => request('/credits/purchase/verify', { method: 'POST', body: data });

// ─── Vendors ────────────────────────────────────────────────
export const listVendors      = (p) => request(`/purchase-orders/vendors${qs(p)}`);
export const getVendor        = (id) => request(`/purchase-orders/vendors/${id}`);
export const createVendor     = (d) => request('/purchase-orders/vendors', { method: 'POST', body: d });
export const updateVendor     = (id, d) => request(`/purchase-orders/vendors/${id}`, { method: 'PUT', body: d });
export const deleteVendor     = (id) => request(`/purchase-orders/vendors/${id}`, { method: 'DELETE' });

// ─── Purchase Orders ────────────────────────────────────────
export const listPurchaseOrders   = (p) => request(`/purchase-orders/orders${qs(p)}`);
export const getPurchaseOrder     = (id) => request(`/purchase-orders/orders/${id}`);
export const createPurchaseOrder  = (d) => request('/purchase-orders/orders', { method: 'POST', body: d });
export const updatePurchaseOrder  = (id, d) => request(`/purchase-orders/orders/${id}`, { method: 'PUT', body: d });
export const updatePOStatus       = (id, d) => request(`/purchase-orders/orders/${id}/status`, { method: 'PUT', body: d });
export const cancelPurchaseOrder  = (id) => request(`/purchase-orders/orders/${id}/cancel`, { method: 'PUT' });

// ─── Global Search ──────────────────────────────────────────
export const globalSearch = (q, signal) =>
  request(`/global-search/tenant?q=${encodeURIComponent(q)}&limit=5`, { signal });
