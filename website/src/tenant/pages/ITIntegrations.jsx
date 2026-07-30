import { useState, useEffect, useCallback } from 'react';
import {
  Link2, Clock, RefreshCw, Filter, ChevronDown, Activity,
  CheckCircle2, XCircle, AlertTriangle, Wifi, WifiOff,
} from 'lucide-react';
import { EmptyState, Pagination, Spinner, ErrorAlert } from '../../platform/components/shared';
import { getIntegrationStatus, listSyncLogs } from '../api';

/* ─── Design Tokens ────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const cardHover = 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';

/* ─── Stat Card Config ─────────────────────────── */
const STAT_CFG = [
  { key: 'connected', title: 'Connected', icon: Wifi },
  { key: 'inactive',  title: 'Not Configured', icon: WifiOff },
  { key: 'totalLogs', title: 'Total Sync Logs', icon: Activity },
];
const PALETTE = [
  { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  { bg: 'bg-neutral-100', text: 'text-neutral-500' },
  { bg: 'bg-blue-50',    text: 'text-blue-600' },
];

/* ─── Sync-status color mapping ──────────────────── */
const SYNC_STATUS_STYLES = {
  success:     { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Success' },
  completed:   { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Completed' },
  error:       { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500',     label: 'Error' },
  failed:      { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500',     label: 'Failed' },
  pending:     { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'Pending' },
  running:     { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500',    label: 'Running' },
  in_progress: { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500',    label: 'In Progress' },
  partial:     { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'Partial' },
};

function SyncStatusBadge({ status }) {
  const s = SYNC_STATUS_STYLES[status] || { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400', label: status || 'Unknown' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

/* ─── Format helpers ─────────────────────────────── */
function formatDateTime(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(date) {
  if (!date) return 'Never';
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ═══════════════════════════════════════════════════
   ─── MAIN COMPONENT ──────────────────────────────
   ═══════════════════════════════════════════════════ */
export default function ITIntegrations() {
  // ─── State ────────────────────────────────────────
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ─── Data fetching ────────────────────────────────
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
      const params = { page, limit };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const res = await listSyncLogs(params);
      setLogs(res.data || []);
      setMeta(res.meta || { total: (res.data || []).length, page, limit });
    } catch (err) {
      setError(err.message || 'Failed to load sync logs');
    } finally {
      setLogsLoading(false);
    }
  }, [page, limit, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStatus(), fetchLogs()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [statusFilter, dateFrom, dateTo, limit]);

  // ─── Loading state ────────────────────────────────
  if (loading) return <Spinner />;

  // ─── Derived data ─────────────────────────────────
  const integrations = integrationStatus?.integrations || integrationStatus || [];
  const integrationList = Array.isArray(integrations)
    ? integrations
    : Object.entries(integrations).map(([key, val]) => ({ type: key, ...val }));
  const hasIntegrations = integrationList.length > 0;
  const activeFilters = [statusFilter !== 'all', dateFrom, dateTo].filter(Boolean).length;

  const connectedCount = integrationList.filter((i) => i.status === 'active' || i.isActive).length;
  const inactiveCount = integrationList.length - connectedCount;
  const statValues = { connected: connectedCount, inactive: inactiveCount, totalLogs: meta.total || 0 };

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      {/* Header */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]">
        <h1 className="text-2xl font-semibold font-display text-neutral-900">Integrations</h1>
        <p className="text-sm text-neutral-500 mt-1">View integration status and sync history</p>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Stat Cards */}
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '50ms' }}
      >
        {STAT_CFG.map((cfg, i) => {
          const Icon = cfg.icon;
          const pal = PALETTE[i];
          return (
            <div
              key={cfg.key}
              className={`${cardCls} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
              style={{ animationDelay: `${100 + i * 50}ms` }}
            >
              <div className={`w-12 h-12 rounded-2xl ${pal.bg} flex items-center justify-center mb-3`}>
                <Icon className={`h-6 w-6 ${pal.text}`} />
              </div>
              <p className="text-[28px] font-bold text-neutral-900 leading-none">{statValues[cfg.key]}</p>
              <p className="text-xs font-medium text-neutral-500 mt-1">{cfg.title}</p>
            </div>
          );
        })}
      </div>

      {/* Integration Status Cards */}
      {hasIntegrations ? (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '150ms' }}
        >
          {integrationList.map((integration, i) => {
            const name = integration.name || integration.type || integration.integrationType || 'Unknown';
            const isActive = integration.status === 'active' || integration.isActive;
            const lastSync = integration.lastSyncAt || integration.config?.lastSyncAt;
            const lastStatus = integration.lastSyncStatus || integration.config?.lastSyncStatus;

            return (
              <div
                key={name + i}
                className={`${cardCls} ${cardHover} p-5 animate-[fadeUp_0.4s_ease-out_both] ${
                  isActive ? 'border-primary-200' : ''
                }`}
                style={{ animationDelay: `${200 + i * 60}ms` }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isActive ? 'bg-primary-50' : 'bg-neutral-100'}`}>
                      <Link2 className={`h-5 w-5 ${isActive ? 'text-primary-600' : 'text-neutral-400'}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold font-display text-neutral-900 capitalize">{name}</h3>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {isActive ? 'Connected' : 'Not configured'}
                      </p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                    {isActive ? 'Active' : 'Inactive'}
                  </div>
                </div>

                {isActive && (
                  <div className="space-y-2.5 pt-3 border-t border-neutral-100">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-500 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" /> Last Sync
                      </span>
                      <span className="text-neutral-700 text-xs">
                        {lastSync ? timeAgo(lastSync) : 'Never'}
                      </span>
                    </div>
                    {lastStatus && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-500">Sync Status</span>
                        <SyncStatusBadge status={lastStatus} />
                      </div>
                    )}
                    {integration.config?.syncEnabled && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-500 flex items-center gap-1.5">
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
                  <div className="pt-3 border-t border-neutral-100">
                    <p className="text-xs text-neutral-400">
                      This integration has not been configured yet. Contact your administrator.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="animate-[fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '150ms' }}
        >
          <EmptyState
            icon={Link2}
            title="No integrations configured"
            message="Integrations will appear here once they are set up for your clinic."
          />
        </div>
      )}

      {/* Sync Logs Section */}
      <div
        className={`${cardCls} overflow-hidden animate-[fadeUp_0.4s_ease-out_both]`}
        style={{ animationDelay: '250ms' }}
      >
        {/* Logs Header */}
        <div className="px-5 py-4 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold font-display text-neutral-900">Sync Logs</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {meta.total || 0} total log{(meta.total || 0) !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className={selectCls}>
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
            </select>
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border transition ${
                filtersOpen || activeFilters > 0
                  ? 'border-primary-200 bg-primary-50 text-primary-700'
                  : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'
              }`}
            >
              <Filter className="h-4 w-4" />
              Filters
              {activeFilters > 0 && (
                <span className="w-5 h-5 rounded-full bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {activeFilters}
                </span>
              )}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filter panel */}
        {filtersOpen && (
          <div className="px-5 py-4 bg-neutral-50/50 border-b border-neutral-200">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">Status</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`w-full ${selectCls}`}>
                  <option value="all">All Statuses</option>
                  <option value="success">Success</option>
                  <option value="error">Error</option>
                  <option value="pending">Pending</option>
                  <option value="running">Running</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={`w-full ${selectCls}`}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={`w-full ${selectCls}`}
                />
              </div>
            </div>

            {activeFilters > 0 && (
              <button
                onClick={() => { setStatusFilter('all'); setDateFrom(''); setDateTo(''); }}
                className="mt-3 text-xs text-primary-600 hover:text-primary-700 font-medium transition"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Table */}
        {logsLoading ? (
          <div className="py-12 flex justify-center">
            <Spinner />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No sync logs found"
            message={
              activeFilters > 0
                ? 'Try adjusting your filters to see more results.'
                : 'Sync logs will appear here once integrations start syncing data.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Date/Time</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Integration</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Direction</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Records Synced</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {logs.map((log, idx) => {
                  const records = log.stats?.totalRecords ?? log.recordsSynced;
                  const recordsDisplay = records != null ? records : '--';
                  const details = log.error || log.message || '--';

                  return (
                    <tr
                      key={log._id || idx}
                      className="hover:bg-neutral-50 transition-colors"
                    >
                      <td className="px-5 py-3 text-neutral-600 whitespace-nowrap text-xs">
                        {formatDateTime(log.startedAt || log.createdAt)}
                      </td>
                      <td className="px-5 py-3 text-neutral-900 capitalize whitespace-nowrap font-medium">
                        {(log.integrationType || log.name || '--').replace(/_/g, ' ')}
                      </td>
                      <td className="px-5 py-3 text-neutral-600 capitalize whitespace-nowrap text-xs">
                        {(log.syncType || log.direction || log.action || '--').replace(/_/g, ' ')}
                      </td>
                      <td className="px-5 py-3">
                        <SyncStatusBadge status={log.status} />
                      </td>
                      <td className="px-5 py-3 text-neutral-700 font-medium">
                        {recordsDisplay}
                      </td>
                      <td className="px-5 py-3 text-neutral-500 text-xs max-w-[200px] truncate">
                        {details}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {(meta.total || 0) > limit && (
          <div className="px-5 border-t border-neutral-200">
            <Pagination
              page={page}
              limit={limit}
              total={meta.total || 0}
              onChange={setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
