import { useState, useCallback, useEffect } from 'react';
import { listEmergencySessions, acceptEmergencySession } from '../../api';
import { initSocket, emergencyBus } from '../../../lib/socket';

export default function useDoctorEmergencies(onStatsUpdate) {
  const [emergencies, setEmergencies] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [room, setRoom] = useState(null);

  const fetchEmergencies = useCallback(async () => {
    try {
      const res = await listEmergencySessions({ status: 'requested' });
      const d = res.data || res;
      const list = d.sessions || d.data || [];
      const sessions = Array.isArray(list) ? list : [];
      setEmergencies(sessions);
      onStatsUpdate?.(sessions.length);

      // Show modal for first new emergency
      if (sessions.length > 0 && !showModal) {
        setSelected(sessions[0]);
        setShowModal(true);
      }
    } catch {
      // Silent fail for polling
    }
  }, [showModal, onStatsUpdate]);

  // Initial fetch + socket listeners
  useEffect(() => {
    fetchEmergencies();
    initSocket();
    const off = emergencyBus.on((event, payload) => {
      if (event === 'emergency:new') {
        const incoming = payload?.session || payload;
        const sid = String(incoming?._id || incoming?.id || payload?.sessionId || '');
        if (!sid) return;
        setEmergencies((prev) => {
          if (prev.some((e) => String(e._id || e.id) === sid)) return prev;
          return [incoming, ...prev];
        });
        fetchEmergencies();
      } else {
        fetchEmergencies();
      }
    });
    return off;
  }, [fetchEmergencies]);

  const handleAccept = useCallback(async () => {
    if (!selected) return;
    setAccepting(true);
    try {
      const res = await acceptEmergencySession(selected._id || selected.id);
      const d = res.data || res;
      setRoom(d.roomId || d.room || d.callUrl || null);
      setEmergencies((prev) => prev.filter((e) => (e._id || e.id) !== (selected._id || selected.id)));
      onStatsUpdate?.(0);
    } catch {
      // Keep modal open on failure
    } finally {
      setAccepting(false);
    }
  }, [selected, onStatsUpdate]);

  const dismiss = useCallback(() => {
    setShowModal(false);
    setSelected(null);
    setRoom(null);
  }, []);

  return {
    emergencies,
    showModal,
    selected,
    accepting,
    room,
    fetchEmergencies,
    handleAccept,
    dismiss,
  };
}
