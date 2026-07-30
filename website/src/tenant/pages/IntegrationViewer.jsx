import { useState, useEffect, useCallback } from 'react';
import {
  Link2, RefreshCw, CheckCircle2, XCircle, Clock, Loader2,
  AlertTriangle, Filter, Calendar, ChevronDown, Activity,
} from 'lucide-react';
import { DataTable, EmptyState, Pagination, Spinner, ErrorAlert, StatusBadge, TabBar } from '../../platform/components/shared';
import { Modal } from '../../platform/components/shared';
import { getIntegrationStatus, listSyncLogs } from '../api';

// ─── Sync-status color mapping ──────────────────
const SYNC_STATUS_STYLES = {
  completed:   { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Completed' },
  in_progress: { bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-500',    label: 'In Progress' },
  failed:      { bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-500',     label: 'Failed' },
  partial:     { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'Partial' },
};

function SyncStatusBadge({ status }) {
  const s = SYNC_STATUS_STYLES[status] || { bg: 'bg-neutral-200', text: 'text-neutral-900/60', dot: 'bg-neutral-900/30', label: status || 'Unknown' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ─── Format helpers ─────────────────────────────
function formatDuration(ms) {
  if (!ms && ms !== 0) return '--';
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = (seconds % 60).toFixed(0);
  return `${minutes}m ${remaining}s`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Integration type metadata ──────────────────
const INTEGRATION_META = {
  rioview: { name: 'RioView', color: 'primary' },
  romexis: { name: 'Romexis', color: 'purple' },
};

export default function IntegrationViewer() {
  // ─── State ──────────────────────────────────────
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 15 });
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [page, setPage] = useState(1);
  const [integrationType, setIntegrationType] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Detail modal
  const [selectedLog, setSelectedLog] = useState(null);

  // ─── Data fetching ────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res = await getIntegrationStatus();
      setIntegrationStatus(res.data || res);
    } catch (err) {
      setError(err.message || 'Failed to load integration status');
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = { page, limit: 15 };
      if (integrationType !== 'all') params.integrationType = integrationType;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const res = await listSyncLogs(params);
      setLogs(res.data || []);
      setMeta(res.meta || { total: (res.data || []).length, page, limit: 15 });
    } catch (err) {
      setError(err.message || 'Failed to load sync logs');
    } finally {
      setLogsLoading(false);
    }
  }, [page, integrationType, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStatus(), fetchLogs()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [integrationType, statusFilter, dateFrom, dateTo]);

  // ─── Table columns ────────────────────────────
  const columns = [
    {
      key: 'integrationType',
      label: 'Integration',
      render: (row) => {
        const m = INTEGRATION_META[row.integrationType] || { name: row.integrationType, color: 'primary' };
        return (
          <span className="font-medium capitalize text-neutral-900">{m.name}</span>
        );
      },
    },
    {
      key: 'syncType',
      label: 'Sync Type',
      render: (row) => (
        <span className="text-neutral-900/60 capitalize">{(row.syncType || row.action || '--').replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <SyncStatusBadge status={row.status} />,
    },
    {
      key: 'recordsSynced',
      label: 'Records',
      render: (row) => {
        const stats = row.stats || row.recordsSynced;
        if (!stats) return <span className="text-neutral-900/40">--</span>;
        if (typeof stats === 'number') return <span className="font-medium text-neutral-900">{stats}</span>;
        return (
          <div className="flex items-center gap-2 text-xs">
            {stats.created > 0 && <span className="text-emerald-600 font-medium">+{stats.created}</span>}
            {stats.updated > 0 && <span className="text-primary-600 font-medium">~{stats.updated}</span>}
            {stats.failed > 0 && <span className="text-red-600 font-medium">!{stats.failed}</span>}
            {stats.totalRecords > 0 && <span className="text-neutral-900/50">({stats.totalRecords} total)</span>}
            {(!stats.created && !stats.updated && !stats.failed && !stats.totalRecords) && <span className="text-neutral-900/40">--</span>}
          </div>
        );
      },
    },
    {
      key: 'startedAt',
      label: 'Started At',
      render: (row) => (
        <span className="text-neutral-900/60 text-xs">{formatDateTime(row.startedAt)}</span>
      ),
    },
    {
      key: 'duration',
      label: 'Duration',
      render: (row) => (
        <span className="text-neutral-900/50 text-xs font-mono">{formatDuration(row.durationMs || row.duration)}</span>
      ),
    },
  ];

  // ─── Loading state ────────────────────────────
  if (loading) return <Spinner />;

  // ─── Integration status cards ─────────────────
  const integrations = integrationStatus?.integrations || integrationStatus || [];
  const integrationList = Array.isArray(integrations) ? integrations : Object.entries(integrations).map(([key, val]) => ({ type: key, ...val }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display text-neutral-900">Integrations</h1>
        <p className="text-sm text-neutral-900/50 mt-1">View integration status and sync history</p>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Integration Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['rioview', 'romexis'].map((type) => {
          const m = INTEGRATION_META[type];
          const integration = integrationList.find((i) => (i.type || i.integrationType) === type);
          const isActive = integration?.status === 'active' || integration?.isActive;
          const lastSync = integration?.lastSyncAt || integration?.config?.lastSyncAt;
          const lastStatus = integration?.lastSyncStatus || integration?.config?.lastSyncStatus;

          return (
            <div
              key={type}
              className={`bg-white rounded-2xl border p-5 shadow-[var(--shadow-xs)] transition-shadow hover:shadow-[var(--shadow-sm)] ${
                isActive ? 'border-primary-200' : 'border-neutral-300/60'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${isActive ? 'bg-primary-50' : 'bg-neutral-100'}`}>
                    <Link2 className={`h-5 w-5 ${isActive ? 'text-primary-600' : 'text-neutral-900/30'}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold font-display text-neutral-900">{m.name}</h3>
                    <p className="text-xs text-neutral-900/40 mt-0.5">
                      {isActive ? 'Connected' : 'Not configured'}
                    </p>
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-neutral-200 text-neutral-900/50'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-neutral-900/25'}`} />
                  {isActive ? 'Active' : 'Inactive'}
                </div>
              </div>

              {isActive && (
                <div className="space-y-2.5 pt-3 border-t border-neutral-300/30">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-900/50 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Last Sync
                    </span>
                    <span className="text-neutral-900/70 text-xs">
                      {lastSync ? timeAgo(lastSync) : 'Never'}
                    </span>
                  </div>
                  {lastSync && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-900/50">Sync Status</span>
                      {lastStatus ? <SyncStatusBadge status={lastStatus} /> : <span className="text-neutral-900/40 text-xs">--</span>}
                    </div>
                  )}
                  {integration?.config?.syncEnabled && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-900/50 flex items-center gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" /> Auto-sync
                      </span>
                      <span className="text-emerald-600 text-xs font-medium">
                        Every {integration.config.syncInterval || 60} min
                      </span>
                    </div>
                  )}
                </div>
              )}

              {!isActive && (
                <div className="pt-3 border-t border-neutral-300/30">
                  <p className="text-xs text-neutral-900/30">
                    This integration has not been configured yet. Contact your administrator to set it up.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sync Logs Section */}
      <div className="bg-white rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-xs)] overflow-hidden">
        {/* Logs Header */}
        <div className="px-5 py-4 border-b border-neutral-300/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold font-display text-neutral-900">Sync Logs</h2>
            <p className="text-xs text-neutral-900/40 mt-0.5">
              {meta.total || 0} total log{(meta.total || 0) !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border transition ${
              filtersOpen || integrationType !== 'all' || statusFilter !== 'all' || dateFrom || dateTo
                ? 'border-primary-200 bg-primary-50 text-primary-700'
                : 'border-neutral-300/60 text-neutral-900/50 hover:bg-neutral-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filters
            {(integrationType !== 'all' || statusFilter !== 'all' || dateFrom || dateTo) && (
              <span className="w-5 h-5 rounded-full bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center">
                {[integrationType !== 'all', statusFilter !== 'all', dateFrom, dateTo].filter(Boolean).length}
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Filter panel */}
        {filtersOpen && (
          <div className="px-5 py-4 bg-neutral-50/50 border-b border-neutral-300/60">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Integration Type */}
              <div>
                <label className="block text-xs font-medium text-neutral-900/50 mb-1.5">Integration</label>
                <select
                  value={integrationType}
                  onChange={(e) => setIntegrationType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300/60 bg-white text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-primary-400/20 focus:border-primary-400 transition"
                >
                  <option value="all">All Integrations</option>
                  <option value="rioview">RioView</option>
                  <option value="romexis">Romexis</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-neutral-900/50 mb-1.5">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300/60 bg-white text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-primary-400/20 focus:border-primary-400 transition"
                >
                  <option value="all">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="in_progress">In Progress</option>
                  <option value="failed">Failed</option>
                  <option value="partial">Partial</option>
                </select>
              </div>

              {/* Date From */}
              <div>
                <label className="block text-xs font-medium text-neutral-900/50 mb-1.5">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300/60 bg-white text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-primary-400/20 focus:border-primary-400 transition"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-xs font-medium text-neutral-900/50 mb-1.5">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300/60 bg-white text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-primary-400/20 focus:border-primary-400 transition"
                />
              </div>
            </div>

            {/* Clear filters */}
            {(integrationType !== 'all' || statusFilter !== 'all' || dateFrom || dateTo) && (
              <button
                onClick={() => { setIntegrationType('all'); setStatusFilter('all'); setDateFrom(''); setDateTo(''); }}
                className="mt-3 text-xs text-primary-600 hover:text-primary-700 font-medium transition"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Table */}
        {logsLoading ? (
          <Spinner />
        ) : logs.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No sync logs found"
            message={integrationType !== 'all' || statusFilter !== 'all' || dateFrom || dateTo
              ? 'Try adjusting your filters to see more results.'
              : 'Sync logs will appear here once integrations start syncing data.'}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={logs}
              onRowClick={(row) => setSelectedLog(row)}
            />
            {(meta.total || 0) > 15 && (
              <div className="px-5 border-t border-neutral-300/60">
                <Pagination
                  page={page}
                  limit={meta.limit || 15}
                  total={meta.total || 0}
                  onChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Log Detail Modal */}
      <Modal
        open={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Sync Log Details"
        wide
      >
        {selectedLog && (
          <div className="space-y-5">
            {/* Summary grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-neutral-900/40 mb-1">Integration</p>
                <p className="text-sm font-medium text-neutral-900 capitalize">
                  {INTEGRATION_META[selectedLog.integrationType]?.name || selectedLog.integrationType}
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-900/40 mb-1">Sync Type</p>
                <p className="text-sm font-medium text-neutral-900 capitalize">
                  {(selectedLog.syncType || selectedLog.action || '--').replace(/_/g, ' ')}
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-900/40 mb-1">Status</p>
                <SyncStatusBadge status={selectedLog.status} />
              </div>
              <div>
                <p className="text-xs text-neutral-900/40 mb-1">Duration</p>
                <p className="text-sm font-medium text-neutral-900 font-mono">
                  {formatDuration(selectedLog.durationMs || selectedLog.duration)}
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-900/40 mb-1">Started At</p>
                <p className="text-sm text-neutral-900/70">{formatDateTime(selectedLog.startedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-900/40 mb-1">Completed At</p>
                <p className="text-sm text-neutral-900/70">{formatDateTime(selectedLog.completedAt || selectedLog.endedAt)}</p>
              </div>
            </div>

            {/* Records Stats */}
            {(selectedLog.stats || selectedLog.recordsSynced) && (
              <div>
                <p className="text-xs font-semibold text-neutral-900/50 uppercase tracking-wider mb-2">Records</p>
                <div className="bg-neutral-50 rounded-xl p-4">
                  {(() => {
                    const stats = selectedLog.stats || {};
                    const isNumber = typeof selectedLog.recordsSynced === 'number';
                    if (isNumber) {
                      return (
                        <p className="text-sm text-neutral-900/70">
                          <span className="font-semibold text-neutral-900">{selectedLog.recordsSynced}</span> records synced
                        </p>
                      );
                    }
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="text-center">
                          <p className="text-lg font-bold text-neutral-900">{stats.totalRecords || 0}</p>
                          <p className="text-[10px] text-neutral-900/40 uppercase tracking-wider">Total</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-emerald-600">{stats.created || 0}</p>
                          <p className="text-[10px] text-neutral-900/40 uppercase tracking-wider">Created</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-primary-600">{stats.updated || 0}</p>
                          <p className="text-[10px] text-neutral-900/40 uppercase tracking-wider">Updated</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-red-600">{stats.failed || 0}</p>
                          <p className="text-[10px] text-neutral-900/40 uppercase tracking-wider">Failed</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Errors section */}
            {selectedLog.status === 'failed' || selectedLog.status === 'partial' || selectedLog.errors?.length > 0 || selectedLog.error ? (
              <div>
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Errors
                </p>
                <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-2">
                  {selectedLog.error && (
                    <p className="text-sm text-red-700">{selectedLog.error}</p>
                  )}
                  {selectedLog.errors?.length > 0 && (
                    <ul className="space-y-1.5">
                      {selectedLog.errors.map((err, i) => (
                        <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>{typeof err === 'string' ? err : err.message || JSON.stringify(err)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!selectedLog.error && (!selectedLog.errors || selectedLog.errors.length === 0) && (
                    <p className="text-sm text-red-600/70">No detailed error information available.</p>
                  )}
                </div>
              </div>
            ) : null}

            {/* Raw metadata (collapsed) */}
            {selectedLog.metadata && (
              <details className="group">
                <summary className="text-xs font-semibold text-neutral-900/40 uppercase tracking-wider cursor-pointer hover:text-neutral-900/60 transition">
                  Metadata
                </summary>
                <pre className="mt-2 bg-neutral-50 rounded-xl p-4 text-xs text-neutral-900/60 overflow-x-auto font-mono">
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
