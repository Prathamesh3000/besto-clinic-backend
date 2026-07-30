import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTenants, toggleTenantStatus, listPlans } from '../api';
import { StatCard, StatusBadge, DataTable, Pagination, Spinner, EmptyState } from '../components/shared';
import { Search, Building2, Users, Clock, ShieldOff, Filter, Plus } from 'lucide-react';
import { resolveAssetUrl } from '../../lib/assetUrl';
import { useHighlightFromUrl } from '../../hooks/useHighlightFromUrl';

const PAGE_SIZES = [10, 20, 50];
const STATUS_OPTIONS = ['all', 'active', 'trial', 'grace_period', 'suspended', 'cancelled'];

// Random but deterministic pastel colors for avatars
const AVATAR_COLORS = [
  'from-primary-100 to-primary-200 text-primary-700',
  'from-emerald-100 to-emerald-200 text-emerald-700',
  'from-amber-100 to-amber-200 text-amber-700',
  'from-purple-100 to-purple-200 text-purple-700',
  'from-blue-100 to-blue-200 text-blue-700',
  'from-rose-100 to-rose-200 text-rose-700',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function Tenants() {
  const navigate = useNavigate();
  const { highlightId, highlightSearch } = useHighlightFromUrl();
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState(highlightSearch || '');
  useEffect(() => { if (highlightSearch) setSearch(highlightSearch); }, [highlightSearch]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ total: 0, active: 0, trial: 0, suspended: 0 });

  const fetchTenants = useCallback(() => {
    setLoading(true);
    const params = { page, limit, sort: sortKey, order: sortDir };
    if (search) params.search = search;
    if (statusFilter !== 'all') params.status = statusFilter;
    if (planFilter !== 'all') params.plan = planFilter;

    listTenants(params)
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setTenants(data);
        setTotal(res.meta?.total || res.data?.total || data.length);
        if (res.meta?.counts) setCounts(res.meta.counts);
        else {
          setCounts({
            total: res.meta?.total || data.length,
            active: data.filter((t) => t.subscription?.status === 'active').length,
            trial: data.filter((t) => t.subscription?.status === 'trial').length,
            suspended: data.filter((t) => t.subscription?.status === 'suspended').length,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, limit, search, statusFilter, planFilter, sortKey, sortDir]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  useEffect(() => {
    listPlans({}).then((res) => {
      setPlans(Array.isArray(res.data) ? res.data : res.data?.items || []);
    }).catch(() => {});
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchTenants();
  };

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const handleToggle = async (slug, current) => {
    try {
      await toggleTenantStatus(slug, !current);
      fetchTenants();
    } catch { /* silent */ }
  };

  const selectClasses = "px-3 py-2 border border-neutral-300/60 rounded-lg text-sm bg-white text-neutral-900/70 focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all cursor-pointer";

  const columns = [
    {
      key: 'name',
      label: 'Clinic',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-3">
          {r.logo ? (
            <img
              src={resolveAssetUrl(r.logo)}
              alt=""
              className="w-9 h-9 rounded-full object-contain bg-neutral-50 border border-neutral-300/40 shrink-0 p-0.5"
            />
          ) : (
          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(r.name)} flex items-center justify-center text-xs font-bold shrink-0`}>
            {(r.name || '?')[0].toUpperCase()}
          </div>
          )}
          <div className="min-w-0">
            <p className="font-medium text-neutral-900 truncate">{r.name}</p>
            <p className="text-[11px] text-neutral-900/30 truncate">{r.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'slug',
      label: 'Slug',
      render: (r) => (
        <span className="font-mono text-xs text-neutral-900/40 bg-neutral-100 px-2 py-1 rounded-md">{r.slug}</span>
      ),
    },
    {
      key: 'plan',
      label: 'Plan',
      sortable: true,
      render: (r) => (
        <span className="text-sm font-medium text-neutral-900/60 capitalize">
          {r.subscription?.plan || r.subscription?.planSlug || 'free'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (r) => <StatusBadge status={r.subscription?.status} />,
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      render: (r) => (
        <span className="text-xs text-neutral-900/40">
          {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
    {
      key: 'active',
      label: 'Active',
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleToggle(r.slug, r.isActive); }}
          className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 ${r.isActive ? 'bg-emerald-500' : 'bg-neutral-400'}`}
        >
          <span className={`absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full transition-transform duration-200 shadow-sm ${r.isActive ? 'translate-x-[18px]' : ''}`} />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold font-display text-neutral-900">Tenant Management</h2>
          <p className="text-sm text-neutral-900/40 mt-0.5">Manage all registered clinics</p>
        </div>
        <button
          onClick={() => navigate('/platform/tenants/new')}
          className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all duration-300 flex items-center gap-1.5 shadow-sm shadow-primary-600/20"
        >
          <Plus className="h-3.5 w-3.5" /> Add Tenant
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={Building2} title="Total" value={counts.total || total} color="primary" />
        <StatCard icon={Users} title="Active" value={counts.active} color="green" />
        <StatCard icon={Clock} title="Trial" value={counts.trial} color="yellow" />
        <StatCard icon={ShieldOff} title="Suspended" value={counts.suspended} color="red" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-xs)] p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <form onSubmit={handleSearch} className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-900/25" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or slug..."
              className="w-full pl-10 pr-4 py-2.5 border border-neutral-300/60 rounded-xl text-sm bg-neutral-50/50 text-neutral-900 placeholder:text-neutral-900/25 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
            />
          </form>

          <div className="flex gap-2 items-center">
            <Filter className="h-4 w-4 text-neutral-900/25" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className={selectClasses}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.replace(/_/g, ' ')}</option>
              ))}
            </select>

            <select
              value={planFilter}
              onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
              className={selectClasses}
            >
              <option value="all">All Plans</option>
              {plans.map((p) => (
                <option key={p._id} value={p.slug}>{p.name}</option>
              ))}
            </select>

            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              className={selectClasses}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>{s} / page</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-xs)] overflow-hidden">
        {loading ? (
          <Spinner />
        ) : tenants.length === 0 ? (
          <EmptyState icon={Building2} title="No tenants found" message="Try adjusting your filters" />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={tenants}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onRowClick={(row) => navigate(`/platform/tenants/${row.slug}`)}
              highlightId={highlightId}
            />
            <div className="px-4 border-t border-neutral-300/40">
              <Pagination page={page} limit={limit} total={total} onChange={setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
