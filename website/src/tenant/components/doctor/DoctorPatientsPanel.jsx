import {
  Users, CalendarDays, Phone, Mail, MapPin, AlertCircle,
} from 'lucide-react';
import {
  Modal, StatusBadge, DataTable, Pagination, ErrorAlert,
} from '../../../platform/components/shared';
import {
  cardCls, btnPrimary, formatDate, formatTime,
  ApptBadge, Badge, SkeletonLoader, SearchInput, EmptyState,
} from './shared';

// ─── Patient table columns ──────────────────────────
const patientColumns = [
  {
    key: 'name',
    label: 'Name',
    render: (row) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-xs font-bold text-primary-700">
          {(row.firstName || row.name || '?')[0].toUpperCase()}
        </div>
        <span className="text-sm font-medium text-neutral-900">
          {row.firstName ? `${row.firstName} ${row.lastName || ''}` : row.name || 'Unknown'}
        </span>
      </div>
    ),
  },
  {
    key: 'phone',
    label: 'Phone',
    render: (row) => <span className="text-sm text-neutral-900/70">{row.phone || '--'}</span>,
  },
  {
    key: 'gender',
    label: 'Gender',
    render: (row) => {
      const g = row.gender || 'other';
      const colors = { male: 'blue', female: 'purple', other: 'amber' };
      return <Badge color={colors[g] || 'primary'}>{g}</Badge>;
    },
  },
];

