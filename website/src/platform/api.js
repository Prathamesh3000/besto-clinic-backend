/**
 * Platform API client — all calls to /api/v1/platform endpoints.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'https://bestoclinic.com/api/v1';

async function request(path, options = {}) {
  const token = localStorage.getItem('platform_token');
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // res.json() throws on an empty body (204 No Content / 304 Not Modified),
  // which surfaces to the user as a bogus error on a request that succeeded.
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

// ─── Auth ──────────────────────────────────────
export const platformLogin = (email, password) =>
  request('/auth/platform/login', { method: 'POST', body: { email, password } });

// ─── Dashboard ─────────────────────────────────
export const getDashboard = () => request('/platform/dashboard');
export const getRevenueAnalytics = (params) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/platform/analytics/revenue${qs ? `?${qs}` : ''}`);
};

// ─── Tenants ───────────────────────────────────
export const listTenants = (params) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/platform/tenants${qs ? `?${qs}` : ''}`);
};
export const getTenant = (slug) => request(`/platform/tenants/${slug}`);
export const updateTenant = (slug, data) =>
  request(`/platform/tenants/${slug}`, { method: 'PUT', body: data });
export const toggleTenantStatus = (slug, isActive) =>
  request(`/platform/tenants/${slug}/status`, { method: 'PATCH', body: { isActive } });
export const updateTenantFeatures = (slug, features) =>
  request(`/platform/tenants/${slug}/features`, { method: 'PUT', body: { features } });
export const createTenant = (data) =>
  request('/platform/tenants', { method: 'POST', body: data });
export const getTenantUsage = (slug) =>
  request(`/platform/tenants/${slug}/usage`);
export const getTenantAuditLog = (slug, params) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/platform/tenants/${slug}/audit-log${qs ? `?${qs}` : ''}`);
};
export const assignSuperAdmin = (slug, data) =>
  request(`/platform/tenants/${slug}/superadmin`, { method: 'POST', body: data });
export const activateTenant = (slug) =>
  request(`/platform/tenants/${slug}/activate`, { method: 'POST' });
export const uploadTenantLogo = (slug, imageData, mimeType) =>
  request(`/platform/tenants/${slug}/logo`, { method: 'POST', body: { imageData, mimeType } });

// ─── Plans ─────────────────────────────────────
export const listPlans = (params) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/platform/plans${qs ? `?${qs}` : ''}`);
};
export const getPlan = (id) => request(`/platform/plans/${id}`);
export const createPlan = (data) =>
  request('/platform/plans', { method: 'POST', body: data });
export const updatePlan = (id, data) =>
  request(`/platform/plans/${id}`, { method: 'PUT', body: data });
export const deletePlan = (id) =>
  request(`/platform/plans/${id}`, { method: 'DELETE' });
export const createCustomPlan = (slug, data) =>
  request(`/platform/tenants/${slug}/custom-plan`, { method: 'POST', body: data });

// ─── Pricing ───────────────────────────────────
export const calculatePrice = (data) =>
  request('/platform/pricing/calculate', { method: 'POST', body: data });
export const calculateProration = (subId, data) =>
  request(`/platform/pricing/proration/${subId}`, { method: 'POST', body: data });
export const comparePlans = (data) =>
  request('/platform/pricing/compare', { method: 'POST', body: data });

// ─── Promotions ────────────────────────────────
export const listPromotions = (params) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/platform/promotions${qs ? `?${qs}` : ''}`);
};
export const getPromotion = (id) => request(`/platform/promotions/${id}`);
export const createPromotion = (data) =>
  request('/platform/promotions', { method: 'POST', body: data });
export const updatePromotion = (id, data) =>
  request(`/platform/promotions/${id}`, { method: 'PUT', body: data });
export const deletePromotion = (id) =>
  request(`/platform/promotions/${id}`, { method: 'DELETE' });
export const validatePromoCode = (data) =>
  request('/platform/promotions/validate', { method: 'POST', body: data });
export const getPromotionAnalytics = () =>
  request('/platform/promotions/analytics');

// ─── Rebates ───────────────────────────────────
export const listRebates = (params) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/platform/rebates${qs ? `?${qs}` : ''}`);
};
export const createRebate = (data) =>
  request('/platform/rebates', { method: 'POST', body: data });
export const updateRebate = (id, data) =>
  request(`/platform/rebates/${id}`, { method: 'PUT', body: data });
export const deleteRebate = (id) =>
  request(`/platform/rebates/${id}`, { method: 'DELETE' });
export const getRebate = (id) => request(`/platform/rebates/${id}`);

// ─── Feature Flags ─────────────────────────────
export const listFeatureFlags = () => request('/platform/feature-flags');
export const createFeatureFlag = (data) =>
  request('/platform/feature-flags', { method: 'POST', body: data });
export const updateFeatureFlag = (id, data) =>
  request(`/platform/feature-flags/${id}`, { method: 'PUT', body: data });
export const setTenantOverride = (data) =>
  request('/platform/feature-flags/tenant-override', { method: 'POST', body: data });
export const removeTenantOverride = (data) =>
  request('/platform/feature-flags/tenant-override', { method: 'DELETE', body: data });
export const deleteFeatureFlag = (id) =>
  request(`/platform/feature-flags/${id}`, { method: 'DELETE' });
export const resolveFlags = (slug) =>
  request(`/platform/feature-flags/resolve/${slug}`);
export const resolveSingleFlag = (slug, key) =>
  request(`/platform/feature-flags/resolve/${slug}/${key}`);

// ─── Subscriptions ─────────────────────────────
export const listSubscriptions = (params) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/platform/subscriptions${qs ? `?${qs}` : ''}`);
};
export const getExpiringTrials = (days = 7) =>
  request(`/platform/subscriptions/expiring-trials?days=${days}`);
export const extendTrial = (id, additionalDays) =>
  request(`/platform/subscriptions/${id}/extend-trial`, {
    method: 'POST',
    body: { additionalDays },
  });
export const createSubscription = (slug, data) =>
  request(`/platform/tenants/${slug}/subscription`, { method: 'POST', body: data });
export const changePlan = (slug, data) =>
  request(`/platform/tenants/${slug}/subscription/plan`, { method: 'PUT', body: data });
export const cancelSubscription = (slug, data) =>
  request(`/platform/tenants/${slug}/subscription/cancel`, { method: 'POST', body: data });
export const reactivateSubscription = (slug) =>
  request(`/platform/tenants/${slug}/subscription/reactivate`, { method: 'POST' });
export const activateSubscription = (slug) =>
  request(`/platform/tenants/${slug}/subscription/activate`, { method: 'POST' });
export const setCustomPricing = (slug, data) =>
  request(`/platform/tenants/${slug}/subscription/custom-pricing`, { method: 'PUT', body: data });
export const cancelScheduledChange = (slug) =>
  request(`/platform/tenants/${slug}/subscription/scheduled-change`, { method: 'DELETE' });
export const getSubscriptionExpiry = (slug) =>
  request(`/platform/tenants/${slug}/subscription-expiry`);

// ─── Analytics ────────────────────────────────
export const getMrrBreakdown = () => request('/platform/analytics/mrr');
export const getActiveSubscriptionAnalytics = () =>
  request('/platform/analytics/subscriptions');
export const getExpiringSubscriptions = (days = 30) =>
  request(`/platform/analytics/expiring?days=${days}`);
export const getSuspendedTenants = () =>
  request('/platform/analytics/suspended');
export const getPlanDistribution = () =>
  request('/platform/analytics/plans');
export const getPromotionImpact = (params) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/platform/analytics/promotion-impact${qs ? `?${qs}` : ''}`);
};

// ─── Advanced Analytics ──────────────────────
export const getTenantGrowth = (params) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/platform/analytics/tenant-growth${qs ? `?${qs}` : ''}`);
};
export const getFeatureAdoption = () =>
  request('/platform/analytics/feature-adoption');
export const getChurnAnalytics = (params) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/platform/analytics/churn${qs ? `?${qs}` : ''}`);
};

// ─── Dental Scan Analytics ──────────────────
export const getDentalScanAnalytics = (params) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/platform/analytics/dental-scans${qs ? `?${qs}` : ''}`);
};
export const getRecentDentalScans = (params) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/platform/analytics/dental-scans/recent${qs ? `?${qs}` : ''}`);
};

// ─── Referrals ────────────────────────────────
export const generateReferralCode = (slug) =>
  request(`/platform/tenants/${slug}/referral-code`, { method: 'POST' });
export const lookupReferralCode = (data) =>
  request('/platform/referrals/lookup', { method: 'POST', body: data });
export const applyReferralCode = (slug, data) =>
  request(`/platform/tenants/${slug}/apply-referral`, { method: 'POST', body: data });

// ─── Platform Users ────────────────────────────
export const listPlatformUsers = () => request('/platform/users');
export const createPlatformUser = (data) =>
  request('/platform/users', { method: 'POST', body: data });

// ─── Provisioning ─────────────────────────────
export const getProvisioningStatus = (slug) =>
  request(`/platform/tenants/${slug}/provisioning`);
export const retryProvisioning = (slug) =>
  request(`/platform/tenants/${slug}/provisioning/retry`, { method: 'POST' });
export const rollbackProvisioning = (slug) =>
  request(`/platform/tenants/${slug}/provisioning/rollback`, { method: 'POST' });

// ─── Integrations ─────────────────────────────
export const listIntegrations = (slug) =>
  request('/integrations', { headers: { 'x-tenant-id': slug } });
export const getIntegration = (slug, type) =>
  request(`/integrations/${type}`, { headers: { 'x-tenant-id': slug } });
export const upsertIntegration = (slug, data) =>
  request('/integrations', { method: 'PUT', body: data, headers: { 'x-tenant-id': slug } });
export const storeIntegrationCredentials = (slug, type, data) =>
  request(`/integrations/${type}/credentials`, {
    method: 'POST', body: data, headers: { 'x-tenant-id': slug },
  });
export const testIntegrationConnection = (slug, type) =>
  request(`/integrations/${type}/test`, {
    method: 'POST', headers: { 'x-tenant-id': slug },
  });
export const triggerIntegrationSync = (slug, type, data = {}) =>
  request(`/integrations/${type}/sync`, {
    method: 'POST', body: data, headers: { 'x-tenant-id': slug },
  });
export const disableIntegration = (slug, type) =>
  request(`/integrations/${type}`, {
    method: 'DELETE', headers: { 'x-tenant-id': slug },
  });
export const getIntegrationSyncLogs = (slug, params) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/integrations/logs${qs ? `?${qs}` : ''}`, {
    headers: { 'x-tenant-id': slug },
  });
};

// ─── Job Portal (Platform Admin) ─────────────
export const listAllJobPostings = (params) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/platform/jobs${qs ? `?${qs}` : ''}`);
};
export const getJobAnalytics = () => request('/platform/jobs/analytics');
export const getCreditOverview = () => request('/platform/credits/overview');
export const adjustClinicCredits = (slug, data) =>
  request(`/platform/credits/${slug}/adjust`, { method: 'POST', body: data });
export const listClinicWallets = (params) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/platform/credits/wallets${qs ? `?${qs}` : ''}`);
};

// Per-tenant job portal management
export const getClinicJobPortalStatus = (slug) =>
  request(`/platform/tenants/${slug}/job-portal`);
export const enableClinicJobPortal = (slug, data) =>
  request(`/platform/tenants/${slug}/job-portal/enable`, { method: 'POST', body: data });
export const disableClinicJobPortal = (slug) =>
  request(`/platform/tenants/${slug}/job-portal/disable`, { method: 'POST' });
export const grantClinicCredits = (slug, data) =>
  request(`/platform/tenants/${slug}/job-portal/credits`, { method: 'POST', body: data });

// ─── Monitoring ──────────────────────────────
export const getMonitoringHealth = () => request('/monitoring/health');
export const getMonitoringMetrics = () => request('/monitoring/metrics');
export const getSystemReport = () => request('/monitoring/system');
export const getMonitoringMemory = () => request('/monitoring/memory');
export const getSlowQueries = () => request('/monitoring/slow-queries');
export const getRecentErrors = () => request('/monitoring/errors');
export const resetApiMetrics = () =>
  request('/monitoring/reset', { method: 'POST' });

// ─── Global Search ──────────────────────────────────────────
export const globalSearch = (q, signal) =>
  request(`/global-search/platform?q=${encodeURIComponent(q)}&limit=5`, { signal });
