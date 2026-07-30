import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DoorOpen, Plus, Trash2, ArrowRightLeft, Building2, RefreshCw,
  Sparkles, Wrench, Lock, ChevronDown, Stethoscope,
} from 'lucide-react';
import { listRooms, createRoom, releaseRoomApi, deleteRoomApi } from '../../api';
import { ErrorAlert, EmptyState, Modal } from '../../../platform/components/shared';
import { ROOM_STATUS, ROOM_ICONS, selectCls, getElapsedMinutes, formatElapsed, timerColor } from './constants';
import { RoomsSkeleton } from './skeletons';
import { stripDrPrefix } from '../../../utils/doctorName';

export default function RoomsTab({ branch, branches, timerRef }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', code: '', type: 'consultation', branch: '', floor: '' });
  const [saving, setSaving] = useState(false);
  const [, setTick] = useState(0);
  const tickRef = useRef(null);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (branch) params.branch = branch;
      const res = await listRooms(params);
      setRooms(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, [branch]);

  useEffect(() => {
    fetchRooms();
    clearInterval(timerRef.current);
    timerRef.current = setInterval(fetchRooms, 120_000);
    tickRef.current = setInterval(() => setTick((t) => t + 1), 60000);
    return () => { clearInterval(timerRef.current); clearInterval(tickRef.current); };
  }, [fetchRooms]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createRoom(addForm);
      setAddOpen(false);
      setAddForm({ name: '', code: '', type: 'consultation', branch: '', floor: '' });
      fetchRooms();
    } catch (err) {
      setError(err.message || 'Failed to create room');
    } finally {
      setSaving(false);
    }
  };

  const handleRelease = async (id) => {
    try { await releaseRoomApi(id); fetchRooms(); } catch (err) { setError(err.message); }
  };

  const handleDelete = async (id) => {
    try { await deleteRoomApi(id); fetchRooms(); } catch (err) { setError(err.message); }
  };

  // Group by branch
  const grouped = {};
  for (const r of rooms) {
    const bid = r.branch?._id || r.branch || 'unknown';
    const bname = r.branch?.name || 'Unknown Branch';
    if (!grouped[bid]) grouped[bid] = { name: bname, rooms: [] };
    grouped[bid].rooms.push(r);
  }
  const branchGroups = Object.entries(grouped);

  if (error) return <ErrorAlert message={error} />;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold font-display text-neutral-900">Consultation Rooms</h3>
            <p className="text-xs text-neutral-500 mt-0.5">{rooms.length} room{rooms.length !== 1 ? 's' : ''} configured</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAddOpen(true)}
              className="h-9 px-4 text-xs font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Add Room
            </button>
            <button
              onClick={fetchRooms}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-neutral-50 text-neutral-400 hover:text-primary-600 transition disabled:opacity-30"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Content */}
        {loading && rooms.length === 0 ? (
          <div className="p-6"><RoomsSkeleton /></div>
        ) : rooms.length === 0 ? (
          <div className="py-16">
            <EmptyState icon={DoorOpen} title="No rooms configured" message="Add rooms to track physical space usage." />
          </div>
        ) : (
          <div className="p-6 space-y-8">
            {branchGroups.map(([bid, group]) => (
              <div key={bid}>
                {branchGroups.length > 1 && (
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="h-3.5 w-3.5 text-primary-500" />
                    <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">{group.name}</span>
                    <span className="text-[10px] text-neutral-400">{group.rooms.length} rooms</span>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {group.rooms.map((room) => (
                    <RoomTile key={room._id} room={room} onRelease={handleRelease} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Room Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Room">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">Branch</label>
            <div className="relative">
              <select required className={selectCls + ' w-full appearance-none pr-8'} value={addForm.branch} onChange={(e) => setAddForm({ ...addForm, branch: e.target.value })}>
                <option value="">Select branch</option>
                {branches.map((b) => <option key={b._id || b.id} value={b._id || b.id}>{b.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">Room Name</label>
              <input required className={selectCls + ' w-full'} placeholder="Room 101" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">Code</label>
              <input required className={selectCls + ' w-full'} placeholder="R101" value={addForm.code} onChange={(e) => setAddForm({ ...addForm, code: e.target.value.toUpperCase() })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">Type</label>
              <div className="relative">
                <select className={selectCls + ' w-full appearance-none pr-8'} value={addForm.type} onChange={(e) => setAddForm({ ...addForm, type: e.target.value })}>
                  <option value="consultation">Consultation</option>
                  <option value="procedure">Procedure</option>
                  <option value="emergency">Emergency</option>
                  <option value="general">General</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">Floor</label>
              <input className={selectCls + ' w-full'} placeholder="Ground" value={addForm.floor} onChange={(e) => setAddForm({ ...addForm, floor: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
            <button type="button" onClick={() => setAddOpen(false)} className="px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Room'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ── SVG: Occupied consultation scene ─────────── */
function ConsultationScene({ doctor, patient, elapsed, roomId }) {
  const dInit = (doctor?.name || '?')[0].toUpperCase();
  const pInit = (patient?.name || '?')[0].toUpperCase();
  const dName = `Dr. ${stripDrPrefix(doctor?.name)?.split(' ')[0] || '\u2014'}`;
  const pName = patient?.name?.split(' ')[0] || 'Patient';
  const tColor = elapsed >= 45 ? '#dc2626' : elapsed >= 25 ? '#d97706' : '#059669';
  const tBg = elapsed >= 45 ? '#fef2f2' : elapsed >= 25 ? '#fffbeb' : '#ecfdf5';
  const gradId = `dg-${roomId}`;

  return (
    <svg viewBox="0 0 200 108" className="w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2E6AB8" />
          <stop offset="100%" stopColor="#264D84" />
        </linearGradient>
      </defs>
      {/* Desk */}
      <rect x="52" y="36" width="96" height="28" rx="5" fill="#f8fafb" stroke="#e4e8ec" strokeWidth="1" />
      <text x="100" y="54" textAnchor="middle" fill="#ced4da" fontSize="7" fontWeight="500" fontFamily="system-ui, sans-serif">DESK</text>
      {/* Doctor (left) */}
      <circle cx="26" cy="50" r="18" fill={`url(#${gradId})`} />
      <text x="26" y="54.5" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif">{dInit}</text>
      <line x1="44" y1="50" x2="52" y2="50" stroke="#e4e8ec" strokeWidth="0.75" strokeDasharray="2 2" />
      <text x="26" y="80" textAnchor="middle" fill="#3d4a57" fontSize="7.5" fontWeight="600" fontFamily="system-ui, sans-serif">{dName}</text>
      {/* Patient (right) */}
      <circle cx="174" cy="50" r="15" fill="#eef4fb" />
      <text x="174" y="54.5" textAnchor="middle" fill="#2E5FA2" fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif">{pInit}</text>
      <line x1="148" y1="50" x2="159" y2="50" stroke="#e4e8ec" strokeWidth="0.75" strokeDasharray="2 2" />
      <text x="174" y="80" textAnchor="middle" fill="#556170" fontSize="7.5" fontWeight="500" fontFamily="system-ui, sans-serif">{pName}</text>
      {/* Timer pill */}
      <rect x="66" y="89" width="68" height="17" rx="8.5" fill={tBg} />
      <circle cx="79" cy="97.5" r="2.5" fill={tColor}>
        <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x="104" y="101" textAnchor="middle" fill={tColor} fontSize="8.5" fontWeight="700" fontFamily="system-ui, sans-serif">{formatElapsed(elapsed)}</text>
    </svg>
  );
}

/* ── SVG: Empty room (available) ─────────────── */
function EmptyRoomScene() {
  return (
    <svg viewBox="0 0 200 80" className="w-full" preserveAspectRatio="xMidYMid meet">
      <rect x="52" y="22" width="96" height="28" rx="5" fill="none" stroke="#e4e8ec" strokeWidth="0.75" strokeDasharray="4 3" />
      <circle cx="26" cy="36" r="14" fill="none" stroke="#e4e8ec" strokeWidth="0.75" strokeDasharray="4 3" />
      <circle cx="174" cy="36" r="12" fill="none" stroke="#e4e8ec" strokeWidth="0.75" strokeDasharray="4 3" />
      <text x="100" y="70" textAnchor="middle" fill="#ced4da" fontSize="8" fontWeight="500" fontFamily="system-ui, sans-serif">Ready for consultation</text>
    </svg>
  );
}

/* ── Room Tile ────────────────────────────────── */
function RoomTile({ room, onRelease, onDelete }) {
  const st = ROOM_STATUS[room.status] || ROOM_STATUS.available;
  const TypeIcon = ROOM_ICONS[room.type] || DoorOpen;
  const elapsed = room.status === 'occupied' ? getElapsedMinutes(room.occupiedSince) : 0;
  const [hovered, setHovered] = useState(false);

  const statusIcons = {
    cleaning: Sparkles,
    maintenance: Wrench,
    reserved: Lock,
  };
  const StatusIcon = statusIcons[room.status];

  return (
    <div
      className={`rounded-2xl border border-neutral-200 border-l-[3px] ${st.accent} bg-white overflow-hidden hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900 truncate">{room.name}</p>
          <p className="text-[10px] text-neutral-400 font-mono uppercase">{room.code}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-2 h-2 rounded-full ${st.dot}`} />
          <span className={`text-[10px] font-medium ${st.text} capitalize`}>{room.status}</span>
        </div>
      </div>

      {/* Body */}
      <div className="px-3">
        {room.status === 'occupied' ? (
          <ConsultationScene
            doctor={room.currentDoctor}
            patient={room.currentPatient}
            elapsed={elapsed}
            roomId={room._id}
          />
        ) : room.status === 'available' ? (
          <EmptyRoomScene />
        ) : StatusIcon ? (
          <div className="flex flex-col items-center justify-center py-6 gap-1">
            <StatusIcon className="h-6 w-6 text-neutral-300" />
            <span className="text-[10px] text-neutral-400 capitalize">{room.status}</span>
          </div>
        ) : null}
      </div>

      {/* Footer: type + floor */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 pt-3 border-t border-neutral-100">
          <TypeIcon className="h-3 w-3 text-neutral-400" />
          <span className="text-[10px] text-neutral-400 capitalize">{room.type}</span>
          {room.floor && <span className="text-[10px] text-neutral-300 ml-auto">{room.floor}</span>}
        </div>
      </div>

      {/* Hover actions */}
      <div className={`px-4 pb-3 flex items-center gap-2 transition-all duration-200 ${hovered ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden pb-0'}`}>
        {room.status === 'occupied' && (
          <button
            onClick={() => onRelease(room._id)}
            className="text-[11px] text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 transition"
          >
            <ArrowRightLeft className="h-3 w-3" /> Release
          </button>
        )}
        <button
          onClick={() => onDelete(room._id)}
          className="text-[11px] text-neutral-400 hover:text-red-500 font-medium flex items-center gap-1 transition ml-auto"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      </div>
    </div>
  );
}
