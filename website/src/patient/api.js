/**
 * Patient Portal API client — all calls to /api/v1/portal scoped endpoints.
 * Reuses the same tenant auth tokens (tenant_token, tenant_slug) since patients
 * login through the tenant auth system.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'https://bestoclinic.com/api/v1';

function getSlug() {
  return localStorage.getItem('tenant_slug') || '';
}

// Flag to suppress 401 hard-redirect during active video calls.
// Set by PatientVideoCall when entering INCALL phase, cleared on teardown.
let _suppressAuthRedirect = false;
export function setSuppressAuthRedirect(v) { _suppressAuthRedirect = !!v; }

function qs(params) {
  const filtered = Object.entries(params || {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  return filtered.length ? '?' + new URLSearchParams(filtered).toString() : '';
}

async function request(path, options = {}) {
  const token = localStorage.getItem('tenant_token');
  const slug = getSlug();
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
    if (_suppressAuthRedirect) {
      // During active video calls, don't hard-redirect — let the caller handle the error
      throw new Error('Session expired');
    }
    localStorage.removeItem('tenant_token');
    localStorage.removeItem('tenant_user');
    localStorage.removeItem('tenant_slug');
    window.location.href = '/patient/register';
    throw new Error('Session expired');
  }

  // res.json() throws on an empty body (204 No Content / 304 Not Modified),
  // which surfaces to the user as a bogus error on a request that succeeded.
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

// ─── Profiles ─────────────────────────────────────
export function getPatientProfiles() {
  return request('/portal/profiles');
}

export function getPatientProfile(patientId) {
  return request(`/portal/profiles/${patientId}`);
}

export function updatePatientProfile(patientId, data) {
  return request(`/portal/profiles/${patientId}`, { method: 'PUT', body: data });
}

// ─── Dashboard ────────────────────────────────────
export function getPortalDashboard(patientId) {
  return request(`/portal/dashboard/${patientId}`);
}

// ─── Appointments ─────────────────────────────────
export function listPatientAppointments(patientId, params) {
  return request(`/portal/appointments${qs({ ...params, patientId })}`);
}

export function bookAppointment(patientId, data) {
  return request('/portal/appointments', {
    method: 'POST',
    body: { ...data, patientId },
  });
}

export function cancelPatientAppointment(patientId, appointmentId, reason) {
  return request(
    `/portal/appointments/${appointmentId}/cancel${qs({ patientId })}`,
    { method: 'PUT', body: { reason } },
  );
}

export function rescheduleAppointment(patientId, appointmentId, scheduledAt) {
  return request(
    `/portal/appointments/${appointmentId}/reschedule${qs({ patientId })}`,
    { method: 'PUT', body: { scheduledAt } },
  );
}

export function confirmAttendance(patientId, appointmentId, status) {
  return request(
    `/portal/appointments/${appointmentId}/confirm-attendance${qs({ patientId })}`,
    { method: 'PUT', body: { status } },
  );
}

export function verifyAppointmentPayment(data) {
  return request('/portal/appointments/verify-payment', {
    method: 'POST',
    body: data,
  });
}

// ─── Emergency ────────────────────────────────────
export function createEmergencyRequest(patientId, data) {
  return request('/portal/emergency', {
    method: 'POST',
    body: { ...data, patientId },
  });
}

export function getEmergencySession(sessionId) {
  return request(`/emergency/${sessionId}`);
}

export function cancelEmergencySession(sessionId) {
  return request(`/emergency/${sessionId}/cancel`, { method: 'PUT' });
}

// ─── Prescriptions ────────────────────────────────
export function listPatientPrescriptions(patientId, params) {
  return request(`/portal/prescriptions${qs({ ...params, patientId })}`);
}

// ─── Medical History ──────────────────────────────
export function getMedicalHistory(patientId, params) {
  return request(`/portal/medical-history${qs({ ...params, patientId })}`);
}

// ─── Consultation Detail ─────────────────────────
export function getConsultationDetail(appointmentId, patientId) {
  return request(`/portal/consultations/${appointmentId}${qs({ patientId })}`);
}

// ─── Payments ─────────────────────────────────────
export function listPaymentHistory(patientId, params) {
  return request(`/portal/payments${qs({ ...params, patientId })}`);
}

export function initiatePayment(patientId, invoiceId, verificationData) {
  return request(`/portal/payments/${invoiceId}/pay${qs({ patientId })}`, {
    method: 'POST',
    ...(verificationData ? { body: verificationData } : {}),
  });
}

// ─── Share Records ────────────────────────────────
export function createShareToken(patientId, data) {
  return request('/portal/share', {
    method: 'POST',
    body: { ...data, patientId },
  });
}

export function listShareTokens(patientId) {
  return request(`/portal/share${qs({ patientId })}`);
}

export function revokeShareToken(patientId, tokenId) {
  return request(`/portal/share/${tokenId}${qs({ patientId })}`, {
    method: 'DELETE',
  });
}

// Public endpoint — no auth required
export function viewSharedRecord(token, tenant) {
  return fetch(`${API_BASE}/portal/share/view/${token}?tenant=${encodeURIComponent(tenant)}`, {
    headers: { 'Content-Type': 'application/json' },
  })
    .then((res) => {
      if (!res.ok) return res.json().then((data) => { throw new Error(data.message || 'Request failed'); });
      return res.json();
    })
    .then((data) => {
      if (!data.success) throw new Error(data.message || 'Failed to load shared record');
      return data;
    });
}

// ─── Consents ─────────────────────────────────────
export function listPatientConsents(patientId) {
  return request(`/portal/consents${qs({ patientId })}`);
}

export function approveConsent(patientId, consentId) {
  return request(`/portal/consents/${consentId}/approve${qs({ patientId })}`, {
    method: 'PUT',
  });
}

export function revokePatientConsent(patientId, consentId) {
  return request(`/portal/consents/${consentId}/revoke${qs({ patientId })}`, {
    method: 'PUT',
  });
}

// ─── Insurance ────────────────────────────────────
export function uploadInsuranceDoc(patientId, data) {
  return request('/portal/insurance/upload', {
    method: 'POST',
    body: { ...data, patientId },
  });
}

// ─── Reviews ──────────────────────────────────────
export function submitReview(patientId, data) {
  return request('/portal/reviews', {
    method: 'POST',
    body: { ...data, patientId },
  });
}

export function listPatientReviews(patientId, params = {}) {
  return request(`/portal/reviews${qs({ ...params, patientId })}`);
}

// ─── Access Log ───────────────────────────────────
export function getAccessLog(patientId, params) {
  return request(`/portal/access-log${qs({ ...params, patientId })}`);
}

// ─── Financial (Enhanced) ─────────────────────────
export function getPatientFinancialSummary(patientId) {
  return request(`/portal/financial-summary/${patientId}`);
}

export function getPatientLedger(patientId, params) {
  return request(`/portal/ledger${qs({ ...params, patientId })}`);
}

export function getPatientCreditNotes(patientId, params) {
  return request(`/portal/credit-notes${qs({ ...params, patientId })}`);
}

export async function downloadPatientInvoicePdf(patientId, invoiceId) {
  const token = localStorage.getItem('tenant_token');
  const slug = getSlug();
  const res = await fetch(`${API_BASE}/portal/invoices/${invoiceId}/pdf${qs({ patientId })}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(slug ? { 'x-tenant-id': slug } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to download invoice' }));
    throw new Error(err.message || 'Failed to download invoice');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-${invoiceId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function getInvoicePayments(patientId, invoiceId) {
  return request(`/payments/invoice/${invoiceId}${qs({ patientId })}`);
}

// ─── Care Reminders ──────────────────────────────
export function enablePrescriptionReminders(patientId, prescriptionId) {
  return request(`/portal/prescriptions/${prescriptionId}/enable-reminders${qs({ patientId })}`, {
    method: 'POST',
  });
}

export function disablePrescriptionReminders(patientId, prescriptionId) {
  return request(`/portal/prescriptions/${prescriptionId}/disable-reminders${qs({ patientId })}`, {
    method: 'DELETE',
  });
}

export function listCareTasks(patientId, params) {
  return request(`/portal/care-tasks${qs({ ...params, patientId })}`);
}

export function listTaskReminders(patientId, taskId, params) {
  return request(`/portal/care-tasks/${taskId}/reminders${qs({ ...params, patientId })}`);
}

export function respondToReminder(patientId, taskId, reminderId, data) {
  return request(`/portal/care-tasks/${taskId}/reminders/${reminderId}${qs({ patientId })}`, {
    method: 'PUT',
    body: data,
  });
}

// ─── Notifications ───────────────────────────────
export function listNotifications(params) {
  return request(`/notifications${qs(params)}`);
}

export function getUnreadCount() {
  return request('/notifications/unread-count');
}

export function markNotificationRead(id) {
  return request(`/notifications/${id}/read`, { method: 'PUT' });
}

export function markAllNotificationsRead() {
  return request('/notifications/read-all', { method: 'PUT' });
}

// ─── Clinic Browsing (Booking) ────────────────────
export function listDepartments() {
  return request('/portal/departments');
}

export function listDoctors(params) {
  return request(`/portal/doctors${qs(params)}`);
}

export function getDoctor(doctorId) {
  return request(`/portal/doctors/${doctorId}`);
}

export function getDoctorAvailability(doctorId, date, branchId) {
  const slug = getSlug();
  const branchParam = branchId ? `&branch=${branchId}` : '';
  return fetch(
    `${API_BASE}/public/clinics/${slug}/doctors/${doctorId}/availability?date=${date}${branchParam}`,
    { headers: { 'Content-Type': 'application/json' } },
  )
    .then((res) => res.json());
}

export function getDoctorAvailabilitySummary(doctorId, month, year, branchId) {
  const branchParam = branchId ? `&branch=${branchId}` : '';
  return request(`/portal/doctors/${doctorId}/availability-summary?month=${month}&year=${year}${branchParam}`);
}

// ─── Telemedicine ────────────────────────────────
export function listPatientVideoSessions(patientId, params) {
  return request(`/telemedicine${qs({ ...params, patientId })}`);
}

export function joinPatientVideoSession(sessionId, patientId) {
  return request(`/telemedicine/${sessionId}/join`, { method: 'POST' });
}

export function sendPatientVideoMessage(sessionId, data) {
  return request(`/telemedicine/${sessionId}/messages`, { method: 'POST', body: data });
}

export function getPatientVideoMessages(sessionId, params) {
  return request(`/telemedicine/${sessionId}/messages${qs(params)}`);
}

export function endPatientVideoSession(sessionId, data) {
  return request(`/telemedicine/${sessionId}/end`, { method: 'PUT', body: data });
}

export function updatePatientVideoConsent(sessionId, data) {
  return request(`/telemedicine/${sessionId}/consent`, { method: 'PUT', body: data });
}

// New wave-1 contract endpoints
export function getPatientVideoSession(sessionId) {
  return request(`/telemedicine/${sessionId}`);
}

export function declinePatientVideoSession(sessionId, reason) {
  return request(`/telemedicine/${sessionId}/decline`, {
    method: 'PUT',
    body: { reason: reason || 'declined' },
  });
}

export function markVideoMessageRead(sessionId, messageId) {
  return request(`/telemedicine/${sessionId}/messages/${messageId}/read`, {
    method: 'POST',
  });
}

export function sharePatientVideoFile(sessionId, data) {
  return request(`/telemedicine/${sessionId}/files`, { method: 'POST', body: data });
}

export function cancelPatientVideoSession(sessionId, reason) {
  return request(`/telemedicine/${sessionId}/cancel`, {
    method: 'PUT',
    body: { reason: reason || '' },
  });
}

export function extendPatientVideoSession(sessionId) {
  return request(`/telemedicine/${sessionId}/extend`, { method: 'PUT' });
}

export function getPresenceSnapshot() {
  return request('/telemedicine/presence');
}

// ─── Emergency (extended) ────────────────────────
// Note: creation/read/cancel already exist above as createEmergencyRequest / getEmergencySession / cancelEmergencySession.
// These return the same session shape — re-export convenience fetcher for the waiting→active transition.
export function refreshEmergencySession(sessionId) {
  return request(`/emergency/${sessionId}`);
}

// ─── Dependent Management (Guardian) ─────────────────────────
export function listDependents() {
  return request('/portal/dependents');
}

export function createDependent(data) {
  return request('/portal/dependents', { method: 'POST', body: data });
}

export function updateDependentApi(dependentId, data) {
  return request(`/portal/dependents/${dependentId}`, { method: 'PUT', body: data });
}

export function detachDependentApi(dependentId, data) {
  return request(`/portal/dependents/${dependentId}/detach`, { method: 'POST', body: data });
}

// ─── Guardian Archives ─────────────────────────────
export function listDependentArchives() {
  return request('/portal/dependents/archives');
}

export function getDependentArchive(archiveId) {
  return request(`/portal/dependents/archives/${archiveId}`);
}

export function getDependentConsent(dependentId) {
  return request(`/portal/dependents/${dependentId}/consent`);
}

// ─── Care Checklist Enhancements ────────────────────
export function toggleTaskReminder(patientId, taskId) {
  return request(`/portal/care-tasks/${taskId}/toggle${qs({ patientId })}`, { method: 'PUT' });
}

export function getDailyCareSchedule(patientId) {
  return request(`/portal/care/today${qs({ patientId })}`);
}

export function getDependentCompliance(dependentId) {
  return request(`/portal/dependents/${dependentId}/compliance`);
}

export function getDependentDailySchedule(dependentId) {
  return request(`/portal/dependents/${dependentId}/care-today`);
}

export function respondToReminderAsGuardian(dependentId, taskId, reminderId, data) {
  return request(`/portal/dependents/${dependentId}/care-tasks/${taskId}/reminders/${reminderId}`, {
    method: 'PUT',
    body: data,
  });
}

export function toggleDependentTaskReminder(dependentId, taskId) {
  return request(`/portal/dependents/${dependentId}/care-tasks/${taskId}/toggle`, { method: 'PUT' });
}

// ─── Global Search ──────────────────────────────────────────
export const globalSearch = (q, patientId, signal) =>
  request(`/global-search/patient?q=${encodeURIComponent(q)}&patientId=${patientId}&limit=5`, { signal });