import { useState, useCallback, useEffect } from 'react';
import { getDoctorStats, getDoctorProfile, getDoctorComplianceSummary } from '../../api';

export default function useDoctorStats() {
  const [stats, setStats] = useState({
    todayAppointments: 0,
    monthPatients: 0,
    monthRevenue: 0,
    pendingEmergencies: 0,
  });
  const [currentRoom, setCurrentRoom] = useState(null);
  const [complianceSummary, setComplianceSummary] = useState(null);
  const [reminderTimings, setReminderTimings] = useState([1440]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getDoctorStats();
      const d = res.data || res;
      setStats({
        todayAppointments: d.todayAppointments ?? d.appointmentsToday ?? 0,
        monthPatients: d.monthPatients ?? d.patientsThisMonth ?? 0,
        monthRevenue: d.monthRevenue ?? d.revenueThisMonth ?? 0,
        pendingEmergencies: d.pendingEmergencies ?? 0,
      });
      setCurrentRoom(d.currentRoom || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch companion data (profile, compliance) on mount
  useEffect(() => {
    getDoctorProfile()
      .then((res) => {
        const profile = res.data || res;
        if (profile.defaultReminderTimings?.length) setReminderTimings(profile.defaultReminderTimings);
      })
      .catch(() => {});

    getDoctorComplianceSummary()
      .then((res) => setComplianceSummary(res.data || res))
      .catch(() => {});
  }, []);

  // Initial stats fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Allow emergency count to be updated externally (from socket events)
  const setPendingEmergencies = useCallback((count) => {
    setStats((prev) => ({ ...prev, pendingEmergencies: count }));
  }, []);

  return {
    stats,
    currentRoom,
    complianceSummary,
    reminderTimings,
    setReminderTimings,
    loading,
    error,
    refetch: fetchStats,
    setPendingEmergencies,
  };
}
