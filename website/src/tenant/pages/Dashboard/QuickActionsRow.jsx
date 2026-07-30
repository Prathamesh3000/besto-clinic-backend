import { useNavigate } from 'react-router-dom';
import { CalendarDays, UserPlus, FileText, ListOrdered, Activity, Users, BarChart3, Package, Settings } from 'lucide-react';
import ClinicQRCard from '../../components/ClinicQRCard';

const QUICK_ACTIONS = [
  { label: 'New Appointment', icon: CalendarDays,  path: '/clinic/appointments',       iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
  { label: 'Add Patient',     icon: UserPlus,      path: '/clinic/patients',           iconBg: 'bg-primary-50',   iconText: 'text-primary-600' },
  { label: 'Create Invoice',  icon: FileText,      path: '/clinic/billing',            iconBg: 'bg-purple-50',    iconText: 'text-purple-600' },
  { label: 'View Queue',      icon: ListOrdered,   path: '/clinic/queue',              iconBg: 'bg-amber-50',     iconText: 'text-amber-600' },
  { label: 'Staff',           icon: Users,         path: '/clinic/staff',              iconBg: 'bg-indigo-50',    iconText: 'text-indigo-600' },
  { label: 'Analytics',       icon: BarChart3,     path: '/clinic/analytics',          iconBg: 'bg-emerald-50',   iconText: 'text-emerald-600' },
  { label: 'Inventory',       icon: Package,       path: '/clinic/inventory',          iconBg: 'bg-orange-50',    iconText: 'text-orange-600' },
  { label: 'Settings',        icon: Settings,      path: '/clinic/settings',           iconBg: 'bg-neutral-100',  iconText: 'text-neutral-600' },
];

export default function QuickActionsRow() {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Quick Actions */}
      <div className="lg:col-span-3 bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
            <Activity className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold font-display text-neutral-900">Quick Actions</h3>
            <p className="text-xs text-neutral-500">Common tasks at your fingertips</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 gap-y-3">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="flex flex-col items-center gap-3 p-4 rounded-xl border border-neutral-200 bg-white hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200"
            >
              <div className={`w-11 h-11 rounded-xl ${action.iconBg} flex items-center justify-center`}>
                <action.icon className={`h-5 w-5 ${action.iconText}`} />
              </div>
              <span className="text-xs font-semibold text-neutral-700 text-center leading-tight">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* QR Card */}
      <div className="lg:col-span-2">
        <ClinicQRCard compact />
      </div>
    </div>
  );
}
