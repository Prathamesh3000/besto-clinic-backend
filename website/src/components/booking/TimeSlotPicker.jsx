import { useMemo } from 'react';
import { Loader2, Calendar, Sun, Sunset, Moon } from 'lucide-react';

/**
 * Group slots into Morning / Afternoon / Evening and render as a chip grid.
 *
 * @param {Array}    slots        - [{ startTime, endTime, display, available }]
 * @param {Object}   selectedSlot - Currently selected slot object
 * @param {function} onSlotSelect - (slot) => void
 * @param {boolean}  loading      - Show skeleton
 * @param {boolean}  isOnLeave    - Show leave message
 * @param {boolean}  isOffDay     - Show off-day message
 * @param {string}   leaveReason  - Optional leave reason text
 * @param {boolean}  compact      - Smaller variant
 */
export default function TimeSlotPicker({
  slots = [],
  selectedSlot,
  onSlotSelect,
  loading = false,
  isOnLeave = false,
  isOffDay = false,
  leaveReason,
  compact = false,
}) {
  const groups = useMemo(() => {
    const morning = [];
    const afternoon = [];
    const evening = [];

    for (const slot of slots) {
      const hour = parseInt(slot.display.split(':')[0], 10);
      if (hour < 12) morning.push(slot);
      else if (hour < 17) afternoon.push(slot);
      else evening.push(slot);
    }

    return [
      { key: 'morning', label: 'Morning', icon: Sun, slots: morning, color: 'text-amber-500' },
      { key: 'afternoon', label: 'Afternoon', icon: Sunset, slots: afternoon, color: 'text-orange-500' },
      { key: 'evening', label: 'Evening', icon: Moon, slots: evening, color: 'text-indigo-500' },
    ].filter((g) => g.slots.length > 0);
  }, [slots]);

  const availableCount = slots.filter((s) => s.available).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
      </div>
    );
  }

  // Contextual empty states
  if (isOnLeave) {
    return (
      <div className="text-center py-6 bg-amber-50/50 rounded-xl border border-amber-200/40">
        <Calendar className="w-6 h-6 text-amber-400 mx-auto mb-2" />
        <p className="text-xs font-medium text-amber-700">Doctor is on leave</p>
        {leaveReason && <p className="text-[10px] text-amber-600/60 mt-0.5">{leaveReason}</p>}
      </div>
    );
  }

  if (isOffDay) {
    return (
      <div className="text-center py-6 bg-neutral-50/50 rounded-xl border border-neutral-200/40">
        <Calendar className="w-6 h-6 text-neutral-900/20 mx-auto mb-2" />
        <p className="text-xs text-neutral-900/40">Not available on this day</p>
        <p className="text-[10px] text-neutral-900/25 mt-0.5">Try another date</p>
      </div>
    );
  }

  if (availableCount === 0 && slots.length > 0) {
    return (
      <div className="text-center py-6 bg-red-50/40 rounded-xl border border-red-200/30">
        <Calendar className="w-6 h-6 text-red-300 mx-auto mb-2" />
        <p className="text-xs text-red-600/70">Fully booked for this date</p>
        <p className="text-[10px] text-red-400/60 mt-0.5">Try another date</p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="text-center py-6 bg-neutral-50/50 rounded-xl border border-neutral-200/40">
        <Calendar className="w-6 h-6 text-neutral-900/20 mx-auto mb-2" />
        <p className="text-xs text-neutral-900/40">No available slots for this date</p>
        <p className="text-[10px] text-neutral-900/25 mt-0.5">Try another date</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(({ key, label, icon: Icon, slots: groupSlots, color }) => {
        const availCount = groupSlots.filter((s) => s.available).length;
        return (
          <div key={key}>
            {/* Section header */}
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              <span className={`font-semibold text-neutral-900/70 ${compact ? 'text-[11px]' : 'text-xs'}`}>{label}</span>
              <span className={`text-neutral-900/30 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                {availCount} slot{availCount !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Slot chips */}
            <div className={`grid gap-1.5 ${compact ? 'grid-cols-3' : 'grid-cols-4'}`}>
              {groupSlots.map((s) => (
                <button
                  key={s.startTime}
                  disabled={!s.available}
                  onClick={() => s.available && onSlotSelect(s)}
                  className={`px-2 py-2 rounded-lg transition font-medium ${compact ? 'text-[11px]' : 'text-xs'} ${
                    !s.available
                      ? 'bg-neutral-100/60 text-neutral-900/15 cursor-not-allowed line-through'
                      : selectedSlot?.startTime === s.startTime
                        ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/20 cursor-pointer'
                        : 'bg-neutral-50 text-neutral-900/65 border border-neutral-200/60 hover:border-primary-300 hover:bg-primary-50/50 cursor-pointer'
                  }`}
                >
                  {s.display}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
