import { useState, useCallback, useRef } from 'react';
import { listDoctorPatients, getPatient, listAppointments, listPrescriptions } from '../../api';

const LIMIT = 15;

export default function useDoctorPatients(userId) {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchTimerRef = useRef(null);

  // Patient detail modal state
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientDetail, setPatientDetail] = useState(null);
  const [patientAppts, setPatientAppts] = useState([]);
  const [patientRx, setPatientRx] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('info');

  const fetchPatients = useCallback(async (searchVal = '', pageVal = 1) => {
    setLoading(true);
    setError('');
    try {
      const res = await listDoctorPatients({ search: searchVal, page: pageVal, limit: LIMIT });
      const d = res?.data || res;
      // ApiResponse.paginated puts items in `data` (already unwrapped to `d`) and counts in `meta`
      const list = Array.isArray(d) ? d : (d.patients || d.data || d.items || []);
      setPatients(Array.isArray(list) ? list : []);
      setTotal(res?.meta?.total ?? res?.pagination?.total ?? (typeof d === 'object' && !Array.isArray(d) ? d.total : null) ?? list.length ?? 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback((value) => {
    setSearch(value);
    setPage(1);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchPatients(value, 1);
    }, 400);
  }, [fetchPatients]);

  const handlePageChange = useCallback((newPage) => {
    setPage(newPage);
    fetchPatients(search, newPage);
  }, [fetchPatients, search]);

  const handlePatientClick = useCallback(async (patient) => {
    const pid = patient._id || patient.id;
    setSelectedPatient(patient);
    setDetailLoading(true);
    setDetailTab('info');
    setPatientDetail(null);
    setPatientAppts([]);
    setPatientRx([]);
    try {
      const [detailRes, apptsRes, rxRes] = await Promise.all([
        getPatient(pid),
        listAppointments({ patient: pid, doctor: userId, limit: 50 }),
        listPrescriptions({ patient: pid, limit: 50 }),
      ]);
      setPatientDetail(detailRes.data || detailRes);
      const apptData = apptsRes.data?.items || apptsRes.data?.appointments || apptsRes.data || [];
      setPatientAppts(Array.isArray(apptData) ? apptData : []);
      const rxData = rxRes.data?.items || rxRes.data?.prescriptions || rxRes.data || [];
      setPatientRx(Array.isArray(rxData) ? rxData : []);
    } catch {
      // Keep modal open with partial data
    } finally {
      setDetailLoading(false);
    }
  }, [userId]);

  const closePatientDetail = useCallback(() => {
    setSelectedPatient(null);
    setPatientDetail(null);
  }, []);

  return {
    patients,
    search,
    page,
    total,
    limit: LIMIT,
    loading,
    error,
    fetchPatients,
    handleSearch,
    handlePageChange,
    // Detail modal
    selectedPatient,
    patientDetail,
    patientAppts,
    patientRx,
    detailLoading,
    detailTab,
    setDetailTab,
    handlePatientClick,
    closePatientDetail,
  };
}
