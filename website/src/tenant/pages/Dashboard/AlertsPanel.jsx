import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Package, ArrowRight, CheckCircle2 } from 'lucide-react';
import { AlertsSkeleton } from './skeletons';

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function AlertsPanel({ lowStock, expiring, loading }) {
  const navigate = useNavigate();

  if (loading) return <AlertsSkeleton />;

  const lowItems = lowStock || [];
  const expiringItems = expiring || [];
  const totalAlerts = lowItems.length + expiringItems.length;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            totalAlerts > 0 ? 'bg-amber-50' : 'bg-secondary-50'
          }`}>
            {totalAlerts > 0 ? (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-secondary-600" />
            )}
          </div>
          <div>
            <h3 className="text-[15px] font-semibold font-display text-neutral-900">
              {totalAlerts > 0 ? 'Alerts & Attention Required' : 'Inventory Status'}
            </h3>
            <p className="text-xs text-neutral-500">
              {totalAlerts > 0
                ? `${totalAlerts} item${totalAlerts !== 1 ? 's' : ''} need attention`
                : 'All inventory levels healthy'}
            </p>
          </div>
          {totalAlerts > 0 && (
            <span className="ml-auto px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-700 rounded-full">
              {totalAlerts}
            </span>
          )}
        </div>
        <button
          onClick={() => navigate('/clinic/inventory')}
          className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors"
        >
          Inventory <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {totalAlerts === 0 ? (
        <div className="flex items-center justify-center py-8 text-xs text-secondary-600">
          <CheckCircle2 className="h-5 w-5 mr-2 opacity-60" />
          All stock levels and expiry dates are within safe limits
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Low Stock */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Package className="h-4 w-4 text-amber-500" />
              <h4 className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">Low Stock</h4>
              {lowItems.length > 0 && (
                <span className="text-[10px] font-medium bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full">
                  {lowItems.length}
                </span>
              )}
            </div>
            {lowItems.length === 0 ? (
              <p className="text-xs text-neutral-400 py-2">All stock levels normal</p>
            ) : (
              <div className="space-y-2">
                {lowItems.slice(0, 5).map((item, i) => {
                  const available = (item.currentStock || 0) - (item.reservedStock || 0);
                  const threshold = item.minimumThreshold || item.reorderLevel || 10;
                  const pct = Math.min(100, (available / threshold) * 100);
                  return (
                    <div key={item._id || i} className="p-2.5 rounded-lg bg-amber-50/50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-neutral-700 truncate">{item.name}</span>
                        <span className={`text-[11px] font-semibold ${
                          pct < 25 ? 'text-red-600' : 'text-amber-600'
                        }`}>
                          {available} {item.unit || 'units'}
                        </span>
                      </div>
                      <div className="h-1 bg-amber-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pct < 25 ? 'bg-red-500' : 'bg-amber-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {lowItems.length > 5 && (
                  <button
                    onClick={() => navigate('/clinic/inventory')}
                    className="text-[11px] text-primary-600 hover:text-primary-700 font-medium"
                  >
                    +{lowItems.length - 5} more items →
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Expiring Soon */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <h4 className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">Expiring Soon</h4>
              {expiringItems.length > 0 && (
                <span className="text-[10px] font-medium bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full">
                  {expiringItems.length}
                </span>
              )}
            </div>
            {expiringItems.length === 0 ? (
              <p className="text-xs text-neutral-400 py-2">No items expiring soon</p>
            ) : (
              <div className="space-y-2">
                {expiringItems.slice(0, 5).map((item, i) => {
                  const days = daysUntil(item.expiryDate);
                  const isUrgent = days !== null && days < 7;
                  return (
                    <div key={item._id || i} className={`p-2.5 rounded-lg ${isUrgent ? 'bg-red-50/50' : 'bg-amber-50/50'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-neutral-700 truncate">{item.name}</span>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          isUrgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {days !== null ? (days <= 0 ? 'Expired' : `${days}d left`) : '—'}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        {item.currentStock || 0} {item.unit || 'units'} in stock
                        {item.expiryDate && ` · Expires ${new Date(item.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`}
                      </p>
                    </div>
                  );
                })}
                {expiringItems.length > 5 && (
                  <button
                    onClick={() => navigate('/clinic/inventory')}
                    className="text-[11px] text-primary-600 hover:text-primary-700 font-medium"
                  >
                    +{expiringItems.length - 5} more items →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
