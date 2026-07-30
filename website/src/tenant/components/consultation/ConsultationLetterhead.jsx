/**
 * ConsultationLetterhead - Professional clinic header component
 *
 * Reusable letterhead with clinic branding, doctor credentials, and patient details
 * Matches design pattern from ConsultationDetailView.jsx (lines 125-150)
 *
 * @version 1.0
 * @date April 2026
 */

import { MapPin, Phone, Mail, BadgeCheck } from 'lucide-react';
import { resolveAssetUrl } from '../../../lib/assetUrl';
import { stripDrPrefix } from '../../../utils/doctorName';

/* ── Helper Functions ──────────────────────────────────── */

function calculateAge(dob) {
  if (!dob) return '--';
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function formatDate(d) {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const genderMap = { male: 'M', female: 'F', other: 'O', prefer_not_to_say: '--' };

/* ── DetailField Component ─────────────────────────────── */

function DetailField({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-neutral-900/35 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-neutral-900 border-b border-neutral-300/40 pb-0.5">
        {value || '--'}
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main Component — Professional Clinic Letterhead
   ══════════════════════════════════════════════════════════ */

export default function ConsultationLetterhead({
  clinic,
  doctor,
  patient,
  appointment,
  status,
}) {
  const addr = clinic?.address;
  const addressLine = [addr?.street, addr?.city, addr?.state, addr?.zipCode].filter(Boolean).join(', ');

  const patientName = patient?.firstName
    ? `${patient.firstName} ${patient.lastName || ''}`.trim()
    : patient?.name || 'Patient';

  const patientAge = calculateAge(patient?.dateOfBirth);
  const patientGender = genderMap[patient?.gender] || '--';
  const appointmentDate = formatDate(appointment?.scheduledAt || new Date());

  return (
    <div className="bg-white rounded-2xl shadow-[var(--shadow-sm)] border border-neutral-300/60 overflow-hidden print:shadow-none print:border-0 print:rounded-none">
      {/* ═══ Clinic Letterhead (Gradient Header) ═══ */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 px-6 py-4 print:py-3">
        <div className="flex items-center gap-3">
          {/* Clinic Logo */}
          {clinic?.logo && (
            <img
              src={resolveAssetUrl(clinic.logo)}
              alt={clinic.name}
              className="w-12 h-12 rounded-lg object-contain bg-white/15 p-1 shrink-0"
            />
          )}

          {/* Clinic Info */}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white tracking-wide truncate">
              {clinic?.name || 'Clinic'}
            </h2>
            {addressLine && (
              <p className="text-xs text-white/80 mt-0.5 flex items-center gap-1.5">
                <MapPin className="h-3 w-3 shrink-0" /> {addressLine}
              </p>
            )}
            <p className="text-xs text-white/70 mt-0.5">
              {clinic?.phone && (
                <>
                  <Phone className="h-3 w-3 inline mr-1" />{clinic.phone}
                </>
              )}
              {clinic?.phone && clinic?.email && <span className="mx-2">|</span>}
              {clinic?.email && (
                <>
                  <Mail className="h-3 w-3 inline mr-1" />{clinic.email}
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ═══ Doctor Info Bar ═══ */}
      <div className="flex items-center justify-between px-6 py-2 bg-primary-50/60 border-b border-neutral-300/40">
        <div>
          <p className="text-sm font-semibold text-primary-800">
            Dr. {stripDrPrefix(doctor?.name || 'Doctor')}
          </p>
          {doctor?.specialization && (
            <p className="text-xs text-primary-700/70">{doctor.specialization}</p>
          )}
        </div>
        {(doctor?.licenseNumber || doctor?.registrationNumber) && (
          <div className="flex items-center gap-1 text-xs text-primary-700/70">
            <BadgeCheck className="h-3 w-3" />
            <span>Reg: {doctor.licenseNumber || doctor.registrationNumber}</span>
          </div>
        )}
      </div>

      {/* ═══ Patient Details Grid ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 px-6 py-3 border-b border-neutral-300/40">
        <DetailField label="Patient Name" value={patientName} />
        <DetailField label="Age / Gender" value={`${patientAge} yrs / ${patientGender}`} />
        <DetailField label="Date" value={appointmentDate} />
        <DetailField label="Status" value={status || 'Active'} />
      </div>
    </div>
  );
}
