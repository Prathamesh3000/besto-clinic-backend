import ErrorBoundary from '../components/common/ErrorBoundary';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSafeTenantAuth, useSafePatientAuth } from '../hooks/useSafeAuth';
import { initSocket, disconnectSocket } from '../lib/socket';
import NotificationBell from '../components/NotificationBell';
import { GlobalSearchOverlay, GlobalSearchTrigger, useGlobalSearch } from '../components/GlobalSearch';
import { getPatientSearchConfig } from './globalSearchConfig';
import { IncomingCallOverlay } from '../lib/telemedicine/IncomingCallOverlay';
import { ActiveCallPill } from '../lib/telemedicine/ActiveCallPill';
import { useCallBridge } from '../lib/telemedicine/useCallBridge';
import {
  listNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead,
} from './api';
import {
  LayoutDashboard, CalendarDays, Pill, FileText, CreditCard,
  Bell, Menu, X, ChevronDown, Check, LogOut, Heart,
  MoreHorizontal, Home, ChevronRight, User, Users,
  Share2, ShieldCheck, Star, Eye,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════
   Navigation structure — grouped with section labels

   Note on `activeWhen`:
   `NavLink` only compares pathnames, so sibling items that share a pathname
   but differ by query string (e.g. /patient/health vs /patient/health?tab=records)
   would otherwise light up together. Items that need query-param disambiguation
   declare their own `activeWhen(location)` predicate below.
   ═══════════════════════════════════════════════════ */
const getParam = (search, key) => new URLSearchParams(search).get(key);

const NAV_GROUPS = [
  {
    items: [
      { to: '/patient', icon: LayoutDashboard, label: 'Dashboard', end: true },
      { to: '/patient/appointments', icon: CalendarDays, label: 'Appointments' },
    ],
  },
  {
    title: 'Health',
    items: [
      {
        to: '/patient/health',
        icon: Pill,
        label: 'Prescriptions',
        activeWhen: (loc) =>
          loc.pathname === '/patient/health' && getParam(loc.search, 'tab') !== 'records',
      },
      {
        to: '/patient/health?tab=records',
        icon: FileText,
        label: 'Medical Records',
        activeWhen: (loc) =>
          loc.pathname === '/patient/health' && getParam(loc.search, 'tab') === 'records',
      },
    ],
  },
  {
    title: 'Account',
    items: [
      { to: '/patient/profile', icon: User, label: 'My Profile', end: true },
      { to: '/patient/payments', icon: CreditCard, label: 'Billing & Payments' },
      { to: '/patient/notifications', icon: Bell, label: 'Notifications' },
    ],
  },
  {
    title: 'More',
    collapsible: true,
    items: [
      {
        to: '/patient/share-records',
        icon: Share2,
        label: 'Share Records',
        end: true,
      },
      {
        to: '/patient/consents',
        icon: ShieldCheck,
        label: 'Consents',
        end: true,
      },
      {
        to: '/patient/reviews',
        icon: Star,
        label: 'Reviews',
        end: true,
      },
      {
        to: '/patient/activity-log',
        icon: Eye,
        label: 'Activity Log',
        end: true,
      },
      {
        to: '/patient/dependents',
        icon: Users,
        label: 'Dependents',
        end: true,
        guardianOnly: true,
      },
    ],
  },
];

/** Resolve whether a nav item is currently active for the given location. */
function isNavItemActive(location, item) {
  if (item.activeWhen) return item.activeWhen(location);
  const base = item.to.split('?')[0];
  if (item.end) return location.pathname === base;
  return location.pathname === base || location.pathname.startsWith(`${base}/`);
}

const BOTTOM_TABS = [
  { to: '/patient', icon: Home, label: 'Home', end: true },
  { to: '/patient/appointments', icon: CalendarDays, label: 'Appts' },
  { to: '/patient/health', icon: Pill, label: 'Health' },
  { to: '/patient/payments', icon: CreditCard, label: 'Pay' },
  { icon: MoreHorizontal, label: 'More', action: 'menu' },
];

const MAIN_TAB_PATHS = ['/patient', '/patient/appointments', '/patient/health', '/patient/payments'];

const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function first(name) {
  return (name || '').split(' ')[0] || 'there';
}

/* ═══════════════════════════════════════════════════
   PatientLayout
   ═══════════════════════════════════════════════════ */
export default function PatientLayout() {
  const { user, logout } = useSafeTenantAuth();
  const { patients, activePatient, activePatientId, switchPatient, isGuardian } =
    useSafePatientAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const userMenuRef = useRef(null);

  // Auto-expand "More" section when a More-route is active
  const moreRouteActive = NAV_GROUPS
    .find((g) => g.collapsible)
    ?.items.some(({ to }) => location.pathname.startsWith(to.split('?')[0]));
  const showMore = moreOpen || moreRouteActive;

  // ─── Global search ─────────────────────────────────
  const patientSearchConfig = useMemo(
    () => getPatientSearchConfig(ALL_NAV, activePatientId),
    [activePatientId],
  );
  const search = useGlobalSearch(patientSearchConfig);

  /* ── Auth guard ── */
  const hasToken = !!localStorage.getItem('tenant_token');
  if (!hasToken || user?.role === 'clinic_admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 flex flex-col items-center justify-center px-4 gap-8 relative overflow-hidden">
        <div className="absolute top-16 left-16 w-72 h-72 rounded-full bg-primary-100/30 blur-3xl pointer-events-none" />
        <div className="absolute bottom-16 right-16 w-96 h-96 rounded-full bg-secondary-100/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center gap-6 max-w-sm text-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20">
            <Heart className="w-10 h-10 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 font-display">
              Your Health Hub
            </h1>
            <p className="text-sm text-neutral-500 mt-3 leading-relaxed">
              Sign in to manage your appointments, prescriptions, and health
              records — all in one place.
            </p>
          </div>
          <div className="flex gap-3 w-full">
            <Link
              to="/patient/login"
              className="flex-1 py-3 text-sm font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl hover:shadow-lg hover:shadow-primary-500/25 transition-all text-center"
            >
              Sign In
            </Link>
            <Link
              to="/patient/register"
              className="flex-1 py-3 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200/60 rounded-xl hover:bg-primary-100 transition text-center"
            >
              Register
            </Link>
          </div>
          <Link
            to="/"
            className="text-xs text-neutral-400 hover:text-neutral-600 transition mt-2"
          >
            &larr; Back to Home
          </Link>
        </div>
      </div>
    );
  }

  /* ── Side effects ── */
  useEffect(() => {
    initSocket();
    return () => disconnectSocket();
  }, []);

  // Global telemedicine bridge: feeds callStore from socket events.
  useCallBridge({ currentUserId: user?.id });

  const notifApi = useMemo(
    () => ({
      listNotifications,
      getUnreadCount,
      markNotificationRead,
      markAllNotificationsRead,
    }),
    [],
  );

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('theme');
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target))
        setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const match = ALL_NAV.find((i) =>
      i.end ? location.pathname === i.to : location.pathname.startsWith(i.to),
    );
    document.title = `${match?.label || 'Patient Portal'} — BestoClinic`;
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('active_patient_id');
    logout();
    navigate('/patient/login');
  };

  const pageTitle = useMemo(() => {
    const m = ALL_NAV.find((i) =>
      i.end
        ? location.pathname === i.to
        : location.pathname.startsWith(i.to),
    );
    return m?.label || 'Patient Portal';
  }, [location.pathname]);

  /* ═══ RENDER ═══ */
  // h-[100dvh] overrides the h-screen fallback: on mobile browsers 100vh includes
  // the area behind the collapsing address bar, so the last rows of a long list
  // sat under the browser chrome / fixed bottom nav and could not be scrolled
  // into view. dvh tracks the actually-visible viewport.
  return (
    <div className="flex h-screen h-[100dvh] bg-[#f8f9fb] print:h-auto print:bg-white print:block">
      {/* ─────────────────────────────────────────────
          DESKTOP SIDEBAR
         ───────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-[260px] bg-white shadow-[2px_0_32px_-12px_rgba(0,0,0,0.05)] relative z-20 shrink-0">
        {/* Greeting header */}
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-base shadow-md shadow-primary-500/20">
              {(activePatient?.name || user?.name || 'U')[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-neutral-400 font-medium">
                {greeting()},
              </p>
              <p className="text-[15px] font-bold text-neutral-900 font-display truncate">
                {first(activePatient?.name || user?.name)}
              </p>
            </div>
          </div>

          {/* Guardian profile switcher */}
          {isGuardian && (
            <button
              onClick={() => setProfileSheetOpen(true)}
              className="mt-3 w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-primary-50/60 hover:bg-primary-50 border border-primary-100/80 transition-colors"
            >
              <div className="w-6 h-6 rounded-lg bg-primary-100 flex items-center justify-center">
                <ChevronDown className="h-3.5 w-3.5 text-primary-600" />
              </div>
              <span className="text-xs font-medium text-primary-700 truncate flex-1 text-left">
                {activePatient?.name || 'Switch profile'}
              </span>
              <span className="text-[10px] text-primary-400 font-mono">
                {activePatient?.patientId}
              </span>
            </button>
          )}
        </div>

        {/* Gradient divider */}
        <div className="mx-5 h-px bg-gradient-to-r from-transparent via-neutral-200 to-transparent" />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {/* Static section header */}
              {group.title && !group.collapsible && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-300 select-none">
                  {group.title}
                </p>
              )}

              {/* Collapsible header */}
              {group.collapsible && (
                <button
                  onClick={() => setMoreOpen(!moreOpen)}
                  className="w-full flex items-center justify-between px-3 mb-1.5"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-300 select-none">
                    {group.title}
                  </span>
                  <ChevronRight
                    className={`h-3 w-3 text-neutral-300 transition-transform duration-200 ${
                      showMore ? 'rotate-90' : ''
                    }`}
                  />
                </button>
              )}

              {/* Nav items */}
              <AnimatePresence initial={false}>
                {(!group.collapsible || showMore) && (
                  <motion.div
                    initial={group.collapsible ? { height: 0, opacity: 0 } : false}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={group.collapsible ? { height: 0, opacity: 0 } : undefined}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="space-y-0.5 overflow-hidden"
                  >
                    {group.items.filter((i) => !i.guardianOnly || isGuardian).map((item) => {
                      const { to, icon: Icon, label } = item;
                      const isActive = isNavItemActive(location, item);
                      return (
                        <Link
                          key={to}
                          to={to}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 relative group ${
                            isActive
                              ? 'bg-primary-50 text-primary-700'
                              : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
                          }`}
                        >
                          {isActive && (
                            <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary-500" />
                          )}
                          <Icon
                            className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                              isActive ? 'text-primary-600' : 'text-neutral-400 group-hover:text-neutral-500'
                            }`}
                          />
                          <span className="truncate">{label}</span>
                        </Link>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </nav>

        {/* Bottom: clinic branding */}
        <div className="px-5 py-4 border-t border-neutral-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-[10px] shadow-sm">
              B
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-neutral-500 truncate">
                BestoClinic
              </p>
              <p className="text-[9px] text-neutral-300">Patient Portal</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ─────────────────────────────────────────────
          MAIN CONTENT
         ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — glass effect */}
        <header className="h-[60px] bg-white/80 backdrop-blur-xl border-b border-neutral-200/50 flex items-center justify-between px-4 md:px-6 shrink-0 z-30 sticky top-0">
          {/* Left */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-1 rounded-xl hover:bg-neutral-100 text-neutral-400 transition"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Page title — desktop */}
            <h1 className="hidden md:block text-[15px] font-semibold text-neutral-800 font-display">
              {pageTitle}
            </h1>

            {/* Patient identity — mobile, non-guardian */}
            {!isGuardian && activePatient && (
              <div className="flex md:hidden items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-[11px] font-bold">
                  {activePatient.name?.[0] || '?'}
                </div>
                <span className="text-sm font-semibold text-neutral-800 truncate max-w-[140px]">
                  {first(activePatient.name)}
                </span>
              </div>
            )}

            {/* Guardian switcher — mobile */}
            {isGuardian && (
              <button
                onClick={() => setProfileSheetOpen(true)}
                className="flex md:hidden items-center gap-2 px-2.5 py-1.5 rounded-xl bg-neutral-50 hover:bg-neutral-100 transition"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-[11px] font-bold">
                  {activePatient?.name?.[0] || '?'}
                </div>
                <span className="text-sm font-medium text-neutral-700 truncate max-w-[100px]">
                  {first(activePatient?.name)}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
              </button>
            )}
          </div>

          {/* Right */}
          <div className="flex items-center gap-1.5">
            <GlobalSearchTrigger onClick={() => search.setOpen(true)} />

            <NotificationBell
              apiModule={notifApi}
              viewAllPath="/patient/notifications"
            />

            {/* User avatar + menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="p-1.5 rounded-xl hover:bg-neutral-100 transition"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-neutral-700 to-neutral-900 flex items-center justify-center text-white text-xs font-bold">
                  {(user?.name || 'U')[0].toUpperCase()}
                </div>
              </button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-[0_12px_48px_-8px_rgba(0,0,0,0.12)] border border-neutral-200/60 overflow-hidden z-[100]"
                  >
                    <div className="px-4 py-3 bg-neutral-50/80">
                      <p className="text-sm font-semibold text-neutral-900 truncate">
                        {user?.name || 'User'}
                      </p>
                      <p className="text-[11px] text-neutral-400 capitalize mt-0.5">
                        {user?.role?.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div className="p-1.5">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition font-medium"
                      >
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 print:p-0 print:pb-0 print:overflow-visible">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* ─────────────────────────────────────────────
          MOBILE FLOATING BOTTOM NAV
         ───────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden z-40 px-4 pb-3">
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.08)] border border-neutral-200/40 flex items-center justify-around h-16 px-1">
          {BOTTOM_TABS.map((tab) => {
            const { icon: Icon, label, action } = tab;

            // "More" button opens the mobile menu
            if (action === 'menu') {
              const isActive = !MAIN_TAB_PATHS.some((p) =>
                p === '/patient'
                  ? location.pathname === p
                  : location.pathname.startsWith(p),
              );
              return (
                <button
                  key="more-menu"
                  onClick={() => setMobileMenuOpen(true)}
                  className="flex flex-col items-center justify-center gap-1 min-w-0 px-3 py-1 relative"
                >
                  {isActive && (
                    <div className="absolute -top-0.5 w-5 h-[3px] rounded-full bg-primary-500" />
                  )}
                  <Icon className={`h-5 w-5 transition-colors ${isActive ? 'text-primary-600' : 'text-neutral-300'}`} />
                  <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-primary-600' : 'text-neutral-300'}`}>{label}</span>
                </button>
              );
            }

            const { to, end } = tab;
            const isActive = end
              ? location.pathname === to
              : location.pathname.startsWith(to) && to !== '/patient';

            return (
              <Link
                key={to}
                to={to}
                className="flex flex-col items-center justify-center gap-1 min-w-0 px-3 py-1 relative"
              >
                {isActive && (
                  <div className="absolute -top-0.5 w-5 h-[3px] rounded-full bg-primary-500" />
                )}
                <Icon className={`h-5 w-5 transition-colors ${isActive ? 'text-primary-600' : 'text-neutral-300'}`} />
                <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-primary-600' : 'text-neutral-300'}`}>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ─────────────────────────────────────────────
          MOBILE MENU — bottom sheet
         ───────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-neutral-950/60 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto"
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-neutral-200" />
              </div>

              {/* Header */}
              <div className="px-6 pb-4 pt-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-primary-500/20">
                    {(activePatient?.name || user?.name || 'U')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-neutral-900 font-display">
                      {activePatient?.name || user?.name}
                    </p>
                    <p className="text-[11px] text-neutral-400">
                      {activePatient?.patientId || 'Patient Portal'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-xl bg-neutral-100 text-neutral-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="h-px bg-neutral-100 mx-6" />

              {/* Nav items */}
              <div className="px-4 py-4 space-y-4">
                {NAV_GROUPS.map((group, gi) => (
                  <div key={gi}>
                    {group.title && (
                      <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-300">
                        {group.title}
                      </p>
                    )}
                    <div className="space-y-0.5">
                      {group.items.filter((i) => !i.guardianOnly || isGuardian).map((item) => {
                        const { to, icon: Icon, label } = item;
                        const isActive = isNavItemActive(location, item);
                        return (
                          <Link
                            key={to}
                            to={to}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                              isActive
                                ? 'bg-primary-50 text-primary-700'
                                : 'text-neutral-600 hover:bg-neutral-50'
                            }`}
                          >
                            <Icon
                              className={`h-5 w-5 ${
                                isActive ? 'text-primary-600' : 'text-neutral-400'
                              }`}
                            />
                            <span>{label}</span>
                            {isActive && (
                              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500" />
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Logout */}
              <div className="px-4 pb-6 pt-2">
                <div className="h-px bg-neutral-100 mb-3" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─────────────────────────────────────────────
          PROFILE SWITCHER SHEET (guardian mode)
         ───────────────────────────────────────────── */}
      <AnimatePresence>
        {profileSheetOpen && (
          <div className="fixed inset-0 z-[60]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-neutral-950/50 backdrop-blur-sm"
              onClick={() => setProfileSheetOpen(false)}
            />
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl overflow-hidden"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-neutral-200" />
              </div>

              <div className="px-5 py-4">
                <h3 className="text-sm font-bold text-neutral-900 font-display">
                  Switch Profile
                </h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Select the patient profile to view
                </p>
              </div>

              <div className="px-3 pb-6 space-y-1">
                {patients.map((p) => (
                  <button
                    key={p._id}
                    onClick={() => {
                      switchPatient(p._id);
                      setProfileSheetOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition ${
                      p._id === activePatientId
                        ? 'bg-primary-50 border border-primary-200/60'
                        : 'hover:bg-neutral-50'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold ${
                        p._id === activePatientId
                          ? 'bg-gradient-to-br from-primary-400 to-primary-600 shadow-md shadow-primary-500/20'
                          : 'bg-gradient-to-br from-neutral-300 to-neutral-400'
                      }`}
                    >
                      {p.name[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {p.name}
                      </p>
                      <p className="text-[11px] text-neutral-400 font-mono">
                        {p.patientId}
                      </p>
                    </div>
                    {p._id === activePatientId && (
                      <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center">
                        <Check className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─────────────────────────────────────────────
          TELEMEDICINE OVERLAYS — mounted globally
         ───────────────────────────────────────────── */}
      <IncomingCallOverlay />
      <ActiveCallPill />

      <GlobalSearchOverlay
        {...search}
        placeholder={patientSearchConfig.placeholder}
        categoryIcons={patientSearchConfig.categoryIcons}
      />
    </div>
  );
}
