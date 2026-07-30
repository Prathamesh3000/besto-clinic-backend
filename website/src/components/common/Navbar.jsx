import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, X, Building2, Heart, ChevronDown, Search, LogOut, LayoutDashboard,
  Stethoscope, UserCog, HeartPulse, CreditCard, BarChart3, Wallet, Zap, Shield, Sparkles,
} from 'lucide-react';
import Btn from './Btn';
import { EASE, NAV_LINKS } from './designSystem';
import { useAuthStatus } from '../../hooks/useAuthStatus';

/* ── Role-based avatar configuration ── */

const AVATAR_COLORS = {
  patient: 'bg-emerald-100 text-emerald-700',
  staff: 'bg-primary-100 text-primary-700',
  platform: 'bg-primary-100 text-primary-700',
};

const ROLE_CONFIG = {
  doctor: { icon: Stethoscope, bgColor: 'bg-blue-100', iconColor: 'text-blue-700' },
  receptionist: { icon: UserCog, bgColor: 'bg-purple-100', iconColor: 'text-purple-700' },
  support_staff: { icon: HeartPulse, bgColor: 'bg-pink-100', iconColor: 'text-pink-700' },
  billing_officer: { icon: CreditCard, bgColor: 'bg-green-100', iconColor: 'text-green-700' },
  accountant: { icon: BarChart3, bgColor: 'bg-indigo-100', iconColor: 'text-indigo-700' },
  hr_payroll_manager: { icon: Wallet, bgColor: 'bg-teal-100', iconColor: 'text-teal-700' },
  it_support: { icon: Zap, bgColor: 'bg-yellow-100', iconColor: 'text-yellow-700' },
  clinic_admin: { icon: Shield, bgColor: 'bg-red-100', iconColor: 'text-red-700' },
  owner: { icon: Shield, bgColor: 'bg-red-100', iconColor: 'text-red-700' },
  admin: { icon: Shield, bgColor: 'bg-red-100', iconColor: 'text-red-700' },
  super_admin: { icon: Shield, bgColor: 'bg-red-100', iconColor: 'text-red-700' },
};

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function getDisplayName(name) {
  if (!name) return 'Account';
  const titles = ['dr.', 'dr', 'mr.', 'mr', 'ms.', 'ms', 'mrs.', 'mrs', 'prof.', 'prof'];
  const words = name.trim().split(' ').filter((w) => w.length > 0);
  if (words.length > 0) {
    const firstWord = words[0].toLowerCase().replace(/\./g, '');
    if (titles.includes(firstWord) && words.length > 1) return words[1];
    return words[0];
  }
  return 'Account';
}

function getUserAvatar(user, portalType, size = 'md') {
  const sizeClasses = { sm: 'w-8 h-8 text-xs', md: 'w-8 h-8 text-xs', lg: 'w-9 h-9 text-sm' };
  if ((portalType === 'staff' || portalType === 'platform') && user?.role && ROLE_CONFIG[user.role]) {
    const config = ROLE_CONFIG[user.role];
    const IconComponent = config.icon;
    return (
      <div className={`${sizeClasses[size]} rounded-lg ${config.bgColor} flex items-center justify-center`}>
        <IconComponent className={`h-4 w-4 ${config.iconColor}`} />
      </div>
    );
  }
  const avatarColor = AVATAR_COLORS[portalType] || AVATAR_COLORS.staff;
  return (
    <div className={`${sizeClasses[size]} rounded-lg ${avatarColor} flex items-center justify-center font-bold`}>
      {getInitials(user?.name)}
    </div>
  );
}

/* ── Main Navbar ── */

