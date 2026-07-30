import { motion } from 'framer-motion';
import { IndianRupee, ClipboardList, BarChart3, FileText } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { DataTable, ErrorAlert } from '../../../platform/components/shared';
import {
  cardCls, btnPrimary, formatCurrency, formatDate,
  SkeletonLoader, EmptyState,
} from './shared';

// ─── Invoice table columns ──────────────────────────
const invoiceColumns = [
  {
    key: 'invoiceNumber',
    label: 'Invoice',
    render: (row) => (
      <span className="text-sm font-medium text-neutral-900">
        {row.invoiceNumber || row.number || '—'}
      </span>
    ),
  },
  {
    key: 'patient',
    label: 'Patient',
    render: (row) => (
      <span className="text-sm text-neutral-900/70">
        {row.patientName || row.patient?.name || row.patient?.firstName || '--'}
      </span>
    ),
  },
  {
    key: 'amount',
    label: 'Amount',
    render: (row) => (
      <span className="text-sm font-semibold text-neutral-900">
        {formatCurrency(row.total || row.amount || row.grandTotal || 0)}
      </span>
    ),
  },
  {
    key: 'date',
    label: 'Date',
    render: (row) => (
      <span className="text-xs text-neutral-900/50">
        {formatDate(row.paidAt || row.createdAt || row.date)}
      </span>
    ),
  },
];

export default function DoctorRevenuePanel({
  invoices, loading, error, total, consultCount, chartData, onRetry,
}) {
  if (error) {
    return (
      <div className="space-y-4">
        <ErrorAlert message={error} />
        <button onClick={onRetry} className={btnPrimary}>Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Revenue Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {loading ? (
          <>
            <SkeletonLoader className="h-28" />
            <SkeletonLoader className="h-28" />
          </>
        ) : (
          <>
            <motion.div whileHover={{ y: -2 }} className={`${cardCls} p-5`}>
              <div className="flex items-start justify-between mb-3">
                <div className="p-2.5 rounded-xl bg-emerald-50">
                  <IndianRupee className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-neutral-900 font-display">{formatCurrency(total)}</p>
              <p className="text-xs text-neutral-900/40 mt-1">Total Revenue (6 months)</p>
            </motion.div>
            <motion.div whileHover={{ y: -2 }} className={`${cardCls} p-5`}>
              <div className="flex items-start justify-between mb-3">
                <div className="p-2.5 rounded-xl bg-blue-50">
                  <ClipboardList className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-neutral-900 font-display">{consultCount}</p>
              <p className="text-xs text-neutral-900/40 mt-1">Paid Consultations</p>
            </motion.div>
          </>
        )}
      </div>

      {/* Chart */}
      <div className={`${cardCls} p-6`}>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="p-2 rounded-xl bg-purple-50">
            <BarChart3 className="h-4 w-4 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold font-display text-neutral-900 text-sm">Monthly Revenue</h3>
            <p className="text-[11px] text-neutral-900/30">Last 6 months trend</p>
          </div>
        </div>

        {loading ? (
          <SkeletonLoader className="h-64 w-full" />
        ) : chartData.length === 0 ? (
          <EmptyState icon={BarChart3} title="No revenue data" message="Revenue chart will appear once you have paid invoices" />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d8" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#1a1f3d66' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#1a1f3d66' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    background: '#fff', border: '1px solid #e5e0d880', borderRadius: 12,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: 12,
                  }}
                  formatter={(v) => [formatCurrency(v), 'Revenue']}
                />
                <Bar dataKey="revenue" fill="url(#revenueGradient)" radius={[6, 6, 0, 0]} />
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0d9488" />
                    <stop offset="100%" stopColor="#14b8a6" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Recent Invoices Table */}
      <div className={`${cardCls} p-6`}>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="p-2 rounded-xl bg-primary-50">
            <FileText className="h-4 w-4 text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold font-display text-neutral-900 text-sm">Recent Paid Invoices</h3>
            <p className="text-[11px] text-neutral-900/30">Your latest completed transactions</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3"><SkeletonLoader className="h-12 w-full" count={4} /></div>
        ) : invoices.length === 0 ? (
          <EmptyState icon={FileText} title="No paid invoices" message="Paid invoices from your consultations will appear here" />
        ) : (
          <DataTable columns={invoiceColumns} data={invoices.slice(0, 10)} />
        )}
      </div>
    </div>
  );
}
