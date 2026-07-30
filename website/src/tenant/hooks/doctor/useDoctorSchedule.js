import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  listAppointments, getCurrentQueue, getOwnSchedule, getOwnLeaves, updateAppointment,
} from '../../api';
import { todayISO, todayEndISO } from '../../components/doctor/shared';

export default function useDoctorSchedule(userId) {
  const [appointments, setAppointments] = useState([]);
  const [apptLoading, setApptLoading] = useState(true);
  const [apptError, setApptError] = useState('');
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [mySchedule, setMySchedule] = useState([]);
  const [myLeaves, setMyLeaves] = useState([]);
  const [updatingApptId, setUpdatingApptId] = useState(null);

  const fetchSchedule = useCallback(async () => {
    setApptLoading(true);
    setApptError('');
    setQueueLoading(true);
    try {
      const [apptRes, queueRes] = await Promise.all([
        listAppointments({ doctor: userId, from: todayISO(), to: todayEndISO(), sort: 'scheduledAt' }),
        getCurrentQueue({ doctor: userId }),
      ]);
      const apptData = apptRes.data?.appointments || apptRes.data || apptRes.appointments || [];
      setAppointments(Array.isArray(apptData) ? apptData : []);
      const qData = queueRes.data?.queue || queueRes.data || queueRes.queue || [];
      setQueue(Array.isArray(qData) ? qData : []);
    } catch (err) {
      setApptError(err.message);
    } finally {
      setApptLoading(false);
      setQueueLoading(false);
    }
  }, [userId]);

  // Fetch working hours + leaves on mount
  useEffect(() => {
    getOwnSchedule().then((res) => setMySchedule(res.data || [])).catch(() => {});
    getOwnLeaves({ upcoming: 'true', limit: 50 }).then((res) => setMyLeaves(res.data?.items || [])).catch(() => {});
  }, []);

  // Initial schedule fetch
  useEffect(() => {
    if (userId) fetchSchedule();
  }, [fetchSchedule, userId]);

  // Update appointment status
  const handleUpdateStatus = useCallback(async (appt, newStatus) => {
    const id = appt._id || appt.id;
    setUpdatingApptId(id);
    setApptError('');
    try {
      await updateAppointment(id, { status: newStatus });
      fetchSchedule();
    } catch (err) {
      setApptError(err.message);
    } finally {
      setUpdatingApptId(null);
    }
  }, [fetchSchedule]);

  // Calendar events for CalendarView
  const calendarEvents = useMemo(() => {
    if (!Array.isArray(appointments)) return [];
    return appointments.map((appt) => {
      const start = new Date(appt.scheduledAt || appt.date || appt.startTime);
      const end = new Date(start.getTime() + (appt.duration || 30) * 60000);
      return {
        id: appt._id || appt.id,
        title: appt.patientName || appt.patient?.name || 'Patient',
        start,
        end,
        resource: appt,
      };
    });
  }, [appointments]);

  return {
    appointments,
    apptLoading,
    apptError,
    queue,
    queueLoading,
    mySchedule,
    myLeaves,
    updatingApptId,
    calendarEvents,
    fetchSchedule,
    handleUpdateStatus,
  };
}
