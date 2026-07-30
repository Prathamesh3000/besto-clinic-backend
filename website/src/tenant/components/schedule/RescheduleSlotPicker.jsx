import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Calendar, Clock, Loader, ArrowLeft, Check } from 'lucide-react';
import { getNextAvailableSlots } from '../../api';

const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const btnPrimary = 'px-4 py-2.5 text-sm font-medium rounded-xl bg-primary-600 hover:bg-primary-700 text-white transition-all';
const btnOutline = 'px-4 py-2.5 text-sm font-medium rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-all';

export default function RescheduleSlotPicker({ appointment, doctorId, branchId, onConfirm, onBack, loading: externalLoading }) {
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [customMode, setCustomMode] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');

  useEffect(() => {
    setLoadingSlots(true);
    getNextAvailableSlots({
      doctorId,
      branchId,
      afterDate: new Date().toISOString(),
      limit: 5,
    })
      .then((res) => setSlots(res.data || res || []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [doctorId, branchId]);

  const handleConfirm = () => {
    if (customMode && customDate && customTime) {
      onConfirm(new Date(`${customDate}T${customTime}:00`).toISOString());
    } else if (selectedSlot) {
      onConfirm(selectedSlot.scheduledAt);
    }
  };

  const canConfirm = customMode ? (customDate && customTime) : !!selectedSlot;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors">
          <ArrowLeft className="h-4 w-4 text-neutral-500" />
        </button>
        <h4 className="text-sm font-semibold text-neutral-900">Select New Time Slot</h4>
      </div>

      {loadingSlots ? (
        <div className="flex items-center justify-center py-8">
          <Loader className="h-5 w-5 text-primary-500 animate-spin" />
        </div>
      ) : !customMode ? (
        <>
          {slots.length > 0 ? (
            <div className="space-y-2">
              {slots.map((slot, i) => {
                const isSelected = selectedSlot?.scheduledAt === slot.scheduledAt;
                const slotDate = new Date(slot.scheduledAt);
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedSlot(slot)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-primary-400 bg-primary-50 ring-2 ring-primary-100'
                        : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'border-primary-600 bg-primary-600' : 'border-neutral-300'
                    }`}>
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                        <span className="text-sm font-medium text-neutral-900">
                          {format(slotDate, 'EEE, MMM d, yyyy')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Clock className="h-3.5 w-3.5 text-neutral-400" />
                        <span className="text-xs text-neutral-600">
                          {slot.startTime} – {slot.endTime}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-neutral-500 text-center py-4">No available slots found in the next 30 days.</p>
          )}

          <button
            onClick={() => { setCustomMode(true); setSelectedSlot(null); }}
            className="w-full text-sm text-primary-600 hover:text-primary-700 font-medium py-2 transition-colors"
          >
            Pick custom date & time
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1.5">Date</label>
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1.5">Time</label>
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              className="w-full px-3 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
            />
          </div>
          <button
            onClick={() => { setCustomMode(false); setCustomDate(''); setCustomTime(''); }}
            className="text-sm text-neutral-500 hover:text-neutral-700 font-medium transition-colors"
          >
            Back to suggested slots
          </button>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button onClick={onBack} className={btnOutline}>Cancel</button>
        <button
          onClick={handleConfirm}
          disabled={!canConfirm || externalLoading}
          className={`${btnPrimary} flex-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
        >
          {externalLoading ? <Loader className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Confirm Reschedule
        </button>
      </div>
    </div>
  );
}
