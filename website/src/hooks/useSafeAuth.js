import { useTenantAuth } from '../tenant/TenantAuthContext';
import { usePlatformAuth } from '../platform/AuthContext';
import { usePatientAuth } from '../patient/PatientAuthContext';

export function useSafeTenantAuth() {
  try {
    return useTenantAuth();
  } catch {
    return {
      user: {
        name: 'Demo User',
        role: 'clinic_admin',
        tenantSlug: 'demo-clinic',
      },
      login: async () => true,
      logout: () => {},
    };
  }
}

export function useSafePlatformAuth() {
  try {
    return usePlatformAuth();
  } catch {
    return {
      user: {
        name: 'Platform Admin',
        email: 'admin@demo.com',
      },
      logout: () => {},
    };
  }
}


export function useSafePatientAuth() {
  try {
    return usePatientAuth();
  } catch {
    return {
      patients: [{ _id: '1', name: 'Demo Patient', patientId: 'P001' }],
      activePatient: { _id: '1', name: 'Demo Patient' },
      activePatientId: '1',
      switchPatient: () => {},
      isGuardian: false,
    };
  }
}
