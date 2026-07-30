import ErrorBoundary from '../components/common/ErrorBoundary';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useTenantAuth } from './TenantAuthContext';
import { getClinicSettings, listNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead } from './api';
import { initSocket, disconnectSocket } from '../lib/socket';
import NotificationBell from '../components/NotificationBell';
import { GlobalSearchOverlay, GlobalSearchTrigger, useGlobalSearch } from '../components/GlobalSearch';
import { getTenantSearchConfig } from './globalSearchConfig';
import { ToastProvider } from './ToastContext';
import { DoctorIncomingCallOverlay } from './components/DoctorIncomingCallOverlay';
import { PresenceToggle } from './components/PresenceToggle';
import { EmergencyDock } from './components/EmergencyDock';
import { ActiveCallPill } from '../lib/telemedicine/ActiveCallPill';
import { resolveAssetUrl } from '../lib/assetUrl';
import {
  LayoutDashboard, Building2, Stethoscope, CalendarDays, Users, CreditCard,
  Wallet, BarChart3, Menu, ChevronLeft, ChevronDown, LogOut, Settings,
  Shield, Zap, UserCog, Activity, Video, PieChart, Layers,
  Package, ClipboardCheck, AlertTriangle, QrCode, HeartPulse, Bell, FileText, Clock, RotateCcw,
  CalendarX2, CalendarRange, CalendarClock, Briefcase, Upload, ShoppingCart,
} from 'lucide-react';

const DEDICATED_ROLES = ['doctor', 'receptionist', 'support_staff', 'billing_officer', 'accountant', 'hr_payroll_manager', 'it_support'];

