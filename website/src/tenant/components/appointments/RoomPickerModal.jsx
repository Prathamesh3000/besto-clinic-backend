import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DoorOpen, Loader, MapPin, AlertCircle, Zap } from 'lucide-react';
import { Modal } from '../../../platform/components/shared';
import { listRooms, startConsultation } from '../../api';
import { useToast } from '../../ToastContext';

const btnPrimary = 'px-4 py-2 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const btnGhost = 'px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';

const ROOM_TYPE_STYLES = {
  consultation: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Consultation' },
  procedure:    { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Procedure' },
  emergency:    { bg: 'bg-red-50', text: 'text-red-700', label: 'Emergency' },
  general:      { bg: 'bg-neutral-100', text: 'text-neutral-600', label: 'General' },
};

const STATUS_STYLES = {
  available:   { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  occupied:    { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' },
  cleaning:    { bg: 'bg-sky-50', border: 'border-sky-200', dot: 'bg-sky-500' },
  maintenance: { bg: 'bg-neutral-50', border: 'border-neutral-200', dot: 'bg-neutral-400' },
  reserved:    { bg: 'bg-violet-50', border: 'border-violet-200', dot: 'bg-violet-500' },
};

export default function RoomPickerModal({ open, onClose, appointmentId, branchId }) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(null); // roomId or 'auto'
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    const params = {};
    if (branchId) params.branch = branchId;
    listRooms(params)
      .then((res) => {
        const list = res.data?.items || res.data || [];
        setRooms(Array.isArray(list) ? list : []);
      })
      .catch((err) => setError(err.message || 'Failed to load rooms'))
      .finally(() => setLoading(false));
  }, [open, branchId]);

  const handleSelect = async (roomId) => {
    const key = roomId || 'auto';
    setStarting(key);
    setError('');
    try {
      const payload = { appointmentId };
      if (roomId) payload.roomId = roomId;
      await startConsultation(payload);
      showToast({ type: 'success', message: roomId ? 'Room assigned — opening consultation' : 'Auto-assigned room — opening consultation' });
      navigate(`/clinic/doctor-consultation/${appointmentId}`);
    } catch (err) {
      setError(err.message || 'Failed to start consultation');
      showToast({ type: 'error', message: err.message || 'Failed to start consultation' });
    } finally {
      setStarting(null);
    }
  };

  const availableRooms = rooms.filter((r) => r.status === 'available');
  const unavailableRooms = rooms.filter((r) => r.status !== 'available');

  return (
    <Modal open={open} onClose={onClose} title="Select Consultation Room" wide>
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader className="h-6 w-6 text-primary-500 animate-spin" />
        </div>
      ) : error && rooms.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={onClose} className={btnGhost}>Close</button>
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          {/* Available rooms */}
          {availableRooms.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                Available Rooms ({availableRooms.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {availableRooms.map((room) => {
                  const id = room._id || room.id;
                  const typeStyle = ROOM_TYPE_STYLES[room.type] || ROOM_TYPE_STYLES.general;
                  const isSelecting = starting === id;
                  return (
                    <button
                      key={id}
                      onClick={() => handleSelect(id)}
                      disabled={!!starting}
                      className={`text-left p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-300 transition-all disabled:opacity-50 ${isSelecting ? 'ring-2 ring-primary-300' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <DoorOpen className="h-4 w-4 text-emerald-600" />
                          <span className="text-sm font-semibold text-neutral-900">{room.name}</span>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeStyle.bg} ${typeStyle.text}`}>
                          {typeStyle.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-neutral-500">
                        <span className="font-mono">{room.code}</span>
                        {room.floor && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> Floor {room.floor}
                          </span>
                        )}
                      </div>
                      {isSelecting && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-primary-600">
                          <Loader className="h-3 w-3 animate-spin" /> Starting consultation...
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <DoorOpen className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-neutral-700">No rooms available right now</p>
              <p className="text-xs text-neutral-500 mt-1">You can still auto-assign or proceed without a room</p>
            </div>
          )}

          {/* Unavailable rooms (collapsed, for visibility) */}
          {unavailableRooms.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Unavailable ({unavailableRooms.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {unavailableRooms.map((room) => {
                  const id = room._id || room.id;
                  const s = STATUS_STYLES[room.status] || STATUS_STYLES.maintenance;
                  return (
                    <div key={id} className={`p-3 rounded-xl border ${s.border} ${s.bg} opacity-60`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                          <span className="text-xs font-medium text-neutral-700">{room.name}</span>
                          <span className="text-[10px] font-mono text-neutral-400">{room.code}</span>
                        </div>
                        <span className="text-[10px] capitalize text-neutral-500">{room.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-neutral-200">
            <button onClick={onClose} className={btnGhost} disabled={!!starting}>
              Cancel
            </button>
            <button
              onClick={() => handleSelect(null)}
              disabled={!!starting}
              className={`${btnPrimary} flex items-center gap-2`}
            >
              {starting === 'auto' ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              Auto-assign Room
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
