import { useNavigate } from 'react-router-dom';
import { Stethoscope, ArrowRight } from 'lucide-react';
import { DoctorsSkeleton } from './skeletons';

const formatCurrency = (n) => {
  if (!n) return '₹0';
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
};

export default function DoctorLeaderboard({ doctors, loading }) {
  const navigate = useNavigate();

  if (loading) return <DoctorsSkeleton />;

  const sorted = [...(doctors || [])].sort((a, b) => (b.revenue || 0) - (a.revenue || 0));

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
            <Stethoscope className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold font-display text-neutral-900">Doctor Performance</h3>
            <p className="text-xs text-neutral-500">This month's leaders</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/clinic/analytics')}
          className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors"
        >
          Analytics <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* Horizontal scrolling cards */}
      {sorted.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-xs text-neutral-400">
          No doctor performance data available
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {sorted.map((doc, i) => {
            const initial = (doc.doctorName || '?')[0].toUpperCase();
            const completionRate = doc.totalAppointments > 0
              ? ((doc.completed || 0) / doc.totalAppointments * 100)
              : 0;

            return (
              <div
                key={doc.doctorId || i}
                className="min-w-[200px] max-w-[220px] p-4 rounded-xl border border-neutral-200 bg-white hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200 snap-start shrink-0"
              >
                {/* Doctor info */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-sm font-semibold text-white shrink-0">
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-neutral-800 truncate">
                      {doc.doctorName || 'Unknown'}
                    </p>
                    <p className="text-[11px] text-neutral-500 truncate">
                      {doc.totalAppointments || 0} appointments
                    </p>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span className="text-neutral-500">Revenue</span>
                  <span className="font-semibold text-secondary-700">{formatCurrency(doc.revenue)}</span>
                </div>
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span className="text-neutral-500">Avg/Visit</span>
                  <span className="font-medium text-neutral-700">{formatCurrency(doc.avgRevenuePerVisit)}</span>
                </div>

                {/* Completion rate bar */}
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-neutral-400">Completion</span>
                  <span className="text-neutral-600 font-medium">{completionRate.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-secondary-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, completionRate)}%` }}
                  />
                </div>

                {/* No-show indicator */}
                {doc.noShowRate > 0 && (
                  <p className="text-[10px] text-amber-600 mt-2">
                    {doc.noShowRate.toFixed(1)}% no-show rate
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
