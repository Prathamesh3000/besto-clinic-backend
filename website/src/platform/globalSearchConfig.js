import { globalSearch } from './api';
import {
  LayoutDashboard, Building2, CreditCard, Users,
} from 'lucide-react';

const CATEGORY_ICONS = {
  tenants: Building2,
  plans: CreditCard,
  platformUsers: Users,
};

/**
 * Build search config for the platform portal.
 * @param {Array} navItems — flattened nav items from PlatformLayout
 */
export function getPlatformSearchConfig(navItems) {
  return {
    storageKey: 'besto_platform_recent_searches',
    apiSearchFn: (q, signal) => globalSearch(q, signal),
    navItems: navItems.map((item) => ({
      to: item.to,
      label: item.label,
      icon: item.icon || LayoutDashboard,
      keywords: [item.label.toLowerCase()],
    })),
    categoryIcons: CATEGORY_ICONS,
    placeholder: 'Search tenants, plans, users...',
  };
}
