/**
 * Pricing utilities — transforms API plan data for display components.
 * All plan data is fetched dynamically from GET /api/v1/public/plans.
 * No hardcoded plan definitions — the platform admin manages everything.
 */

/** Human-readable labels for boolean features (used for excluded list) */
const BOOLEAN_FEATURE_LABELS = {
  smsEnabled: 'SMS Notifications',
  teleHealthEnabled: 'Telemedicine',
  customBranding: 'Custom Branding',
  apiAccess: 'API Access',
  prioritySupport: 'Priority Support',
  advancedReports: 'Advanced Analytics',
  whiteLabeling: 'White-Labeling',
  jobPortalEnabled: 'Job Portal',
};

/** Derive excluded features (boolean features that are false for this plan) */
function getExcludedFeatures(features) {
  if (!features) return [];
  return Object.entries(BOOLEAN_FEATURE_LABELS)
    .filter(([key]) => !features[key])
    .map(([, label]) => label);
}

/** Derive CTA text and link from plan data */
function getCTA(plan) {
  const isFree = !plan.pricing?.monthly;
  if (plan.tier >= 30) return { text: 'Contact Sales', to: '/contact' };
  if (isFree) return { text: 'Get Started', to: '/register' };
  if (plan.trial?.enabled) return { text: 'Start Free Trial', to: '/register' };
  return { text: 'Get Started', to: '/register' };
}

/** Transform a single API plan into the shape display components expect */
export function transformPlan(plan) {
  const cta = getCTA(plan);
  const yearly = plan.pricing?.yearly || 0;

  return {
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    monthlyPrice: plan.pricing?.monthly || 0,
    annualPrice: yearly > 0 ? Math.round(yearly / 12) : 0,
    badge: plan.badge || null,
    highlights: plan.highlights || [],
    excluded: getExcludedFeatures(plan.features),
    trial: plan.trial,
    features: plan.features || {},
    tier: plan.tier,
    cta: cta.text,
    ctaTo: cta.to,
  };
}

/**
 * Compute the annual billing savings percentage from plan data.
 * Returns the average discount across all paid plans (rounded).
 */
export function computeAnnualSavings(plans) {
  const paid = plans.filter((p) => p.monthlyPrice > 0);
  if (paid.length === 0) return 0;

  const totalDiscount = paid.reduce((sum, p) => {
    const fullYear = p.monthlyPrice * 12;
    const actualYear = p.annualPrice * 12;
    if (fullYear === 0) return sum;
    return sum + ((fullYear - actualYear) / fullYear) * 100;
  }, 0);

  return Math.round(totalDiscount / paid.length);
}

// ─── Comparison Table ────────────────────────────────────

/** Formatting helpers for numeric features */
const formatDoctors = (v) => (v === 1 ? '1' : `Up to ${v}`);
const formatStaff = (v) => String(v);
const formatBranches = (v) => (v === 1 ? '1' : `Up to ${v}`);
const formatStorage = (v) => (v >= 1024 ? `${Math.round(v / 1024)} GB` : `${v} MB`);
const formatSms = (v) => (v === 0 ? false : v.toLocaleString('en-IN'));

/**
 * Comparison table section definitions.
 * Each row maps a plan feature key to a display label and optional formatter.
 * Boolean features (no format fn) render as check/cross icons.
 */
const COMPARISON_SECTIONS = [
  {
    category: 'Capacity & Limits',
    rows: [
      { key: 'maxDoctors', label: 'Doctors', format: formatDoctors },
      { key: 'maxStaff', label: 'Staff Members', format: formatStaff },
      { key: 'maxBranches', label: 'Branches', format: formatBranches },
      { key: 'maxStorageMB', label: 'Storage', format: formatStorage },
      { key: 'maxSmsPerMonth', label: 'SMS / month', format: formatSms },
    ],
  },
  {
    category: 'Features',
    rows: [
      { key: 'smsEnabled', label: 'SMS Notifications' },
      { key: 'teleHealthEnabled', label: 'Telemedicine' },
      { key: 'customBranding', label: 'Custom Branding' },
      { key: 'advancedReports', label: 'Advanced Analytics' },
      { key: 'apiAccess', label: 'API Access' },
      { key: 'whiteLabeling', label: 'White-Labeling' },
      { key: 'jobPortalEnabled', label: 'Job Portal' },
    ],
  },
  {
    category: 'Support',
    rows: [
      { key: 'prioritySupport', label: 'Priority Support' },
    ],
  },
];

/**
 * Build comparison table data from API plans.
 * Returns array of { category, features: [{ name, [slug]: value }] }
 */
export function buildComparisonData(apiPlans) {
  return COMPARISON_SECTIONS.map((section) => ({
    category: section.category,
    features: section.rows.map((row) => {
      const entry = { name: row.label };
      apiPlans.forEach((plan) => {
        const raw = plan.features?.[row.key];
        entry[plan.slug] = row.format ? row.format(raw) : raw;
      });
      return entry;
    }),
  }));
}
