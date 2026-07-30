import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  listIntegrations, upsertIntegration, storeIntegrationCredentials,
  testIntegrationConnection, triggerIntegrationSync, disableIntegration,
  getIntegrationSyncLogs,
} from '../api';
import { Modal, StatusBadge, Spinner, EmptyState, Pagination } from '../components/shared';
import {
  Plug, RefreshCw, TestTube2, AlertCircle, CheckCircle2,
  Clock, ArrowLeft, Eye, EyeOff, Settings, Power, PowerOff,
} from 'lucide-react';

const INTEGRATION_TYPES = [
  { key: 'rioview', name: 'RioView', description: 'Dental imaging and patient management' },
  { key: 'romexis', name: 'Romexis', description: 'Planmeca dental software integration' },
];

export default function IntegrationSettings() {
  const { slug } = useParams();
  const [integrations, setIntegrations] = useState([]);
  const [syncLogs, setSyncLogs] = useState([]);
  const [logMeta, setLogMeta] = useState({});
  const [logPage, setLogPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showCredModal, setShowCredModal] = useState(false);
  const [activeType, setActiveType] = useState(null);
  const [testing, setTesting] = useState(null);
  const [syncing, setSyncing] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [configForm, setConfigForm] = useState({ baseUrl: '', apiVersion: 'v1', syncInterval: 60, syncEnabled: false });
  const [credForm, setCredForm] = useState({ authType: 'api_key', apiKey: '' });

  const fetchIntegrations = useCallback(() => {
    setLoading(true);
    listIntegrations(slug)
      .then((res) => setIntegrations(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const fetchLogs = useCallback(() => {
    getIntegrationSyncLogs(slug, { page: logPage, limit: 10 })
      .then((res) => { setSyncLogs(res.data || []); setLogMeta(res.meta || {}); })
      .catch(() => {});
  }, [slug, logPage]);

  useEffect(() => { fetchIntegrations(); }, [fetchIntegrations]);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const getIntegrationByType = (type) => integrations.find((i) => i.type === type);

  const openConfig = (type) => {
    const existing = getIntegrationByType(type);
    setActiveType(type);
    setConfigForm(existing?.config
      ? { baseUrl: existing.config.baseUrl || '', apiVersion: existing.config.apiVersion || 'v1', syncInterval: existing.config.syncInterval || 60, syncEnabled: existing.config.syncEnabled || false }
      : { baseUrl: '', apiVersion: 'v1', syncInterval: 60, syncEnabled: false },
    );
    setShowConfigModal(true);
  };

  const openCredentials = (type) => {
    setActiveType(type);
    setCredForm({ authType: 'api_key', apiKey: '' });
    setShowApiKey(false);
    setShowCredModal(true);
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      await upsertIntegration(slug, { type: activeType, config: configForm });
      setShowConfigModal(false);
      fetchIntegrations();
    } catch { /* handled */ }
  };

  const handleSaveCredentials = async (e) => {
    e.preventDefault();
    try {
      await storeIntegrationCredentials(slug, activeType, credForm);
      setShowCredModal(false);
      fetchIntegrations();
    } catch { /* handled */ }
  };

  const handleTest = async (type) => {
    setTesting(type);
    setTestResult(null);
    try {
      const res = await testIntegrationConnection(slug, type);
      setTestResult({ type, ...res.data });
    } catch (err) {
      setTestResult({ type, success: false, message: err.message });
    } finally {
      setTesting(null);
    }
  };

  const handleSync = async (type) => {
    setSyncing(type);
    try {
      await triggerIntegrationSync(slug, type, { fullSync: false });
      fetchLogs();
      fetchIntegrations();
    } catch { /* handled */ }
    finally { setSyncing(null); }
  };

  const handleDisable = async (type) => {
    if (!confirm(`Disable ${type} integration?`)) return;
    try {
      await disableIntegration(slug, type);
      fetchIntegrations();
    } catch { /* handled */ }
  };

  const syncStatusMap = {
    completed: 'active',
    partial: 'trial',
    failed: 'suspended',
    started: 'trial',
    in_progress: 'trial',
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={`/platform/tenants/${slug}`} className="text-neutral-900/40 hover:text-neutral-900/60">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h2 className="text-xl font-bold font-display text-neutral-900">Integration Settings</h2>
          <p className="text-sm text-neutral-900/50">Manage external integrations for {slug}</p>
        </div>
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {INTEGRATION_TYPES.map((intType) => {
          const integration = getIntegrationByType(intType.key);
          const isActive = integration?.status === 'active';

          return (
            <div key={intType.key} className={`bg-white rounded-2xl border p-6 ${isActive ? 'border-primary-200' : 'border-neutral-300/60'}`}>
              {/* Card Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${isActive ? 'bg-primary-50' : 'bg-neutral-100'}`}>
                    <Plug className={`h-5 w-5 ${isActive ? 'text-primary-600' : 'text-neutral-900/30'}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold font-display text-neutral-900">{intType.name}</h3>
                    <p className="text-xs text-neutral-900/50">{intType.description}</p>
                  </div>
                </div>
                {integration && (
                  <StatusBadge status={isActive ? 'active' : 'inactive'} />
                )}
              </div>

              {/* Integration Info */}
              {integration && isActive && (
                <div className="space-y-2 mb-4 text-sm">
                  {integration.config?.baseUrl && (
                    <div className="flex justify-between">
                      <span className="text-neutral-900/50">Endpoint</span>
                      <span className="text-neutral-900/70 font-mono text-xs truncate max-w-[200px]">{integration.config.baseUrl}</span>
                    </div>
                  )}
                  {integration.config?.lastSyncAt && (
                    <div className="flex justify-between">
                      <span className="text-neutral-900/50">Last Sync</span>
                      <span className="text-neutral-900/70">{new Date(integration.config.lastSyncAt).toLocaleString()}</span>
                    </div>
                  )}
                  {integration.config?.lastSyncStatus && (
                    <div className="flex justify-between">
                      <span className="text-neutral-900/50">Last Status</span>
                      <StatusBadge status={syncStatusMap[integration.config.lastSyncStatus] || 'inactive'} />
                    </div>
                  )}
                  {integration.config?.syncEnabled && (
                    <div className="flex justify-between">
                      <span className="text-neutral-900/50">Auto-sync</span>
                      <span className="text-emerald-600 text-xs font-medium">Every {integration.config.syncInterval} min</span>
                    </div>
                  )}
                </div>
              )}

              {/* Test Result */}
              {testResult?.type === intType.key && (
                <div className={`mb-4 p-3 rounded-xl text-sm ${testResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  <div className="flex items-center gap-2">
                    {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    {testResult.message}
                    {testResult.latencyMs && <span className="text-xs opacity-60">({testResult.latencyMs}ms)</span>}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-3 border-t border-neutral-300/30">
                <button onClick={() => openConfig(intType.key)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-neutral-50 text-neutral-900/70 rounded-lg hover:bg-neutral-100">
                  <Settings className="h-3.5 w-3.5" /> Configure
                </button>
                {isActive && (
                  <>
                    <button onClick={() => openCredentials(intType.key)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-neutral-50 text-neutral-900/70 rounded-lg hover:bg-neutral-100">
                      <Eye className="h-3.5 w-3.5" /> Credentials
                    </button>
                    <button onClick={() => handleTest(intType.key)} disabled={testing === intType.key} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 disabled:opacity-50">
                      <TestTube2 className="h-3.5 w-3.5" /> {testing === intType.key ? 'Testing...' : 'Test'}
                    </button>
                    <button onClick={() => handleSync(intType.key)} disabled={syncing === intType.key} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 disabled:opacity-50">
                      <RefreshCw className={`h-3.5 w-3.5 ${syncing === intType.key ? 'animate-spin' : ''}`} /> {syncing === intType.key ? 'Syncing...' : 'Sync Now'}
                    </button>
                    <button onClick={() => handleDisable(intType.key)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                      <PowerOff className="h-3.5 w-3.5" /> Disable
                    </button>
                  </>
                )}
                {!isActive && !integration && (
                  <button onClick={() => openConfig(intType.key)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                    <Power className="h-3.5 w-3.5" /> Enable
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sync Logs */}
      <div className="bg-white rounded-2xl border border-neutral-300/60 overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-300/60">
          <h3 className="font-semibold font-display text-neutral-900">Sync History</h3>
        </div>
        {syncLogs.length === 0 ? (
          <EmptyState icon={Clock} message="No sync logs yet" />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-300/60">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-neutral-900/60">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-neutral-900/60">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-neutral-900/60">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-neutral-900/60">Records</th>
                  <th className="text-left px-4 py-3 font-medium text-neutral-900/60">Duration</th>
                  <th className="text-left px-4 py-3 font-medium text-neutral-900/60">Time</th>
                </tr>
              </thead>
              <tbody>
                {syncLogs.map((log) => (
                  <tr key={log._id} className="border-b border-neutral-300/30 hover:bg-neutral-50/50">
                    <td className="px-4 py-3 capitalize font-medium">{log.integrationType}</td>
                    <td className="px-4 py-3 text-neutral-900/60">{log.action?.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={syncStatusMap[log.status] || 'inactive'} />
                    </td>
                    <td className="px-4 py-3 text-neutral-900/60">
                      {log.stats ? (
                        <span>
                          {log.stats.created > 0 && <span className="text-emerald-600">+{log.stats.created}</span>}
                          {log.stats.updated > 0 && <span className="text-primary-600 ml-1">~{log.stats.updated}</span>}
                          {log.stats.failed > 0 && <span className="text-red-600 ml-1">!{log.stats.failed}</span>}
                          {log.stats.totalRecords === 0 && '—'}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-neutral-900/50">
                      {log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td className="px-4 py-3 text-neutral-900/50">
                      {new Date(log.startedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logMeta.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-neutral-300/60">
                <Pagination meta={logMeta} onPageChange={setLogPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Config Modal */}
      <Modal open={showConfigModal} onClose={() => setShowConfigModal(false)} title={`Configure ${activeType}`}>
        <form onSubmit={handleSaveConfig} className="space-y-4 text-sm">
          <div>
            <label className="block text-neutral-900/60 mb-1">Base URL</label>
            <input
              value={configForm.baseUrl}
              onChange={(e) => setConfigForm({ ...configForm, baseUrl: e.target.value })}
              placeholder="https://api.rioview.example.com"
              required
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-900/60 mb-1">API Version</label>
              <input
                value={configForm.apiVersion}
                onChange={(e) => setConfigForm({ ...configForm, apiVersion: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-neutral-900/60 mb-1">Sync Interval (min)</label>
              <input
                type="number"
                min="5"
                max="1440"
                value={configForm.syncInterval}
                onChange={(e) => setConfigForm({ ...configForm, syncInterval: +e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg"
              />
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={configForm.syncEnabled}
              onChange={() => setConfigForm({ ...configForm, syncEnabled: !configForm.syncEnabled })}
              className="rounded"
            />
            <span className="text-neutral-900/60">Enable automatic sync</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowConfigModal(false)} className="px-4 py-2 border border-neutral-300 rounded-lg hover:bg-neutral-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Save Configuration</button>
          </div>
        </form>
      </Modal>

      {/* Credentials Modal */}
      <Modal open={showCredModal} onClose={() => setShowCredModal(false)} title={`${activeType} Credentials`}>
        <form onSubmit={handleSaveCredentials} className="space-y-4 text-sm">
          <div>
            <label className="block text-neutral-900/60 mb-1">Auth Type</label>
            <select
              value={credForm.authType}
              onChange={(e) => setCredForm({ ...credForm, authType: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg"
            >
              <option value="api_key">API Key</option>
              <option value="oauth2">OAuth 2.0</option>
            </select>
          </div>
          {credForm.authType === 'api_key' ? (
            <div>
              <label className="block text-neutral-900/60 mb-1">API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={credForm.apiKey}
                  onChange={(e) => setCredForm({ ...credForm, apiKey: e.target.value })}
                  required
                  className="w-full px-3 py-2 pr-10 border border-neutral-300 rounded-lg font-mono text-xs"
                />
                <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-900/40 hover:text-neutral-900/60">
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-neutral-900/60 mb-1">Client ID</label>
                <input
                  value={credForm.clientId || ''}
                  onChange={(e) => setCredForm({ ...credForm, clientId: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-neutral-900/60 mb-1">Client Secret</label>
                <input
                  type="password"
                  value={credForm.clientSecret || ''}
                  onChange={(e) => setCredForm({ ...credForm, clientSecret: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono text-xs"
                />
              </div>
            </>
          )}
          <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-700">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              Credentials are encrypted with AES-256-GCM before storage. They are never exposed via the API.
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCredModal(false)} className="px-4 py-2 border border-neutral-300 rounded-lg hover:bg-neutral-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Save Credentials</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