export default function Navbar({ onStartScan }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const location = useLocation();
  const { isLoggedIn, user, portalType, dashboardPath, logout } = useAuthStatus();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setDropdownOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/90 backdrop-blur-xl border-b border-neutral-200/60 shadow-sm'
          : 'glass'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group" aria-label="BestoClinic Home">
            <img src="/platform_admin/logo/Besto Clinic Logo.svg" alt="BestoClinic" className="w-9 h-9" />
            <span className="text-xl font-bold font-display tracking-tight text-neutral-900 transition-colors">
              Besto<span className="text-secondary-500">Clinic</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                  location.pathname === item.to
                    ? 'text-primary-700 bg-primary-50/80'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden lg:flex items-center gap-3">
            {location.pathname !== '/browse' && (
              <Link
                to="/browse"
                className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                title="Search doctors & clinics"
              >
                <Search className="w-4.5 h-4.5" />
              </Link>
            )}

            {isLoggedIn ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer"
                >
                  {getUserAvatar(user, portalType, 'md')}
                  <span className="text-sm font-medium text-neutral-700 max-w-[120px] truncate">
                    {getDisplayName(user?.name)}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 text-neutral-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-lg border border-neutral-200 py-2 z-50"
                    >
                      <div className="px-4 py-2.5 border-b border-neutral-100">
                        <p className="text-sm font-semibold text-neutral-900 truncate">{user?.name}</p>
                        <p className="text-[11px] text-neutral-400 truncate">{user?.email}</p>
                      </div>
                      <Link
                        to={dashboardPath}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
                      >
                        <LayoutDashboard className="h-4 w-4 text-neutral-400" />
                        Go to Dashboard
                      </Link>
                      <button
                        onClick={logout}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors w-full text-left cursor-pointer"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <>
                {onStartScan && (
                  <button
                    onClick={onStartScan}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-cyan-600 hover:text-cyan-700 rounded-xl hover:bg-cyan-50 transition-colors cursor-pointer"
                  >
                    <Sparkles className="h-4 w-4" />
                    Try AI Scan
                  </button>
                )}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer"
                  >
                    Sign In
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {dropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.2, ease: EASE }}
                        className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-lg border border-neutral-200 py-2 z-50"
                      >
                        <Link
                          to="/clinic/login"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-primary-600" />
                          </div>
                          <div>
                            <p className="font-medium text-neutral-900">Staff Login</p>
                            <p className="text-[11px] text-neutral-400">Doctors, admin & staff</p>
                          </div>
                        </Link>
                        <Link
                          to="/patient/login"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                            <Heart className="h-4 w-4 text-emerald-600" />
                          </div>
                          <div>
                            <p className="font-medium text-neutral-900">Patient Login</p>
                            <p className="text-[11px] text-neutral-400">Appointments & records</p>
                          </div>
                        </Link>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <Btn size="sm" to="/register">Start Free Trial</Btn>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2 rounded-xl text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="lg:hidden absolute top-full left-0 right-0 bg-white/95 backdrop-blur-xl border-b border-neutral-200/60 shadow-lg overflow-hidden"
            >
              <div className="px-4 py-4 space-y-1">
                {NAV_LINKS.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`block px-4 py-3 rounded-xl text-base font-medium transition-colors ${
                      location.pathname === item.to
                        ? 'text-primary-700 bg-primary-50/80'
                        : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="pt-4 border-t border-neutral-200 space-y-2">
                  {isLoggedIn ? (
                    <>
                      <div className="flex items-center gap-3 px-4 py-2">
                        {getUserAvatar(user, portalType, 'lg')}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-neutral-900 truncate">{user?.name}</p>
                          <p className="text-[11px] text-neutral-400 truncate">{user?.email}</p>
                        </div>
                      </div>
                      <Btn variant="outline" size="md" to={dashboardPath} className="w-full">
                        <LayoutDashboard className="w-4 h-4 mr-2" />
                        Dashboard
                      </Btn>
                      <button
                        onClick={logout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </>
                  ) : (
                    <>
                      <Btn variant="outline" size="md" to="/login" className="w-full">Sign In</Btn>
                      <Btn size="md" to="/register" className="w-full">Start Free Trial</Btn>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </motion.header>
  );
}
