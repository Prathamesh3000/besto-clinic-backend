import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, Shield, Eye, PenLine, Clock, Loader2,
  CheckCircle2, AlertCircle, Sparkles, XCircle,
  Share2, Stethoscope, FlaskConical, Megaphone,
} from 'lucide-react';
import {
  listPatientConsents, approveConsent, revokePatientConsent,
} from '../api';
import { useSafePatientAuth } from '../../hooks/useSafeAuth';
import { ConfirmDialog } from '../../platform/components/shared';
import { stripDrPrefix } from '../../utils/doctorName';

/* ─── Shared design tokens ────────────────────── */

const CARD = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';

function Shimmer({ className = '' }) {
  return <div className={`animate-pulse bg-neutral-200/60 rounded-xl ${className}`} />;
}

/* ─── Formatters ──────────────────────────────── */

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function timeLeft(expiresAt) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / 86400000);
  if (days > 30) return `${Math.floor(days / 30)} months left`;
  if (days > 0) return `${days}d left`;
  const hours = Math.floor(diff / 3600000);
  return `${hours}h left`;
}

/* ─── Config ──────────────────────────────────── */

const CONSENT_TYPE = {
  data_sharing: { label: 'Data Sharing',  icon: Share2,       bg: 'bg-blue-50',      text: 'text-blue-700',      dot: 'bg-blue-500',      iconClr: 'text-blue-600' },
  treatment:    { label: 'Treatment',     icon: Stethoscope,  bg: 'bg-primary-50',   text: 'text-primary-700',   dot: 'bg-primary-500',   iconClr: 'text-primary-600' },
  research:     { label: 'Research',      icon: FlaskConical,  bg: 'bg-amber-50',     text: 'text-amber-700',     dot: 'bg-amber-500',     iconClr: 'text-amber-600' },
  marketing:    { label: 'Marketing',     icon: Megaphone,    bg: 'bg-violet-50',    text: 'text-violet-700',    dot: 'bg-violet-500',    iconClr: 'text-violet-600' },
};

const STATUS = {
  active:  { label: 'Active',  bg: 'bg-secondary-50', text: 'text-secondary-700', dot: 'bg-secondary-500' },
  revoked: { label: 'Revoked', bg: 'bg-red-50',       text: 'text-red-600',       dot: 'bg-red-400' },
  expired: { label: 'Expired', bg: 'bg-neutral-100',  text: 'text-neutral-500',   dot: 'bg-neutral-400' },
};

const SCOPE_LABEL = {
  read:       { label: 'Read Only',     icon: Eye,     cls: 'text-blue-600 bg-blue-50' },
  read_write: { label: 'Read & Write',  icon: PenLine, cls: 'text-violet-600 bg-violet-50' },
};

const VIEWS = [
  { key: 'all',     label: 'All' },
  { key: 'active',  label: 'Active' },
  { key: 'revoked', label: 'Revoked' },
  { key: 'expired', label: 'Expired' },
];

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

