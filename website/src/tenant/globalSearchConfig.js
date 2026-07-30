import { globalSearch } from './api';
import {
  LayoutDashboard, Building2, Stethoscope, CalendarDays, Users, CreditCard,
  UserCog, FileText, Layers, Package, Briefcase, Pill,
} from 'lucide-react';

const CATEGORY_ICONS = {
  patients: Users,
  doctors: Stethoscope,
  staff: UserCog,
  appointments: CalendarDays,
  invoices: FileText,
  prescriptions: Pill,
  branches: Building2,
  departments: Layers,
  inventory: Package,
  jobs: Briefcase,
};

/**
 * Build search config for the tenant portal.
 * @param {Array} filteredNavItems — already role/permission-filtered nav items from TenantLayout
 */
export function getTenantSearchConfig(filteredNavItems) {
  return {
    storageKey: 'besto_tenant_recent_searches',
    apiSearchFn: (q, signal) => globalSearch(q, signal),
    navItems: filteredNavItems.map((item) => ({
      to: item.to,
      label: item.label,
      icon: item.icon || LayoutDashboard,
      iconName: item.icon?.displayName || '',
      keywords: [item.label.toLowerCase(), item.to.split('/').pop()],
    })),
    categoryIcons: CATEGORY_ICONS,
    placeholder: 'Search pages, patients, doctors, appointments...',
  };
}