const navGroups = [
  // ─── Admin / Manager ─────────────────────────────
  {
    label: 'Overview',
    items: [
      { to: '/clinic', icon: LayoutDashboard, label: 'Dashboard', end: true, excludeRoles: DEDICATED_ROLES, perm: 'dashboard:view' },
      { to: '/clinic/doctor-dashboard', icon: Activity, label: 'My Dashboard', end: true, roles: ['doctor'] },
      { to: '/clinic/branch-monitor', icon: Building2, label: 'Branch Monitor', excludeRoles: DEDICATED_ROLES, perm: 'branch:read' },
    ],
  },
  {
    label: 'Clinic Operations',
    items: [
      { to: '/clinic/branches', icon: Building2, label: 'Branch Management', excludeRoles: DEDICATED_ROLES, perm: 'branch:read' },
      { to: '/clinic/team-calendar', icon: CalendarRange, label: 'Team Calendar', excludeRoles: DEDICATED_ROLES, perm: 'appointment:read' },
      { to: '/clinic/holidays', icon: CalendarX2, label: 'Holiday Calendar', excludeRoles: DEDICATED_ROLES, perm: 'holiday:read' },
      { to: '/clinic/leave-management', icon: CalendarClock, label: 'Leave Management', excludeRoles: DEDICATED_ROLES, perm: 'user:read' },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/clinic/departments', icon: Layers, label: 'Departments', excludeRoles: DEDICATED_ROLES, perm: 'department:read' },
      { to: '/clinic/roles', icon: Shield, label: 'Roles', excludeRoles: DEDICATED_ROLES, perm: 'user:read' },
      { to: '/clinic/doctors', icon: Stethoscope, label: 'Doctors', excludeRoles: DEDICATED_ROLES, perm: 'user:read' },
      { to: '/clinic/staff', icon: UserCog, label: 'Staff', excludeRoles: DEDICATED_ROLES, perm: 'user:read' },
      { to: '/clinic/patients', icon: Users, label: 'Patients', excludeRoles: DEDICATED_ROLES, perm: 'patient:read' },
      { to: '/clinic/bulk-uploads', icon: Upload, label: 'Bulk Uploads', excludeRoles: DEDICATED_ROLES, perm: 'user:create' },
    ],
  },
  // ─── Doctor ───────────────────────────────────────
  {
    label: 'Clinical',
    items: [
      { to: '/clinic/doctor-appointments', icon: CalendarDays, label: 'Appointments', roles: ['doctor'] },
      { to: '/clinic/doctor-patients', icon: Users, label: 'Patients', roles: ['doctor'] },
      { to: '/clinic/doctor-care-tasks', icon: ClipboardCheck, label: 'Care Tasks', roles: ['doctor'] },
      { to: '/clinic/doctor-virtual-care', icon: Video, label: 'Virtual Care', roles: ['doctor'] },
      { to: '/clinic/doctor-schedule', icon: Clock, label: 'Schedule', roles: ['doctor'] },
    ],
  },
  // ─── Receptionist ─────────────────────────────────
  {
    label: 'Reception',
    items: [
      { to: '/clinic/receptionist-dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true, roles: ['receptionist'] },
      { to: '/clinic/receptionist-appointments', icon: CalendarDays, label: 'Appointments', roles: ['receptionist'] },
      { to: '/clinic/doctor-availability', icon: Activity, label: 'Availability', roles: ['receptionist'] },
      { to: '/clinic/receptionist-patients', icon: Users, label: 'Patients', roles: ['receptionist'] },
      { to: '/clinic/receptionist-queue', icon: Zap, label: 'Queue', roles: ['receptionist'] },
      { to: '/clinic/receptionist-billing', icon: CreditCard, label: 'Billing', roles: ['receptionist'] },
      { to: '/clinic/receptionist-notifications', icon: Bell, label: 'Notifications', roles: ['receptionist'] },
    ],
  },
  // ─── Support Staff ────────────────────────────────
  {
    label: 'Support',
    items: [
      { to: '/clinic/support-dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true, roles: ['support_staff'] },
      { to: '/clinic/support-appointments', icon: CalendarDays, label: 'Appointments', roles: ['support_staff'] },
      { to: '/clinic/support-notifications', icon: Bell, label: 'Notifications', roles: ['support_staff'] },
    ],
  },
  // ─── Billing Officer ──────────────────────────────
  {
    label: 'Billing',
    items: [
      { to: '/clinic/billing-officer-dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true, roles: ['billing_officer'] },
      { to: '/clinic/billing-officer-invoices', icon: FileText, label: 'Invoices', roles: ['billing_officer'] },
      { to: '/clinic/billing-officer-payments', icon: CreditCard, label: 'Payments', roles: ['billing_officer'] },
      { to: '/clinic/billing-officer-credit-notes', icon: RotateCcw, label: 'Credit Notes', roles: ['billing_officer'] },
      { to: '/clinic/billing-officer-insurance', icon: Shield, label: 'Insurance', roles: ['billing_officer'] },
      { to: '/clinic/billing-officer-notifications', icon: Bell, label: 'Notifications', roles: ['billing_officer'] },
    ],
  },
  // ─── Accountant ───────────────────────────────────
  {
    label: 'Accounting',
    items: [
      { to: '/clinic/accountant-dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true, roles: ['accountant'] },
      { to: '/clinic/accountant-invoices', icon: FileText, label: 'Invoices', roles: ['accountant'] },
      { to: '/clinic/accountant-reports', icon: BarChart3, label: 'Reports', roles: ['accountant'] },
      { to: '/clinic/accountant-notifications', icon: Bell, label: 'Notifications', roles: ['accountant'] },
    ],
  },
  // ─── HR / Payroll ─────────────────────────────────
  {
    label: 'Human Resources',
    items: [
      { to: '/clinic/hr-dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true, roles: ['hr_payroll_manager'] },
      { to: '/clinic/hr-staff', icon: Users, label: 'Staff', roles: ['hr_payroll_manager'] },
      { to: '/clinic/hr-payroll', icon: Wallet, label: 'Payroll', roles: ['hr_payroll_manager'] },
      { to: '/clinic/hr-notifications', icon: Bell, label: 'Notifications', roles: ['hr_payroll_manager'] },
    ],
  },
  // ─── IT Support ───────────────────────────────────
  {
    label: 'IT Support',
    items: [
      { to: '/clinic/it-dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true, roles: ['it_support'] },
      { to: '/clinic/it-settings', icon: Settings, label: 'Settings', roles: ['it_support'] },

      { to: '/clinic/it-notifications', icon: Bell, label: 'Notifications', roles: ['it_support'] },
    ],
  },
  // ─── Recruitment ─────────────────────────────────
  {
    label: 'Recruitment',
    items: [
      { to: '/clinic/jobs', icon: Briefcase, label: 'Jobs', excludeRoles: DEDICATED_ROLES, perm: 'job:read' },
    ],
  },
  // ─── Admin: Operations ────────────────────────────
  {
    label: 'Operations',
    items: [
      { to: '/clinic/appointments', icon: CalendarDays, label: 'Appointments', excludeRoles: DEDICATED_ROLES, perm: 'appointment:read' },
      { to: '/clinic/doctor-availability', icon: Activity, label: 'Availability', excludeRoles: DEDICATED_ROLES, perm: 'appointment:read' },
      { to: '/clinic/consultations', icon: Stethoscope, label: 'Consultations', excludeRoles: DEDICATED_ROLES, perm: 'record:read' },
      { to: '/clinic/queue', icon: Zap, label: 'Queue', excludeRoles: DEDICATED_ROLES, perm: 'queue:read' },
      { to: '/clinic/inventory', icon: Package, label: 'Inventory', excludeRoles: DEDICATED_ROLES, perm: 'inventory:read' },
      { to: '/clinic/purchase-orders', icon: ShoppingCart, label: 'Purchase Orders', excludeRoles: DEDICATED_ROLES, perm: 'purchaseOrder:read' },
      { to: '/clinic/telemedicine', icon: Video, label: 'Telemedicine', excludeRoles: DEDICATED_ROLES, perm: 'telemedicine:read' },
    ],
  },
  // ─── Admin: Finance ───────────────────────────────
  {
    label: 'Finance',
    items: [
      { to: '/clinic/billing', icon: CreditCard, label: 'Billing', excludeRoles: DEDICATED_ROLES, perm: 'invoice:read' },
      { to: '/clinic/revenue', icon: BarChart3, label: 'Revenue', excludeRoles: DEDICATED_ROLES, perm: 'revenueReport:view' },
      { to: '/clinic/payroll', icon: Wallet, label: 'Payroll', excludeRoles: DEDICATED_ROLES, perm: 'payroll:read' },
      { to: '/clinic/insurance', icon: Shield, label: 'Insurance', excludeRoles: DEDICATED_ROLES, perm: 'insurance:read' },
    ],
  },
  // ─── Admin: System ────────────────────────────────
  {
    label: 'System',
    items: [
      { to: '/clinic/qr-code', icon: QrCode, label: 'QR Code', excludeRoles: DEDICATED_ROLES, perm: 'clinic:read' },

      { to: '/clinic/notifications', icon: Bell, label: 'Notifications', excludeRoles: DEDICATED_ROLES, perm: 'notification:read' },
      { to: '/clinic/doctor-notifications', icon: Bell, label: 'Notifications', roles: ['doctor'] },
      { to: '/clinic/compliance', icon: HeartPulse, label: 'Compliance', excludeRoles: DEDICATED_ROLES, perm: 'careCompliance:read' },
      { to: '/clinic/analytics', icon: PieChart, label: 'Analytics', excludeRoles: DEDICATED_ROLES, perm: 'clinicAnalytics:view' },
      { to: '/clinic/reports', icon: BarChart3, label: 'Reports', excludeRoles: DEDICATED_ROLES, perm: 'report:generate' },
      { to: '/clinic/settings', icon: Settings, label: 'Settings', excludeRoles: DEDICATED_ROLES, perm: 'clinic:update' },
      { to: '/clinic/booking-policy', icon: ClipboardCheck, label: 'Booking Policy', excludeRoles: DEDICATED_ROLES, perm: 'clinic:update' },
    ],
  },
];

/**
 * Get role-based avatar with appropriate icon and gradient
 */
function getRoleAvatar(role, name) {
  const roleConfig = {
    doctor: {
      icon: Stethoscope,
      gradient: 'from-blue-500 to-blue-700',
    },
    receptionist: {
      icon: UserCog,
      gradient: 'from-purple-500 to-purple-700',
    },
    support_staff: {
      icon: HeartPulse,
      gradient: 'from-pink-500 to-pink-700',
    },
    billing_officer: {
      icon: CreditCard,
      gradient: 'from-green-500 to-green-700',
    },
    accountant: {
      icon: BarChart3,
      gradient: 'from-indigo-500 to-indigo-700',
    },
    hr_payroll_manager: {
      icon: Wallet,
      gradient: 'from-teal-500 to-teal-700',
    },
    it_support: {
      icon: Zap,
      gradient: 'from-yellow-500 to-yellow-700',
    },
    clinic_admin: {
      icon: Shield,
      gradient: 'from-red-500 to-red-700',
    },
    owner: {
      icon: Shield,
      gradient: 'from-red-500 to-red-700',
    },
  };

  const config = roleConfig[role];

  if (config) {
    const IconComponent = config.icon;
    return (
      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${config.gradient} flex items-center justify-center text-white`}>
        <IconComponent className="h-4 w-4" />
      </div>
    );
  }

  // Fallback: initials for unknown roles (admin, manager, etc.)
  const initials = (name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-xs font-semibold">
      {initials}
    </div>
  );
}

/**
 * Get formatted role label for display
 */
function getRoleLabel(role) {
  const roleLabels = {
    doctor: 'Doctor',
    receptionist: 'Receptionist',
    support_staff: 'Support Staff',
    billing_officer: 'Billing Officer',
    accountant: 'Accountant',
    hr_payroll_manager: 'HR & Payroll Manager',
    it_support: 'IT Support',
    clinic_admin: 'Clinic Admin',
    owner: 'Owner',
    admin: 'Administrator',
    manager: 'Manager',
  };

  return roleLabels[role] || (role?.replace(/_/g, ' ') || 'User');
}

export default function TenantLayout() {
  const { user, logout, hasPermission, updateClinic } = useTenantAuth();

  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [clinicData, setClinicData] = useState(null);
  const [logoError, setLogoError] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    getClinicSettings()
      .then((res) => {
        const data = res.data || res;
        setClinicData(data);
        setLogoError(false);
        // Sync fresh clinic data (logo, name, etc.) into auth context
        // so inner pages using useTenantAuth().clinic get the latest values
        if (data) {
          updateClinic({
            name: data.name,
            logo: data.logo || null,
            phone: data.phone || null,
            email: data.email || null,
            address: data.address
              ? [data.address.street, data.address.city, data.address.state, data.address.zipCode].filter(Boolean).join(', ')
              : null,
          });
        }
      })
      .catch(() => {});
  }, [updateClinic]);

  // Initialize WebSocket for real-time notifications
  useEffect(() => {
    initSocket();
    return () => disconnectSocket();
  }, []);

  const notificationApi = useMemo(() => ({
    listNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead,
  }), []);

  const notificationViewAllPath = {
    doctor: '/clinic/doctor-notifications',
    receptionist: '/clinic/receptionist-notifications',
    support_staff: '/clinic/support-notifications',
    billing_officer: '/clinic/billing-officer-notifications',
    accountant: '/clinic/accountant-notifications',
    hr_payroll_manager: '/clinic/hr-notifications',
    it_support: '/clinic/it-notifications',
  }[user?.role] || '/clinic/notifications';

  // Sync browser tab title with current page
  useEffect(() => {
    const allItems = navGroups.flatMap((g) => g.items);
    const match = allItems.find((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
    );
    const pageLabel = match?.label || 'Dashboard';
    const clinicName = clinicData?.name;
    document.title = clinicName
      ? `${pageLabel} — ${clinicName} | BestoClinic`
      : `${pageLabel} | BestoClinic`;
  }, [location.pathname, clinicData]);

  // Ensure dark class is never on the root
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('theme');
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [profileOpen]);

  const handleLogout = () => {
    logout();
    navigate('/clinic/login');
  };

  // Filter nav groups by role + permissions
  const filteredGroups = navGroups.map((group) => ({
    ...group,
    items: group.items.filter(item => {
      // Role-based filtering (doctor-specific screens)
      if (item.roles && !item.roles.includes(user?.role)) return false;
      if (item.excludeRoles && item.excludeRoles.includes(user?.role)) return false;
      // Permission-based filtering
      if (item.perm && !hasPermission(item.perm)) return false;
      return true;
    }),
  })).filter(g => g.items.length > 0);

  // ─── Global search ─────────────────────────────────
  const searchableNavItems = useMemo(
    () => filteredGroups.flatMap((g) => g.items),
    [filteredGroups],
  );
  const searchConfig = useMemo(
    () => getTenantSearchConfig(searchableNavItems),
    [searchableNavItems],
  );
  const search = useGlobalSearch(searchConfig);

  // ─── Collapsible section logic ───────────────────────
  // Auto-expand the section that contains the current route
  const activeGroupLabel = useMemo(() => {
    for (const g of filteredGroups) {
      for (const item of g.items) {
        if (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)) {
          return g.label;
        }
      }
    }
    return filteredGroups[0]?.label || '';
  }, [filteredGroups, location.pathname]);

  const [expandedSections, setExpandedSections] = useState([activeGroupLabel]);

  // Keep the active section expanded when route changes
  useEffect(() => {
    if (activeGroupLabel && !expandedSections.includes(activeGroupLabel)) {
      setExpandedSections([activeGroupLabel]);
    }
  }, [activeGroupLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSection = (label) => {
    setExpandedSections((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  };

  // ─── Sidebar content (shared between desktop & mobile) ───
  const SidebarContent = ({ isMobile = false }) => {
    const isExpanded = isMobile || !collapsed;

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Logo zone */}
        <div className={`flex items-center gap-3 shrink-0 border-b border-neutral-200 transition-all duration-300 ${isExpanded ? 'px-5 py-5' : 'px-0 py-5 justify-center'}`}>
          {clinicData?.logo && !logoError ? (
            <img
              src={resolveAssetUrl(clinicData.logo)}
              alt={clinicData.name || 'Clinic'}
              className="w-9 h-9 rounded-lg object-contain shrink-0"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {(clinicData?.name || 'C')[0]}
            </div>
          )}
          <div className={`min-w-0 transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
            <p className="text-sm font-bold text-neutral-900 font-display truncate whitespace-nowrap">{clinicData?.name || 'Clinic'}</p>
            <p className="text-[10px] text-neutral-500 truncate whitespace-nowrap">{
              { receptionist: 'Reception', doctor: 'Doctor', support_staff: 'Support', billing_officer: 'Billing', accountant: 'Accounting', hr_payroll_manager: 'Human Resources', it_support: 'IT Support' }[user?.role] || 'Clinic Admin'
            }</p>
          </div>
        </div>

        {/* Navigation — collapsible accordion sections */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {filteredGroups.map((group, groupIdx) => {
            const isSectionOpen = !isExpanded || isMobile || expandedSections.includes(group.label);

            return (
              <div key={group.label} className={groupIdx > 0 ? 'mt-3' : 'mt-1'}>
                {/* Section label — clickable toggle when sidebar expanded */}
                {isExpanded ? (
                  <button
                    onClick={() => !isMobile && toggleSection(group.label)}
                    className="w-full flex items-center justify-between px-3 mb-1 py-1 rounded-lg text-[11px] font-semibold text-neutral-400 uppercase tracking-wider whitespace-nowrap hover:text-neutral-500 transition-colors"
                  >
                    {group.label}
                    {!isMobile && (
                      <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isSectionOpen ? 'rotate-0' : '-rotate-90'}`} />
                    )}
                  </button>
                ) : (
                  <div className="mx-3 mb-1.5 border-t border-neutral-100" />
                )}

                {/* Nav items — collapsible */}
                <div
                  className={`space-y-0.5 transition-all duration-200 overflow-hidden ${
                    isSectionOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  {group.items.map(({ to, icon: Icon, label, end }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      title={!isExpanded ? label : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `group relative flex items-center h-10 rounded-xl text-sm font-medium transition-all duration-200 ${
                          isExpanded ? 'gap-3 px-3' : 'justify-center px-0'
                        } ${
                          isActive
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary-600 rounded-r-full" />
                          )}
                          <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-primary-600' : 'text-neutral-400 group-hover:text-neutral-600'}`} />
                          <span className={`truncate whitespace-nowrap transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                            {label}
                          </span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User zone */}
        <div className={`shrink-0 border-t border-neutral-200 transition-all duration-300 ${isExpanded ? 'px-5 py-4' : 'px-0 py-4 flex justify-center'}`}>
          <div className={`flex items-center ${isExpanded ? 'gap-3' : ''}`} title={!isExpanded ? (user?.name || 'User') : undefined}>
            {getRoleAvatar(user?.role, user?.name)}
            <div className={`min-w-0 flex-1 transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
              <p className="text-[13px] font-semibold text-neutral-800 truncate whitespace-nowrap">{user?.name || 'User'}</p>
              <p className="text-[11px] text-neutral-500 truncate capitalize whitespace-nowrap">{getRoleLabel(user?.role)}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-neutral-50">
      {/* Full-screen incoming-call takeover + persistent active-call return pill.
          Doctor-scoped: patients interact with their own variant in PatientLayout. */}
      {user?.role === 'doctor' && <DoctorIncomingCallOverlay />}
      <ActiveCallPill />

      {/* ─── Desktop sidebar — §7.4: 256px/72px, white, border-right ─── */}
      <aside className={`hidden lg:flex flex-col bg-white border-r border-neutral-200 shrink-0 relative transition-[width] duration-300 ease-in-out ${collapsed ? 'w-[72px]' : 'w-64'}`}>
        <SidebarContent />
        {/* Collapse toggle — floats on sidebar edge */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-[72px] w-6 h-6 bg-white border border-neutral-200 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50 shadow-sm transition-colors z-10"
        >
          <ChevronLeft className={`h-3.5 w-3.5 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {/* ─── Mobile sidebar overlay ─── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-neutral-950/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 h-full bg-white shadow-[var(--shadow-xl)]">
            <SidebarContent isMobile />
          </aside>
        </div>
      )}

      {/* ─── Main content ─── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header — §7.5: 64px, white, solid, sticky, z-30 */}
        <header className="h-16 bg-white border-b border-neutral-200 flex items-center justify-between px-6 shrink-0 sticky top-0 z-30">
          {/* Left zone */}
          <div className="flex items-center gap-4">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400">
              <Menu className="h-5 w-5" />
            </button>
            <GlobalSearchTrigger onClick={() => search.setOpen(true)} />
          </div>

          {/* Right zone — §7.5: gap 8px, presence + bell + avatar */}
          <div className="flex items-center gap-2">
            {/* Doctor-only: self-presence toggle (online/busy/dnd/offline) */}
            {user?.role === 'doctor' && (
              <PresenceToggle
                userId={user?._id || user?.id}
                initialStatus={user?.presence?.status || 'online'}
                className="hidden md:block"
              />
            )}

            {/* Doctor-only: live emergency queue dropdown */}
            {user?.role === 'doctor' && <EmergencyDock role="doctor" />}

            <NotificationBell apiModule={notificationApi} viewAllPath={notificationViewAllPath} />

            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-xl hover:bg-neutral-100 transition"
              >
                {/* Role-based avatar with icons */}
                {getRoleAvatar(user?.role, user?.name)}
                {/* Full name display */}
                <div className="hidden sm:flex flex-col items-start">
                  <span className="text-sm font-medium text-neutral-800 leading-tight">{user?.name || 'User'}</span>
                  <span className="text-[10px] text-neutral-500 capitalize leading-tight">
                    {getRoleLabel(user?.role)}
                  </span>
                </div>
              </button>

              {/* Dropdown — §7.5: 12px radius, shadow-lg, 6px padding, z-100 */}
              {profileOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-[var(--shadow-lg)] border border-neutral-200 p-1.5 z-[100]">
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/clinic/settings');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg transition"
                  >
                    <Settings className="h-4 w-4 text-neutral-500" /> Settings
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
                  >
                    <LogOut className="h-4 w-4" /> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <ToastProvider>
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </ToastProvider>
        </main>
      </div>

      <GlobalSearchOverlay
        {...search}
        placeholder={searchConfig.placeholder}
        categoryIcons={searchConfig.categoryIcons}
      />
    </div>
  );
}
