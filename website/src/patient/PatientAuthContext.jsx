import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useTenantAuth } from '../tenant/TenantAuthContext';
import { getPatientProfiles } from './api';

const PatientContext = createContext(null);

export function PatientAuthProvider({ children }) {
  const { user, isAuthenticated } = useTenantAuth();
  const [patients, setPatients] = useState([]);
  const [activePatientId, setActivePatientId] = useState(
    () => localStorage.getItem('active_patient_id') || null,
  );
  const [loading, setLoading] = useState(true);

  // Load patient profiles when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    getPatientProfiles()
      .then((res) => {
        const list = res.data || [];
        setPatients(list);
        // Auto-select first patient if none selected or saved ID is invalid
        if (list.length > 0 && !list.find((p) => p._id === activePatientId)) {
          const firstId = list[0]._id;
          setActivePatientId(firstId);
          localStorage.setItem('active_patient_id', firstId);
        }
      })
      .catch(() => setPatients([]))
      .finally(() => setLoading(false));
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchPatient = useCallback((patientId) => {
    setActivePatientId(patientId);
    localStorage.setItem('active_patient_id', patientId);
  }, []);

  const activePatient =
    patients.find((p) => p._id === activePatientId) || patients[0] || null;

  return (
    <PatientContext.Provider
      value={{
        patients,
        activePatient,
        activePatientId: activePatient?._id || null,
        switchPatient,
        loading,
        isGuardian: user?.role === 'guardian',
      }}
    >
      {children}
    </PatientContext.Provider>
  );
}

export function usePatientAuth() {
  const ctx = useContext(PatientContext);
  if (!ctx)
    throw new Error('usePatientAuth must be used within PatientAuthProvider');
  return ctx;
}