export default function DoctorPatientsPanel({
  patients, loading, error, search, onSearchChange,
  page, total, limit, onPageChange, onRowClick, onRetry,
  // Detail modal props
  selectedPatient, patientDetail, patientAppts, patientRx,
  detailLoading, detailTab, setDetailTab, closePatientDetail,
}) {
  const getPatientName = (p) => p?.firstName ? `${p.firstName} ${p.lastName || ''}` : p?.name || 'Patient';

  return (
    <>
      {/* Patients Table */}
      {error ? (
        <div className="space-y-4">
          <ErrorAlert message={error} />
          <button onClick={onRetry} className={btnPrimary}>Retry</button>
        </div>
      ) : (
        <div className={`${cardCls} p-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-50">
                <Users className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold font-display text-neutral-900 text-sm">My Patients</h3>
                <p className="text-[11px] text-neutral-900/30">{total} patient{total !== 1 ? 's' : ''} total</p>
              </div>
            </div>
            <div className="w-full sm:w-72">
              <SearchInput value={search} onChange={onSearchChange} placeholder="Search patients by name, ID, phone..." />
            </div>
          </div>

          {loading ? (
            <div className="space-y-3"><SkeletonLoader className="h-12 w-full" count={5} /></div>
          ) : patients.length === 0 ? (
            <EmptyState
              icon={Users}
              title={search ? 'No patients found' : 'No patients yet'}
              message={search ? 'Try adjusting your search terms' : 'Patients you have consulted will appear here'}
            />
          ) : (
            <>
              <DataTable columns={patientColumns} data={patients} onRowClick={onRowClick} />
              {total > limit && <Pagination page={page} limit={limit} total={total} onChange={onPageChange} />}
            </>
          )}
        </div>
      )}

      {/* Patient Detail Modal */}
      <Modal
        open={!!selectedPatient}
        onClose={closePatientDetail}
        title={patientDetail ? getPatientName(patientDetail) : selectedPatient ? getPatientName(selectedPatient) : 'Patient Details'}
        wide
      >
        {detailLoading ? (
          <div className="space-y-4 py-4">
            <SkeletonLoader className="h-8 w-48" />
            <SkeletonLoader className="h-32 w-full" />
            <SkeletonLoader className="h-24 w-full" />
          </div>
        ) : (
          <div>
            {/* Tab bar */}
            <div className="flex gap-1 border-b border-neutral-300/60 mb-5">
              {[
                { key: 'info', label: 'Info' },
                { key: 'appointments', label: `Appointments (${patientAppts.length})` },
                { key: 'prescriptions', label: `Prescriptions (${patientRx.length})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setDetailTab(tab.key)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    detailTab === tab.key
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-neutral-900/40 hover:text-neutral-900/60 hover:border-neutral-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Info Tab */}
            {detailTab === 'info' && patientDetail && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-lg font-bold text-primary-700">
                    {(patientDetail.firstName || patientDetail.name || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-neutral-900">{getPatientName(patientDetail)}</h4>
                    <p className="text-xs text-neutral-900/40">{patientDetail.phone || ''}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <InfoCell label="Gender" value={patientDetail.gender || '--'} capitalize />
                  <InfoCell
                    label="DOB / Age"
                    value={
                      patientDetail.dateOfBirth
                        ? `${new Date(patientDetail.dateOfBirth).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} (${Math.floor((Date.now() - new Date(patientDetail.dateOfBirth)) / 31536000000)} yrs)`
                        : patientDetail.age ? `${patientDetail.age} yrs` : '--'
                    }
                  />
                  <InfoCell label="Blood Group" value={patientDetail.bloodGroup || '--'} />
                  <InfoCell label="Phone" value={patientDetail.phone || '--'} icon={Phone} />
                  <InfoCell label="Email" value={patientDetail.email || '--'} icon={Mail} truncate />
                  {patientDetail.address && (
                    <InfoCell
                      label="Address"
                      icon={MapPin}
                      value={
                        typeof patientDetail.address === 'string'
                          ? patientDetail.address
                          : [patientDetail.address.street, patientDetail.address.city, patientDetail.address.state, patientDetail.address.zip].filter(Boolean).join(', ') || '--'
                      }
                    />
                  )}
                </div>

                {patientDetail.allergies?.length > 0 && (
                  <div className="p-4 bg-red-50/60 rounded-xl border border-red-100/60">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <p className="text-xs font-semibold text-red-700">Allergies</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(Array.isArray(patientDetail.allergies) ? patientDetail.allergies : [patientDetail.allergies]).map((a, ai) => (
                        <span key={ai} className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-medium">
                          {typeof a === 'string' ? a : a.name || a.allergen || 'Unknown'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {patientDetail.medicalHistory && (
                  <div className="p-4 bg-amber-50/40 rounded-xl border border-amber-100/60">
                    <p className="text-xs font-semibold text-amber-700 mb-2">Medical History</p>
                    <p className="text-sm text-neutral-900/60 leading-relaxed">
                      {typeof patientDetail.medicalHistory === 'string'
                        ? patientDetail.medicalHistory
                        : Array.isArray(patientDetail.medicalHistory)
                          ? patientDetail.medicalHistory.join(', ')
                          : '--'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Appointments Tab */}
            {detailTab === 'appointments' && (
              patientAppts.length === 0 ? (
                <EmptyState icon={CalendarDays} title="No appointments found" message="No appointment history with this patient" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-300/60 bg-neutral-50/50">
                        <th className="text-left py-3 px-4 text-[11px] font-semibold text-neutral-900/40 uppercase tracking-wider">Date</th>
                        <th className="text-left py-3 px-4 text-[11px] font-semibold text-neutral-900/40 uppercase tracking-wider">Type</th>
                        <th className="text-left py-3 px-4 text-[11px] font-semibold text-neutral-900/40 uppercase tracking-wider">Reason</th>
                        <th className="text-left py-3 px-4 text-[11px] font-semibold text-neutral-900/40 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patientAppts.map((a, i) => (
                        <tr key={a._id || a.id || i} className="border-b border-neutral-300/30 last:border-0">
                          <td className="py-3 px-4 text-neutral-900/70">
                            {formatDate(a.scheduledAt || a.date || a.appointmentDate)}
                            <span className="block text-[11px] text-neutral-900/30">{formatTime(a.scheduledAt || a.date || a.startTime)}</span>
                          </td>
                          <td className="py-3 px-4 text-neutral-900/70 capitalize">{a.type || a.appointmentType || 'Consultation'}</td>
                          <td className="py-3 px-4 text-neutral-900/50 text-xs max-w-[200px] truncate">{a.reason || '--'}</td>
                          <td className="py-3 px-4"><ApptBadge status={a.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Prescriptions Tab */}
            {detailTab === 'prescriptions' && (
              patientRx.length === 0 ? (
                <EmptyState icon={CalendarDays} title="No prescriptions found" message="No prescription history for this patient" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-300/60 bg-neutral-50/50">
                        <th className="text-left py-3 px-4 text-[11px] font-semibold text-neutral-900/40 uppercase tracking-wider">Date</th>
                        <th className="text-left py-3 px-4 text-[11px] font-semibold text-neutral-900/40 uppercase tracking-wider">Diagnosis</th>
                        <th className="text-left py-3 px-4 text-[11px] font-semibold text-neutral-900/40 uppercase tracking-wider">Medications</th>
                        <th className="text-left py-3 px-4 text-[11px] font-semibold text-neutral-900/40 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patientRx.map((rx, i) => {
                        const meds = rx.medications || rx.prescription || [];
                        return (
                          <tr key={rx._id || rx.id || i} className="border-b border-neutral-300/30 last:border-0">
                            <td className="py-3 px-4 text-neutral-900/70">{formatDate(rx.createdAt || rx.date)}</td>
                            <td className="py-3 px-4 text-neutral-900/70 max-w-[200px] truncate">{rx.diagnosis || '--'}</td>
                            <td className="py-3 px-4">
                              <div className="flex flex-wrap gap-1">
                                {Array.isArray(meds) && meds.length > 0 ? (
                                  meds.slice(0, 3).map((m, mi) => (
                                    <span key={mi} className="text-[11px] px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-medium">
                                      {m.medication || m.name || 'Med'}
                                    </span>
                                  ))
                                ) : <span className="text-neutral-900/30 text-xs">--</span>}
                                {Array.isArray(meds) && meds.length > 3 && (
                                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-neutral-200 text-neutral-900/50">+{meds.length - 3} more</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4"><StatusBadge status={rx.status || 'active'} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

// ─── Small helper component ─────────────────────────
function InfoCell({ label, value, icon: Icon, capitalize, truncate }) {
  return (
    <div className={`p-3 bg-neutral-50/50 rounded-xl ${Icon ? 'flex items-start gap-2' : ''}`}>
      {Icon && <Icon className="h-3.5 w-3.5 text-neutral-900/30 mt-0.5 shrink-0" />}
      <div>
        <p className="text-[10px] text-neutral-900/30 uppercase tracking-wider mb-1">{label}</p>
        <p className={`text-sm font-medium text-neutral-900 ${capitalize ? 'capitalize' : ''} ${truncate ? 'truncate' : ''}`}>{value}</p>
      </div>
    </div>
  );
}
