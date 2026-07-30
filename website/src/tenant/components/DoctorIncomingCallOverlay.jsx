/**
 * Tenant-side incoming-call overlay (doctor variant).
 *
 * Thin wrapper around the shared <IncomingCallOverlay> that:
 *   - Routes accept → /clinic/telemedicine/:id
 *   - Declines via tenant's declineVideoSession endpoint
 *   - Renders a triage preview (symptoms, pain, vitals) when the call is an
 *     emergency, so the doctor has clinical context before accepting.
 *
 * The triage payload is carried on the incoming-call event (backend's
 * videoHandler/emergency.service include it in the call payload when the
 * session has emergency metadata). When absent, the preview is hidden.
 */
import React from 'react';
import { AlertTriangle, Activity, Thermometer } from 'lucide-react';
import { IncomingCallOverlay } from '../../lib/telemedicine/IncomingCallOverlay';
import { declineVideoSession } from '../api';

function TriagePreview({ call }) {
  const triage = call?.triage || call?.emergency || null;
  const pain = triage?.painScore ?? call?.painScore;
  const symptoms = triage?.symptoms || call?.symptoms;
  const vitals = triage?.vitals;

  if (!pain && !symptoms && !vitals && !triage?.notes) return null;

  const painTone = pain == null
    ? null
    : pain >= 8 ? 'bg-rose-500/30 ring-rose-200'
    : pain >= 5 ? 'bg-amber-500/30 ring-amber-200'
    : 'bg-white/15 ring-white/25';

  return (
    <div className="rounded-2xl bg-white/10 backdrop-blur-sm ring-1 ring-white/15 p-3 text-left space-y-2">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/80">
        <AlertTriangle className="w-3.5 h-3.5" />
        Patient triage snapshot
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pain != null && (
          <span className={`inline-flex items-center text-[11px] text-white px-2 py-0.5 rounded-full ring-1 ${painTone}`}>
            Pain score · {pain}/10
          </span>
        )}
        {Array.isArray(symptoms) && symptoms.slice(0, 4).map((s) => (
          <span key={s} className="inline-flex items-center text-[11px] text-white bg-white/15 px-2 py-0.5 rounded-full ring-1 ring-white/20">
            {s}
          </span>
        ))}
        {typeof symptoms === 'string' && symptoms.trim() && (
          <span className="inline-flex items-center text-[11px] text-white bg-white/15 px-2 py-0.5 rounded-full ring-1 ring-white/20">
            {symptoms}
          </span>
        )}
      </div>
      {vitals && (
        <div className="flex flex-wrap gap-3 text-[11px] text-white/85">
          {vitals.bp && <span className="inline-flex items-center gap-1"><Activity className="w-3 h-3" /> BP {vitals.bp}</span>}
          {vitals.temp && <span className="inline-flex items-center gap-1"><Thermometer className="w-3 h-3" /> {vitals.temp}°</span>}
          {vitals.hr && <span className="inline-flex items-center gap-1"><Activity className="w-3 h-3" /> HR {vitals.hr}</span>}
          {vitals.spo2 && <span className="inline-flex items-center gap-1">SpO₂ {vitals.spo2}%</span>}
        </div>
      )}
      {triage?.notes && (
        <p className="text-[11px] text-white/85 leading-snug line-clamp-2">{triage.notes}</p>
      )}
    </div>
  );
}

export function DoctorIncomingCallOverlay() {
  return (
    <IncomingCallOverlay
      resolveRoute={(call) => `/clinic/telemedicine/${call.sessionId}`}
      accentClassName="from-primary-700 via-primary-800 to-neutral-950"
      onDecline={(sid, reason) => declineVideoSession(sid, { reason })}
      contextSlot={(call) => <TriagePreview call={call} />}
    />
  );
}

export default DoctorIncomingCallOverlay;