export default function PatientConsents() {
  const { activePatientId } = useSafePatientAuth();

  /* ── State ── */
  const [consents, setConsents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('all');
  const [toast, setToast] = useState(null);

  // Actions
  const [actionTarget, setActionTarget] = useState(null); // { consent, action: 'approve'|'revoke' }
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Fetch ── */

  const fetchConsents = useCallback(async () => {
    if (!activePatientId) return;
    setLoading(true);
    try {
      const res = await listPatientConsents(activePatientId);
      const d = res.data || res;
      setConsents(Array.isArray(d) ? d : []);
    } catch {
      setConsents([]);
    } finally {
      setLoading(false);
    }
  }, [activePatientId]);

  useEffect(() => {
    fetchConsents();
  }, [fetchConsents]);

  /* ── Actions ── */

  const handleAction = async () => {
    if (!actionTarget) return;
    setActing(true);
    try {
      if (actionTarget.action === 'approve') {
        await approveConsent(activePatientId, actionTarget.consent._id);
        setToast({ type: 'success', msg: 'Consent approved' });
      } else {
        await revokePatientConsent(activePatientId, actionTarget.consent._id);
        setToast({ type: 'success', msg: 'Consent revoked' });
      }
      setActionTarget(null);
      fetchConsents();
    } catch (err) {
      setToast({ type: 'error', msg: err?.message || 'Action failed' });
    } finally {
      setActing(false);
    }
  };

  /* ── Derived ── */

  const filtered = consents.filter((c) => {
    if (view === 'all') return true;
    return c.status === view;
  });

  const counts = {
    all: consents.length,
    active: consents.filter((c) => c.status === 'active').length,
    revoked: consents.filter((c) => c.status === 'revoked').length,
    expired: consents.filter((c) => c.status === 'expired').length,
  };

  /* ═══ RENDER ��══ */

  if (loading) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        <Shimmer className="h-10 w-56" />
        <Shimmer className="h-24 w-full" />
        <Shimmer className="h-64 w-full" />
      </div>
    );
  }

  // Zero-data welcome
  if (consents.length === 0) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-8 md:p-10 text-white animate-[fadeUp_0.4s_ease-out_both]">
          <h1 className="text-2xl md:text-3xl font-bold font-display leading-tight">
            Your Data, Your Control
          </h1>
          <p className="text-primary-100 text-sm md:text-base mt-2 max-w-xl leading-relaxed">
            Consents let you decide who can access your medical data and for what purpose.
            When a doctor or the clinic requests access, it will appear here for your approval.
          </p>
        </div>

        <div className={`${CARD} p-6 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">Consent types you may see</h2>
              <p className="text-xs text-neutral-500">Each type controls a different kind of access</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(CONSENT_TYPE).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <div key={key} className="flex items-start gap-3 p-4 rounded-xl bg-neutral-50 border border-neutral-100">
                  <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-5 w-5 ${cfg.iconClr}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-neutral-800">{cfg.label}</p>
                    <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
                      {key === 'data_sharing' && 'Allows sharing your records with other providers or services.'}
                      {key === 'treatment' && 'Gives a doctor access to view your records for treatment purposes.'}
                      {key === 'research' && 'Permits anonymized use of your data for medical research.'}
                      {key === 'marketing' && 'Allows the clinic to send you promotional communications.'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* ── Main data view ── */
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-[var(--shadow-lg)] text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-secondary-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]">
        <h1 className="text-2xl font-semibold font-display text-neutral-900">Consents</h1>
        <p className="text-sm text-neutral-600 mt-1">Review and manage who can access your data</p>
      </div>

      {/* Summary cards */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '100ms' }}
      >
        <SummaryCard label="Total" value={counts.all} Icon={Shield} iconBg="bg-neutral-100" iconClr="text-neutral-600" />
        <SummaryCard label="Active" value={counts.active} Icon={ShieldCheck} iconBg="bg-secondary-50" iconClr="text-secondary-600" />
        <SummaryCard label="Revoked" value={counts.revoked} Icon={XCircle} iconBg="bg-red-50" iconClr="text-red-500" />
        <SummaryCard label="Expired" value={counts.expired} Icon={Clock} iconBg="bg-neutral-100" iconClr="text-neutral-500" />
      </div>

      {/* Filter + List */}
      <div
        className={`${CARD} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
        style={{ animationDelay: '200ms' }}
      >
        {/* View tabs */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">All Consents</h2>
              <p className="text-xs text-neutral-500">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex bg-neutral-100 rounded-lg p-0.5 gap-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-all ${
                  view === v.key
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {v.label}
                {counts[v.key] > 0 && (
                  <span className="ml-1 text-[10px] tabular-nums">({counts[v.key]})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <EmptyState msg={`No ${view === 'all' ? '' : view + ' '}consents`} />
        ) : (
          <div className="space-y-2">
            {filtered.map((consent) => (
              <ConsentRow
                key={consent._id}
                consent={consent}
                onApprove={() => setActionTarget({ consent, action: 'approve' })}
                onRevoke={() => setActionTarget({ consent, action: 'revoke' })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={!!actionTarget}
        title={actionTarget?.action === 'approve' ? 'Approve Consent?' : 'Revoke Consent?'}
        message={
          actionTarget?.action === 'approve'
            ? 'This will grant access as described in the consent record.'
            : 'The requesting party will immediately lose access to your records under this consent.'
        }
        confirmLabel={acting ? (actionTarget?.action === 'approve' ? 'Approving...' : 'Revoking...') : (actionTarget?.action === 'approve' ? 'Approve' : 'Revoke')}
        confirmVariant={actionTarget?.action === 'approve' ? 'primary' : 'danger'}
        loading={acting}
        onConfirm={handleAction}
        onCancel={() => setActionTarget(null)}
      />
    </div>
  );
}

/* ─── Sub-components ──────────────────────────── */

function SummaryCard({ label, value, Icon, iconBg, iconClr }) {
  return (
    <div className={`${CARD} p-4 flex items-center gap-3`}>
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon className={`h-5 w-5 ${iconClr}`} />
      </div>
      <div>
        <p className="text-xl font-bold font-display tabular-nums text-neutral-900">{value}</p>
        <p className="text-[11px] font-medium text-neutral-500">{label}</p>
      </div>
    </div>
  );
}

function ConsentRow({ consent, onApprove, onRevoke }) {
  const typeCfg = CONSENT_TYPE[consent.consentType] || CONSENT_TYPE.data_sharing;
  const statusCfg = STATUS[consent.status] || STATUS.expired;
  const scopeCfg = SCOPE_LABEL[consent.scope] || SCOPE_LABEL.read;
  const TypeIcon = typeCfg.icon;
  const ScopeIcon = scopeCfg.icon;

  const isActive = consent.status === 'active';
  const canApprove = consent.status === 'revoked' || consent.status === 'expired';

  const doctorName = consent.grantedTo?.name
    ? `Dr. ${stripDrPrefix(consent.grantedTo.name)}`
    : null;

  return (
    <div className={`rounded-xl border transition-colors ${
      isActive
        ? 'bg-neutral-50 border-neutral-100 hover:bg-neutral-100/50 hover:border-neutral-200'
        : 'bg-neutral-50/50 border-neutral-100'
    }`}>
      <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Left: type icon + info */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl ${isActive ? typeCfg.bg : 'bg-neutral-100'} flex items-center justify-center shrink-0`}>
            <TypeIcon className={`h-5 w-5 ${isActive ? typeCfg.iconClr : 'text-neutral-400'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-semibold ${isActive ? 'text-neutral-900' : 'text-neutral-500'}`}>
                {typeCfg.label}
              </p>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${statusCfg.bg} ${statusCfg.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                {statusCfg.label}
              </span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${scopeCfg.cls}`}>
                <ScopeIcon className="h-3 w-3" />
                {scopeCfg.label}
              </span>
            </div>

            {/* Details */}
            <p className={`text-xs mt-0.5 ${isActive ? 'text-neutral-500' : 'text-neutral-400'}`}>
              {doctorName && <span>{doctorName} · </span>}
              Granted {fmtDate(consent.grantedAt || consent.createdAt)}
              {consent.revokedAt && <span> · Revoked {fmtDate(consent.revokedAt)}</span>}
            </p>

            {/* Purpose */}
            {consent.purpose && (
              <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                {consent.purpose}
              </p>
            )}

            {/* Expiry */}
            {consent.expiresAt && isActive && (
              <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {timeLeft(consent.expiresAt)}
              </p>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isActive && (
            <button
              onClick={onRevoke}
              className="h-9 px-3.5 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-all inline-flex items-center gap-1.5"
            >
              <XCircle className="h-3.5 w-3.5" /> Revoke
            </button>
          )}
          {canApprove && (
            <button
              onClick={onApprove}
              className="h-9 px-3.5 text-xs font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all inline-flex items-center gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ msg }) {
  return (
    <div className="py-10 flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-neutral-50 flex items-center justify-center">
        <ShieldCheck className="h-6 w-6 text-neutral-300" />
      </div>
      <p className="text-sm font-medium text-neutral-500">{msg}</p>
    </div>
  );
}
