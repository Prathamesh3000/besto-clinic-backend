import { useState, useEffect, useCallback } from 'react';

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return !payload.exp || payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

function resolveAuth() {
  // Check tenant auth (staff + patient)
  const tenantToken = localStorage.getItem('tenant_token');
  const tenantUser = localStorage.getItem('tenant_user');
  if (tenantToken && tenantUser && !isTokenExpired(tenantToken)) {
    try {
      const user = JSON.parse(tenantUser);
      const role = user.role || '';
      const isPatient = ['patient', 'guardian'].includes(role);
      return {
        isLoggedIn: true,
        user,
        role,
        portalType: isPatient ? 'patient' : 'staff',
        dashboardPath: isPatient
          ? '/patient'
          : role === 'doctor'
            ? '/clinic/doctor-dashboard'
            : '/clinic',
      };
    } catch { /* fall through */ }
  }

  // Check platform auth
  const platformToken = localStorage.getItem('platform_token');
  const platformUser = localStorage.getItem('platform_user');
  if (platformToken && platformUser && !isTokenExpired(platformToken)) {
    try {
      const user = JSON.parse(platformUser);
      return {
        isLoggedIn: true,
        user,
        role: user.role || 'platform_admin',
        portalType: 'platform',
        dashboardPath: '/platform',
      };
    } catch { /* fall through */ }
  }

  return { isLoggedIn: false, user: null, role: null, portalType: null, dashboardPath: null };
}

export function useAuthStatus() {
  const [auth, setAuth] = useState(resolveAuth);

  useEffect(() => {
    const refresh = () => setAuth(resolveAuth());
    // Cross-tab sync
    window.addEventListener('storage', refresh);
    // Re-check when tab becomes visible (e.g. after login in same tab)
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('storage', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('tenant_token');
    localStorage.removeItem('tenant_refresh_token');
    localStorage.removeItem('tenant_user');
    localStorage.removeItem('tenant_slug');
    localStorage.removeItem('platform_token');
    localStorage.removeItem('platform_user');
    localStorage.removeItem('active_patient_id');
    localStorage.removeItem('platform_patient_email');
    setAuth({ isLoggedIn: false, user: null, role: null, portalType: null, dashboardPath: null });
    window.location.href = '/';
  }, []);

  return { ...auth, logout };
}
