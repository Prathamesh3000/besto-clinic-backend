import { globalSearch } from './api';
import {
  LayoutDashboard, CalendarDays, Pill, CreditCard, FileText, HeartPulse,
} from 'lucide-react';

const CATEGORY_ICONS = {
  appointments: CalendarDays,
  prescriptions: Pill,
  payments: CreditCard,
  healthRecords: HeartPulse,
};

/**
 * Build search config for the patient portal.
 * @param {Array} navItems — flattened nav items from PatientLayout
 * @param {string} activePatientId — the currently active patient's user ID
 */
export function getPatientSearchConfig(navItems, activePatientId) {
  return {
    storageKey: 'besto_patient_recent_searches',
    apiSearchFn: (q, signal) => globalSearch(q, activePatientId, signal),
    navItems: navItems.map((item) => ({
      to: item.to,
      label: item.label,
      icon: item.icon || LayoutDashboard,
      keywords: [item.label.toLowerCase()],
    })),
    categoryIcons: CATEGORY_ICONS,
    placeholder: 'Search appointments, prescriptions, records...',
  };
}
