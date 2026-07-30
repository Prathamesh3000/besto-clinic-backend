import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Video, MessageSquare, CheckCircle2 } from 'lucide-react';
import { Modal } from '../../../platform/components/shared';
import { btnPrimary, btnSecondary, formatTime, Badge } from './shared';

export default function DoctorEmergencyModal({
  open, onClose, emergency, room, accepting, onAccept,
}) {
  return (
    <Modal open={open} onClose={onClose} title="Emergency Session Request">
      <AnimatePresence>
        {emergency && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl border border-red-100">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-red-800">
                  {emergency.patientName || emergency.patient?.name || 'Unknown Patient'}
                </p>
                <p className="text-xs text-red-600/70">
                  {emergency.reason || emergency.description || 'Emergency consultation requested'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge color={emergency.type === 'video' ? 'purple' : 'blue'}>
                {emergency.type === 'video' ? (
                  <span className="flex items-center gap-1"><Video className="h-3 w-3" /> Video</span>
                ) : (
                  <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Chat</span>
                )}
              </Badge>
              <span className="text-xs text-neutral-900/40">
                Requested {formatTime(emergency.createdAt || new Date())}
              </span>
            </div>

            {room && (
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <p className="text-sm font-medium text-emerald-700 mb-2">
                  Session accepted! Room is ready.
                </p>
                <button className={`${btnPrimary} w-full text-center flex items-center justify-center gap-2`}>
                  <Video className="h-4 w-4" /> Join Call
                </button>
              </div>
            )}

            {!room && (
              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className={`${btnSecondary} flex-1`}>
                  Dismiss
                </button>
                <button
                  onClick={onAccept}
                  disabled={accepting}
                  className="flex-1 px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-red-600 hover:bg-red-700 shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {accepting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Accepting...
                    </span>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4" /> Accept</>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
