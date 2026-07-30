import ErrorBoundary from '../components/common/ErrorBoundary';
import { useState, useRef, useEffect, useMemo } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useSafePlatformAuth } from '../hooks/useSafeAuth';
import { GlobalSearchOverlay, GlobalSearchTrigger, useGlobalSearch } from '../components/GlobalSearch';
import { getPlatformSearchConfig } from './globalSearchConfig';
import {
  LayoutDashboard, Building2, CreditCard, Tag,
  ToggleLeft, Users, ChevronLeft, LogOut, Menu,
  DollarSign, BarChart3, Wrench, Search, Bell, Activity,
  ChevronDown, Settings, User, Monitor, ScanLine, Briefcase,
} from 'lucide-react';

const navGroups = [
  {
    label: 'Overview',
    items: [
      { to: '/platform', icon: LayoutDashboard, label: 'Dashboard', end: true },
    ],
  },
  {
    label: 'Management',
    items: [
      { to: '/platform/tenants', icon: Building2, label: 'Tenants' },
      { to: '/platform/plans', icon: CreditCard, label: 'Plans' },
      { to: '/platform/custom-plan-builder', icon: Wrench, label: 'Plan Builder' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { to: '/platform/subscription-analytics', icon: BarChart3, label: 'Subscriptions' },
      { to: '/platform/revenue', icon: DollarSign, label: 'Revenue' },
      { to: '/platform/analytics', icon: Activity, label: 'Analytics' },
      { to: '/platform/dental-scan-analytics', icon: ScanLine, label: 'Dental Scans' },
      { to: '/platform/job-portal', icon: Briefcase, label: 'Job Portal' },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { to: '/platform/promotions', icon: Tag, label: 'Promotions' },
      { to: '/platform/feature-flags', icon: ToggleLeft, label: 'Feature Flags' },
      { to: '/platform/users', icon: Users, label: 'Platform Users' },
      { to: '/platform/monitoring', icon: Monitor, label: 'Monitoring' },
    ],
  },
];

export default function PlatformLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, logout } = useSafePlatformAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const profileRef = useRef(null);

  // ─── Global search ─────────────────────────────────
  const allPlatformNavItems = useMemo(
    () => navGroups.flatMap((g) => g.items),
    [],
  );
  const platformSearchConfig = useMemo(
    () => getPlatformSearchConfig(allPlatformNavItems),
    [allPlatformNavItems],
  );
  const search = useGlobalSearch(platformSearchConfig);

  const handleLogout = () => {
    logout();
    navigate('/platform/login');
  };

  // Close mobile nav on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Get initials from user
  const initials = (user?.name || user?.email || 'A')
    .split(/[\s@]/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  // Get page title from location
  const getPageTitle = () => {
    for (const group of navGroups) {
      for (const item of group.items) {
        const match = item.end
          ? location.pathname === item.to
          : location.pathname.startsWith(item.to);
        if (match) return item.label;
      }
    }
    return 'Platform Admin';
  };

  // Sync browser tab title with current page
  useEffect(() => {
    document.title = `${getPageTitle()} — Platform Admin | BestoClinic`;
  }, [location.pathname]);

  const SidebarContent = ({ mobile = false }) => (
    <aside
      className={`bg-gradient-to-b from-primary-950 via-primary-950 to-primary-900 text-white flex flex-col transition-all duration-300 ${
        mobile
          ? 'fixed inset-y-0 left-0 z-50 w-[264px]'
          : collapsed
            ? 'w-[68px]'
            : 'w-[264px]'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-white/8">
        {(!collapsed || mobile) && (
          <div className="flex items-center gap-2.5">
            <img src="/platform_admin/logo/Besto Clinic Logo.svg" alt="BestoClinic" className="w-8 h-8" />
            <span className="text-base font-bold font-display tracking-tight">BestoClinic</span>
          </div>
        )}
        <button
          onClick={() => mobile ? setMobileOpen(false) : setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-white/8 transition-colors"
        >
          <ChevronLeft className={`h-4 w-4 text-primary-300 transition-transform duration-300 ${collapsed && !mobile ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-2">
            {(!collapsed || mobile) && (
              <p className="px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-400/60">
                {group.label}
              </p>
            )}
            {group.items.map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 mx-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-200 group ${
                    isActive
                      ? 'bg-white/12 text-white font-medium shadow-sm shadow-black/10'
                      : 'text-primary-300/70 hover:bg-white/6 hover:text-white'
                  }`
                }
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                {(!collapsed || mobile) && <span className="truncate">{label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="px-3 py-4 border-t border-white/8">
        {(!collapsed || mobile) ? (
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/6 transition-colors">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name || 'Admin'}</p>
              <p className="text-[11px] text-primary-400/60 truncate">{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-white/10 text-primary-400/60 hover:text-white transition-colors" title="Logout">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            className="w-full flex justify-center p-2 rounded-lg hover:bg-white/8 text-primary-400/60 hover:text-white transition-colors"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-neutral-100">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <SidebarContent />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-sm z-40 md:hidden" onClick={() => setMobileOpen(false)} />
          <SidebarContent mobile />
        </>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-neutral-300/60 px-4 md:px-6 py-0 flex items-center gap-4 h-[60px] shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-2 rounded-lg hover:bg-neutral-200/60 text-neutral-900/50"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Page title */}
          <h1 className="text-base font-semibold font-display text-neutral-900 hidden sm:block">
            {getPageTitle()}
          </h1>

          {/* Global search trigger */}
          <div className="ml-auto mr-4">
            <GlobalSearchTrigger onClick={() => search.setOpen(true)} />
          </div>

          {/* Right section */}
          <div className="flex items-center gap-2 ml-auto lg:ml-0">
            {/* Notifications */}
            <button className="relative p-2 rounded-lg hover:bg-neutral-200/60 text-neutral-900/40 hover:text-neutral-900/60 transition-colors">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </button>

            {/* Profile dropdown */}
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 p-1.5 pr-3 rounded-xl hover:bg-neutral-200/60 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-xs font-bold text-white">
                  {initials}
                </div>
                <ChevronDown className={`h-3.5 w-3.5 text-neutral-900/40 transition-transform duration-200 hidden sm:block ${profileOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown */}
              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl border border-neutral-300/60 shadow-[0_10px_40px_-5px_rgba(0,0,0,0.15),0_4px_12px_-2px_rgba(0,0,0,0.08)] py-2 z-[100]">
                  <div className="px-4 py-3 border-b border-neutral-300/40">
                    <p className="text-sm font-semibold text-neutral-900">{user?.name || 'Admin'}</p>
                    <p className="text-xs text-neutral-900/40 truncate">{user?.email}</p>
                  </div>
                  <div className="py-1">
                    <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-900/70 hover:bg-neutral-100 transition-colors">
                      <User className="h-4 w-4" /> Profile
                    </button>
                    <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-900/70 hover:bg-neutral-100 transition-colors">
                      <Settings className="h-4 w-4" /> Settings
                    </button>
                  </div>
                  <div className="border-t border-neutral-300/40 pt-1">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="h-4 w-4" /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <GlobalSearchOverlay
        {...search}
        placeholder={platformSearchConfig.placeholder}
        categoryIcons={platformSearchConfig.categoryIcons}
      />
    </div>
  );
}
