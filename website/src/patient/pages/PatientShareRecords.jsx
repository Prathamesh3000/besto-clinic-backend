import { useState, useEffect, useCallback } from 'react';
import {
  Share2, Link2, Copy, Eye, Clock, Shield, Loader2,
  CheckCircle2, AlertCircle, Sparkles, Plus, X,
  FileText, Pill, Receipt, Layers, Trash2, ExternalLink,
} from 'lucide-react';
import {
  createShareToken, listShareTokens, revokeShareToken,
} from '../api';
import { useSafePatientAuth } from '../../hooks/useSafeAuth';
import { ConfirmDialog } from '../../platform/components/shared';

/* ─── Shared design tokens ────────────────────── */

const CARD = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';

function Shimmer({ className = '' }) {
  return <div className={`animate-pulse bg-neutral-200/60 rounded-xl ${className}`} />;
}

/* ─── Formatters ──────────────────────────────── */

const fmtDate = (d) => {
  const dt = new Date(d); const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dt.getUTCDate()} ${months[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
};

const fmtDateTime = (d) => {
  const dt = new Date(d); const h = dt.getUTCHours(); const m = dt.getUTCMinutes();
  const time = `${String(h % 12 || 12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
  return `${fmtDate(d)}, ${time}`;
};

function timeLeft(expiresAt) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m left`;
  }
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

/* ─── Config ──────────────────────────────────── */

const RECORD_TYPE = {
  treatment:    { label: 'Treatment Record', icon: FileText,  bg: 'bg-blue-50',      text: 'text-blue-700',      dot: 'bg-blue-500',      iconClr: 'text-blue-600' },
  prescription: { label: 'Prescription',     icon: Pill,      bg: 'bg-violet-50',    text: 'text-violet-700',    dot: 'bg-violet-500',    iconClr: 'text-violet-600' },
  invoice:      { label: 'Invoice',          icon: Receipt,   bg: 'bg-amber-50',     text: 'text-amber-700',     dot: 'bg-amber-500',     iconClr: 'text-amber-600' },
  all:          { label: 'All Records',      icon: Layers,    bg: 'bg-secondary-50', text: 'text-secondary-700', dot: 'bg-secondary-500', iconClr: 'text-secondary-600' },
};

const EXPIRY_OPTIONS = [
  { value: 1,   label: '1 hour' },
  { value: 6,   label: '6 hours' },
  { value: 24,  label: '1 day' },
  { value: 72,  label: '3 days' },
  { value: 168, label: '1 week' },
  { value: 720, label: '30 days' },
];

const inputCls =
  'w-full px-3 py-2.5 border border-neutral-200 rounded-xl text-sm bg-neutral-50/50 text-neutral-900 placeholder:text-neutral-400 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all';

const labelCls = 'block text-xs font-semibold text-neutral-500 mb-1.5';

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

export default function PatientShareRecords() {
  const { activePatientId } = useSafePatientAuth();

  /* ── State ── */
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    recordType: 'all',
    sharedWith: '',
    expiresInHours: 24,
    maxAccesses: 10,
  });
  const [creating, setCreating] = useState(false);

  // Revoke confirm
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);

  // Copied indicator
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Fetch ── */

  const fetchTokens = useCallback(async () => {
    if (!activePatientId) return;
    setLoading(true);
    try {
      const res = await listShareTokens(activePatientId);
      const d = res.data || res;
      setTokens(Array.isArray(d) ? d : []);
    } catch {
      setTokens([]);
    } finally {
      setLoading(false);
    }
  }, [activePatientId]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  /* ── Actions ── */

  const handleCreate = async (e) => {
    e.preventDefault();
    if (createForm.recordType !== 'all' && !createForm.recordId) {
      setToast({ type: 'error', msg: `Please select a specific ${createForm.recordType} record to share` });
      return;
    }
    setCreating(true);
    try {
      const payload = {
        recordType: createForm.recordType,
        expiresInHours: createForm.expiresInHours,
        maxAccesses: createForm.maxAccesses,
      };
      if (createForm.sharedWith.trim()) {
        payload.sharedWith = createForm.sharedWith.trim();
      }
      const res = await createShareToken(activePatientId, payload);
      const newToken = res.data || res;
      setToast({ type: 'success', msg: 'Share link created' });
      setShowCreate(false);
      setCreateForm({ recordType: 'all', sharedWith: '', expiresInHours: 24, maxAccesses: 10 });
      fetchTokens();

      // Auto-copy the new link
      if (newToken?.token) {
        const slug = localStorage.getItem('tenant_slug') || '';
        const url = `${window.location.origin}/shared/${newToken.token}${slug ? `?tenant=${encodeURIComponent(slug)}` : ''}`;
        try { await navigator.clipboard.writeText(url); } catch { /* noop */ }
      }
    } catch (err) {
      setToast({ type: 'error', msg: err?.message || 'Could not create share link' });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeShareToken(activePatientId, revokeTarget._id);
      setToast({ type: 'success', msg: 'Share link revoked' });
      setRevokeTarget(null);
      fetchTokens();
    } catch (err) {
      setToast({ type: 'error', msg: err?.message || 'Could not revoke' });
    } finally {
      setRevoking(false);
    }
  };

  const copyLink = async (token) => {
    const slug = localStorage.getItem('tenant_slug') || '';
    const url = `${window.location.origin}/shared/${token.token}${slug ? `?tenant=${encodeURIComponent(slug)}` : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(token._id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setToast({ type: 'error', msg: 'Failed to copy' });
    }
  };

  /* ═══ RENDER ═══ */

  // Loading skeleton
  if (loading) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        <Shimmer className="h-10 w-56" />
        <Shimmer className="h-32 w-full" />
        <Shimmer className="h-64 w-full" />
      </div>
    );
  }

  const activeTokens = tokens.filter((t) => !t.isRevoked && new Date(t.expiresAt) > new Date());
  const expiredOrRevoked = tokens.filter((t) => t.isRevoked || new Date(t.expiresAt) <= new Date());

  // Zero-data welcome
  if (tokens.length === 0) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        {/* Hero */}
        <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-8 md:p-10 text-white animate-[fadeUp_0.4s_ease-out_both]">
          <h1 className="text-2xl md:text-3xl font-bold font-display leading-tight">
            Share Your Records Securely
          </h1>
          <p className="text-primary-100 text-sm md:text-base mt-2 max-w-xl leading-relaxed">
            Generate secure, time-limited links to share your medical records with other doctors,
            family members, or anyone who needs access. Every view is tracked.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-6 h-12 px-7 text-sm font-bold bg-white text-primary-700 rounded-xl hover:bg-primary-50 shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2"
          >
            <Plus className="h-5 w-5" /> Create Share Link
          </button>
        </div>

        {/* Features */}
        <div className={`${CARD} p-6 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">How it works</h2>
              <p className="text-xs text-neutral-500">Safe, trackable sharing in three steps</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: Link2,
                iconBg: 'bg-blue-50', iconClr: 'text-blue-600',
                title: 'Generate a link',
                desc: 'Choose which records to share and set an expiry time and access limit.',
              },
              {
                icon: Share2,
                iconBg: 'bg-violet-50', iconClr: 'text-violet-600',
                title: 'Send it',
                desc: 'Copy the link and share via WhatsApp, email, or any messenger.',
              },
              {
                icon: Eye,
                iconBg: 'bg-secondary-50', iconClr: 'text-secondary-600',
                title: 'Track access',
                desc: 'See how many times the link was used. Revoke it any time.',
              },
            ].map((feat) => (
              <div key={feat.title} className="flex items-start gap-3 p-4 rounded-xl bg-neutral-50 border border-neutral-100">
                <div className={`w-10 h-10 rounded-xl ${feat.iconBg} flex items-center justify-center shrink-0`}>
                  <feat.icon className={`h-5 w-5 ${feat.iconClr}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-800">{feat.title}</p>
                  <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Create Modal */}
        {showCreate && <CreateModal form={createForm} setForm={setCreateForm} creating={creating} onSubmit={handleCreate} onClose={() => setShowCreate(false)} />}
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
      <div className="flex items-start justify-between animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Share Records</h1>
          <p className="text-sm text-neutral-600 mt-1">Manage secure links to your medical records</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="h-10 px-5 text-sm font-semibold bg-primary-600 text-white rounded-xl hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> New Link
        </button>
      </div>

      {/* Summary bar */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 gap-3 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '100ms' }}
      >
        <SummaryCard
          label="Active Links"
          value={activeTokens.length}
          Icon={Link2}
          iconBg="bg-blue-50"
          iconClr="text-blue-600"
        />
        <SummaryCard
          label="Total Views"
          value={tokens.reduce((sum, t) => sum + (t.accessCount || 0), 0)}
          Icon={Eye}
          iconBg="bg-secondary-50"
          iconClr="text-secondary-600"
        />
        <SummaryCard
          label="Expired / Revoked"
          value={expiredOrRevoked.length}
          Icon={Clock}
          iconBg="bg-neutral-100"
          iconClr="text-neutral-500"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Active tokens */}
      {activeTokens.length > 0 && (
        <div
          className={`${CARD} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
          style={{ animationDelay: '200ms' }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Link2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">Active Links</h2>
              <p className="text-xs text-neutral-500">{activeTokens.length} link{activeTokens.length !== 1 ? 's' : ''} currently sharing</p>
            </div>
          </div>

          <div className="space-y-2">
            {activeTokens.map((tk) => (
              <TokenRow
                key={tk._id}
                token={tk}
                copiedId={copiedId}
                onCopy={() => copyLink(tk)}
                onRevoke={() => setRevokeTarget(tk)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Expired / Revoked history */}
      {expiredOrRevoked.length > 0 && (
        <div
          className={`${CARD} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
          style={{ animationDelay: '300ms' }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-neutral-400" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">History</h2>
              <p className="text-xs text-neutral-500">Expired and revoked links</p>
            </div>
          </div>

          <div className="space-y-2">
            {expiredOrRevoked.map((tk) => (
              <TokenRow key={tk._id} token={tk} expired />
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateModal
          form={createForm}
          setForm={setCreateForm}
          creating={creating}
          onSubmit={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      <ConfirmDialog
        open={!!revokeTarget}
        title="Revoke Share Link?"
        message="This link will stop working immediately. Anyone who has the link will no longer be able to view the records."
        confirmLabel={revoking ? 'Revoking...' : 'Revoke'}
        confirmVariant="danger"
        loading={revoking}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}

/* ─── Sub-components ──────────────────────────── */

function SummaryCard({ label, value, Icon, iconBg, iconClr, className = '' }) {
  return (
    <div className={`${CARD} p-4 flex items-center gap-3 ${className}`}>
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

function TokenRow({ token: tk, copiedId, onCopy, onRevoke, expired }) {
  const cfg = RECORD_TYPE[tk.recordType] || RECORD_TYPE.all;
  const TypeIcon = cfg.icon;
  const isExpired = expired || tk.isRevoked || new Date(tk.expiresAt) <= new Date();
  const usagePct = tk.maxAccesses > 0 ? Math.round((tk.accessCount / tk.maxAccesses) * 100) : 0;

  return (
    <div className={`rounded-xl border transition-colors overflow-hidden ${
      isExpired
        ? 'bg-neutral-50/50 border-neutral-100'
        : 'bg-neutral-50 border-neutral-100 hover:bg-neutral-100/50 hover:border-neutral-200'
    }`}>
      <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Left: type + info */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl ${isExpired ? 'bg-neutral-100' : cfg.bg} flex items-center justify-center shrink-0`}>
            <TypeIcon className={`h-5 w-5 ${isExpired ? 'text-neutral-400' : cfg.iconClr}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-semibold ${isExpired ? 'text-neutral-500' : 'text-neutral-900'}`}>
                {cfg.label}
              </p>
              {/* Status badge */}
              {tk.isRevoked ? (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  Revoked
                </span>
              ) : isExpired ? (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                  Expired
                </span>
              ) : (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-secondary-50 text-secondary-700 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary-500" />
                  Active
                </span>
              )}
            </div>
            <p className={`text-xs mt-0.5 ${isExpired ? 'text-neutral-400' : 'text-neutral-500'}`}>
              {tk.sharedWith && <span>{tk.sharedWith} · </span>}
              Created {fmtDateTime(tk.createdAt)}
            </p>
            <div className="flex items-center gap-4 mt-1.5 text-[11px] text-neutral-400">
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {tk.accessCount}/{tk.maxAccesses} views
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {isExpired
                  ? `Expired ${fmtDate(tk.expiresAt)}`
                  : timeLeft(tk.expiresAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Right: actions */}
        {!isExpired && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onCopy}
              className={`h-9 px-3.5 text-xs font-semibold rounded-lg border transition-all inline-flex items-center gap-1.5 ${
                copiedId === tk._id
                  ? 'bg-secondary-50 border-secondary-200 text-secondary-700'
                  : 'bg-white border-neutral-200 text-neutral-700 hover:border-primary-200 hover:text-primary-600'
              }`}
            >
              {copiedId === tk._id
                ? <><CheckCircle2 className="h-3.5 w-3.5" /> Copied</>
                : <><Copy className="h-3.5 w-3.5" /> Copy Link</>}
            </button>
            <button
              onClick={onRevoke}
              className="w-9 h-9 rounded-lg bg-white border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-red-600 hover:border-red-200 transition"
              title="Revoke"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Usage bar */}
      {!isExpired && tk.maxAccesses > 0 && (
        <div className="h-1 bg-neutral-100">
          <div
            className={`h-full transition-all duration-500 ${
              usagePct >= 80 ? 'bg-amber-500' : 'bg-blue-400'
            }`}
            style={{ width: `${Math.min(usagePct, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function CreateModal({ form, setForm, creating, onSubmit, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-[var(--shadow-xl)] w-full max-w-md animate-[fadeUp_0.25s_ease-out_both]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Link2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold font-display text-neutral-900">Create Share Link</h2>
              <p className="text-xs text-neutral-500">Choose what to share and for how long</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-400 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {/* Record type */}
          <div>
            <label className={labelCls}>What to share</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(RECORD_TYPE).map(([key, cfg]) => {
                const Icon = cfg.icon;
                const selected = form.recordType === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, recordType: key }))}
                    className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                      selected
                        ? 'border-primary-300 bg-primary-50 ring-2 ring-primary-400/20'
                        : 'border-neutral-200 bg-neutral-50/50 hover:border-neutral-300'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${selected ? 'bg-primary-100' : 'bg-white border border-neutral-100'} flex items-center justify-center`}>
                      <Icon className={`h-4 w-4 ${selected ? 'text-primary-600' : 'text-neutral-400'}`} />
                    </div>
                    <span className={`text-xs font-medium ${selected ? 'text-primary-700' : 'text-neutral-600'}`}>
                      {cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Shared with */}
          <div>
            <label className={labelCls}>Shared with (optional)</label>
            <input
              type="text"
              placeholder="e.g. Dr. Patel or john@example.com"
              value={form.sharedWith}
              onChange={(e) => setForm((f) => ({ ...f, sharedWith: e.target.value }))}
              className={inputCls}
            />
            <p className="text-[11px] text-neutral-400 mt-1">For your reference only — anyone with the link can view</p>
          </div>

          {/* Expiry + Max accesses */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Expires after</label>
              <select
                value={form.expiresInHours}
                onChange={(e) => setForm((f) => ({ ...f, expiresInHours: Number(e.target.value) }))}
                className={inputCls}
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Max views</label>
              <input
                type="number"
                min={1}
                max={100}
                value={form.maxAccesses}
                onChange={(e) => setForm((f) => ({ ...f, maxAccesses: Math.max(1, Math.min(100, Number(e.target.value) || 1)) }))}
                className={inputCls}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-xl hover:bg-neutral-200 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="h-10 px-6 text-sm font-semibold text-white bg-primary-600 rounded-xl hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50 inline-flex items-center gap-2"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Create Link
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
