import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { tenantLogin as apiLogin, lookupEmail as apiLookupEmail, tenantLoginByClinicId as apiLoginByClinicId } from './api';

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return !payload.exp || payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

const TenantAuthContext = createContext(null);

/** Normalize backend clinic response to a consistent shape for UI */
function normalizeClinic(raw) {
  if (!raw) return null;
  return {
    id: raw.clinicId || raw._id || '',
    name: raw.clinicName || raw.name || '',
    logo: raw.clinicLogo || raw.logo || null,
    clinicCode: raw.clinicCode || '',
    slug: raw.slug || '',
  };
}

/**
 * Normalise the user object returned by the API.
 *
 * The backend sends `user.toJSON()` of the Mongoose User document, which
 * exposes `_id` and nothing else — the `id` virtual is not serialised because
 * the schema's toJSON has no `virtuals: true`. A lot of the tenant UI reads
 * `user.userId`, which was therefore always undefined. That silently produced
 * URLs like /doctors/undefined/leaves/:id (rejected by the param validator, so
 * "Cancel Leave" appeared to do nothing) and query filters like
 * `{ doctor: undefined }`, which qs() strips — quietly widening doctor-scoped
 * lists to the whole clinic.
 *
 * Expose all three spellings so every existing call site resolves correctly.
 */
function normalizeUser(raw, tenantSlug) {
  if (!raw) return raw;
  const id = raw._id || raw.id || raw.userId || null;
  return { ...raw, _id: id, id, userId: id, ...(tenantSlug !== undefined ? { tenantSlug } : {}) };
}

export function TenantAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [clinic, setClinic] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tenant_token');
    const stored = localStorage.getItem('tenant_user');
    if (token && stored && !isTokenExpired(token)) {
      // Re-normalise on restore: sessions stored before this fix lack userId.
      const parsed = normalizeUser(JSON.parse(stored));
      setUser(parsed);
      try {
        const storedPerms = localStorage.getItem('tenant_permissions');
        if (storedPerms) setPermissions(JSON.parse(storedPerms));
      } catch { /* ignore parse errors */ }
      try {
        const storedClinic = localStorage.getItem('tenant_clinic');
        if (storedClinic) setClinic(JSON.parse(storedClinic));
      } catch { /* ignore parse errors */ }
    } else {
      localStorage.removeItem('tenant_token');
      localStorage.removeItem('tenant_user');
      localStorage.removeItem('tenant_slug');
      localStorage.removeItem('tenant_permissions');
      localStorage.removeItem('tenant_clinic');
    }

    setLoading(false);
  }, []);

  const login = useCallback(async (email, password, clinicCode) => {
    const res = await apiLogin(email, password, clinicCode);

    // Validate response structure
    if (!res.data || !res.data.accessToken || !res.data.user) {
      console.error('Invalid login response structure:', res);
      throw new Error('Invalid response from server');
    }

    const { accessToken, refreshToken, user: userData, clinic: rawClinic, permissions: perms } = res.data;

    // Slug is resolved server-side from clinicCode — used internally for API headers only
    const tenantSlug = rawClinic?.slug || '';
    const clinicData = normalizeClinic(rawClinic);

    // Store in localStorage
    localStorage.setItem('tenant_token', accessToken);
    localStorage.setItem('tenant_refresh_token', refreshToken);
    const normalized = normalizeUser(userData, tenantSlug);
    localStorage.setItem('tenant_user', JSON.stringify(normalized));
    localStorage.setItem('tenant_slug', tenantSlug);
    localStorage.setItem('tenant_permissions', JSON.stringify(perms || []));
    if (clinicData) localStorage.setItem('tenant_clinic', JSON.stringify(clinicData));

    setUser(normalized);
    setClinic(clinicData);
    setPermissions(perms || []);
    return userData;
  }, []);

  const lookupEmail = useCallback(async (email) => {
    const res = await apiLookupEmail(email);
    return res.data; // { found, clinics: [{clinicId, clinicName, clinicCode, clinicLogo, role}] }
  }, []);

  const loginByClinicId = useCallback(async (email, password, clinicId) => {
    const res = await apiLoginByClinicId(email, password, clinicId);

    if (!res.data || !res.data.accessToken || !res.data.user) {
      throw new Error('Invalid response from server');
    }

    const { accessToken, refreshToken, user: userData, clinic: rawClinic, permissions: perms } = res.data;
    const tenantSlug = rawClinic?.slug || '';
    const clinicData = normalizeClinic(rawClinic);

    localStorage.setItem('tenant_token', accessToken);
    localStorage.setItem('tenant_refresh_token', refreshToken);
    const normalized = normalizeUser(userData, tenantSlug);
    localStorage.setItem('tenant_user', JSON.stringify(normalized));
    localStorage.setItem('tenant_slug', tenantSlug);
    localStorage.setItem('tenant_permissions', JSON.stringify(perms || []));
    if (clinicData) localStorage.setItem('tenant_clinic', JSON.stringify(clinicData));

    setUser(normalized);
    setClinic(clinicData);
    setPermissions(perms || []);
    return userData;
  }, []);

  /** Merge fresh clinic fields (e.g. after logo upload or settings fetch) into the cached context */
  const updateClinic = useCallback((fields) => {
    setClinic((prev) => {
      const merged = { ...(prev || {}), ...fields };
      localStorage.setItem('tenant_clinic', JSON.stringify(merged));
      return merged;
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('tenant_token');
    localStorage.removeItem('tenant_refresh_token');
    localStorage.removeItem('tenant_user');
    localStorage.removeItem('tenant_slug');
    localStorage.removeItem('tenant_permissions');
    localStorage.removeItem('tenant_clinic');
    setUser(null);
    setClinic(null);
    setPermissions([]);
  }, []);

  // Permission utility functions
  const hasPermission = useCallback((perm) => permissions.includes(perm), [permissions]);
  const hasAnyPermission = useCallback((...perms) => perms.some(p => permissions.includes(p)), [permissions]);
  const hasAllPermissions = useCallback((...perms) => perms.every(p => permissions.includes(p)), [permissions]);

  const tenantSlug = user?.tenantSlug || localStorage.getItem('tenant_slug') || '';

  const value = useMemo(() => ({
    user, clinic, permissions, loading, login, loginByClinicId, lookupEmail, logout, updateClinic,
    tenantSlug, isAuthenticated: !!user,
    hasPermission, hasAnyPermission, hasAllPermissions,
  }), [user, clinic, permissions, loading, login, loginByClinicId, lookupEmail, logout, updateClinic, tenantSlug, hasPermission, hasAnyPermission, hasAllPermissions]);

  return (
    <TenantAuthContext.Provider value={value}>
      {children}
    </TenantAuthContext.Provider>
  );
}

export function useTenantAuth() {
  const ctx = useContext(TenantAuthContext);
  if (!ctx) throw new Error('useTenantAuth must be used within TenantAuthProvider');
  return ctx;
}
