'use strict';

/**
 * Application-wide constants — no runtime dependencies.
 * Imported freely by any layer (middleware, services, controllers).
 */

/** All roles — must match what the auth module seeds/issues */
const ROLES = Object.freeze({
  PRODUCT_OWNER:      'product_owner',
  SUPER_ADMIN:        'super_admin',
  ADMIN:              'admin',
  MANAGER:            'manager',
  DEPARTMENT_MANAGER: 'department_manager',
  DOCTOR:             'doctor',
  RECEPTIONIST:       'receptionist',
  SUPPORT_STAFF:      'support_staff',
  BILLING_OFFICER:    'billing_officer',
  ACCOUNTANT:         'accountant',
  HR_PAYROLL_MANAGER: 'hr_payroll_manager',
  IT_SUPPORT:         'it_support',
  PATIENT:            'patient',
  GUARDIAN:            'guardian',
});

/** Role groups for UI/routing decisions */
const ROLE_GROUPS = Object.freeze({
  PLATFORM:   [ROLES.PRODUCT_OWNER],
  ADMIN:      [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.DEPARTMENT_MANAGER],
  CLINICAL:   [ROLES.DOCTOR],
  FRONT_DESK: [ROLES.RECEPTIONIST, ROLES.SUPPORT_STAFF],
  FINANCE:    [ROLES.BILLING_OFFICER, ROLES.ACCOUNTANT, ROLES.HR_PAYROLL_MANAGER],
  TECH:       [ROLES.IT_SUPPORT],
  PATIENT:    [ROLES.PATIENT, ROLES.GUARDIAN],
});

/** All staff roles (non-patient) */
const STAFF_ROLES = Object.freeze([
  ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.DEPARTMENT_MANAGER,
  ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.SUPPORT_STAFF,
  ROLES.BILLING_OFFICER, ROLES.ACCOUNTANT, ROLES.HR_PAYROLL_MANAGER, ROLES.IT_SUPPORT,
]);

/** Appointment statuses */
const APPOINTMENT_STATUS = Object.freeze({
  REQUESTED:  'requested',
  CONFIRMED:  'confirmed',
  CHECKED_IN: 'checked_in',
  IN_PROGRESS:'in_progress',
  COMPLETED:  'completed',
  CANCELLED:  'cancelled',
  NO_SHOW:    'no_show',
});

/** Valid appointment status transitions (state machine) */
const APPOINTMENT_TRANSITIONS = Object.freeze({
  [APPOINTMENT_STATUS.REQUESTED]:   [APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.CANCELLED],
  [APPOINTMENT_STATUS.CONFIRMED]:   [APPOINTMENT_STATUS.CHECKED_IN, APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.NO_SHOW],
  [APPOINTMENT_STATUS.CHECKED_IN]:  [APPOINTMENT_STATUS.IN_PROGRESS, APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.NO_SHOW],
  [APPOINTMENT_STATUS.IN_PROGRESS]: [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED],
  [APPOINTMENT_STATUS.COMPLETED]:   [],
  [APPOINTMENT_STATUS.CANCELLED]:   [],
  [APPOINTMENT_STATUS.NO_SHOW]:     [],
});

/** Invoice statuses */
const INVOICE_STATUS = Object.freeze({
  DRAFT:     'draft',
  SENT:      'sent',
  PAID:           'paid',
  PARTIALLY_PAID: 'partially_paid',
  OVERDUE:        'overdue',
  CANCELLED: 'cancelled',
  REFUNDED:  'refunded',
});

/** Subscription plans for SaaS */
const SUBSCRIPTION_PLANS = Object.freeze({
  FREE:       'free',
  STARTER:    'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise',
});

/** Subscription statuses */
const SUBSCRIPTION_STATUS = Object.freeze({
  TRIAL:        'trial',
  ACTIVE:       'active',
  GRACE_PERIOD: 'grace_period',
  CANCELLED:    'cancelled',
  SUSPENDED:    'suspended',
});

/** Legacy status values for backwards compatibility with existing DB documents */
const SUBSCRIPTION_STATUS_LEGACY = Object.freeze({
  PAST_DUE: 'past_due',
});

/** Tenant lifecycle statuses (separate from subscription status) */
const TENANT_STATUS = Object.freeze({
  PENDING:   'pending',
  ACTIVE:    'active',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
});

/** Allowed tenant status transitions */
const TENANT_TRANSITIONS = Object.freeze({
  pending:   ['active', 'cancelled'],
  active:    ['suspended', 'cancelled'],
  suspended: ['active', 'cancelled'],
  cancelled: [],
});

/** Features that can have individual add-on pricing */
const PRICEABLE_FEATURES = Object.freeze([
  'smsEnabled',
  'teleHealthEnabled',
  'customBranding',
  'apiAccess',
  'prioritySupport',
  'advancedReports',
  'whiteLabeling',
  'jobPortalEnabled',
]);

/** Provisioning state machine */
const PROVISIONING_STATUS = Object.freeze({
  PENDING:                'pending',
  CREATING_DB:            'creating_db',
  GENERATING_CLINIC_CODE: 'generating_clinic_code',
  SEEDING:                'seeding',
  CREATING_ADMIN:         'creating_admin',
  APPLYING_PLAN:          'applying_plan',
  COMPLETED:              'completed',
  FAILED:                 'failed',
  ROLLED_BACK:            'rolled_back',
});

const PROVISIONING_TRANSITIONS = Object.freeze({
  pending:                ['creating_db', 'failed'],
  creating_db:            ['generating_clinic_code', 'failed'],
  generating_clinic_code: ['seeding', 'failed'],
  seeding:                ['creating_admin', 'failed'],
  creating_admin:         ['applying_plan', 'failed'],
  applying_plan:          ['completed', 'failed'],
  failed:                 ['rolled_back', 'pending'],
  completed:              [],
  rolled_back:            ['pending'],
});

/** Integration types */
const INTEGRATION_TYPES = Object.freeze(['rioview', 'romexis']);

/** Insurance claim lifecycle statuses */
const INSURANCE_CLAIM_STATUS = Object.freeze({
  PENDING:      'pending',
  SUBMITTED:    'submitted',
  UNDER_REVIEW: 'under_review',
  APPROVED:     'approved',
  REJECTED:     'rejected',
  SETTLED:      'settled',
  APPEALED:     'appealed',
});

/** Allowed insurance claim transitions */
const INSURANCE_CLAIM_TRANSITIONS = Object.freeze({
  pending:      ['submitted'],
  submitted:    ['under_review', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved:     ['settled'],
  rejected:     ['appealed'],
  appealed:     ['under_review'],
  settled:      [],
});

/** Payslip statuses */
const PAYSLIP_STATUS = Object.freeze({
  DRAFT:    'draft',
  APPROVED: 'approved',
  PAID:     'paid',
});

/** Dental scan statuses */
const DENTAL_SCAN_STATUS = Object.freeze({
  CAPTURING:      'capturing',
  PROCESSING:     'processing',
  COMPLETED:      'completed',
  FAILED:         'failed',
});

/** Dental scan image angles */
const DENTAL_SCAN_ANGLE = Object.freeze({
  FRONT:  'front',
  LEFT:   'left',
  RIGHT:  'right',
  UPPER:  'upper',
  LOWER:  'lower',
  TONGUE: 'tongue',
});

/** Observation types from AI dental scan analysis */
const DENTAL_OBSERVATION_TYPE = Object.freeze({
  PLAQUE:         'plaque',
  INFLAMMATION:   'inflammation',
  DISCOLORATION:  'discoloration',
  MISALIGNMENT:   'misalignment',
  CAVITY:         'cavity',
  GUM_RECESSION:  'gum_recession',
  OTHER:          'other',
});

/** Confidence levels for AI observations */
const CONFIDENCE_LEVEL = Object.freeze({
  LOW:    'low',
  MEDIUM: 'medium',
  HIGH:   'high',
});

/** Dental scan capture modes */
const DENTAL_SCAN_MODE = Object.freeze({
  GUIDED_3POS:    'guided_3pos',
  CLASSIC_5ANGLE: 'classic_5angle',
});

/** Which angles are required per scan mode */
const SCAN_MODE_ANGLES = Object.freeze({
  [DENTAL_SCAN_MODE.GUIDED_3POS]:    ['left', 'front', 'right', 'tongue'],
  [DENTAL_SCAN_MODE.CLASSIC_5ANGLE]: ['front', 'left', 'right', 'upper', 'lower'],
});

/** FDI quadrant → tooth ranges */
const FDI_QUADRANTS = Object.freeze({
  Q1: [18, 17, 16, 15, 14, 13, 12, 11], // Upper Right
  Q2: [21, 22, 23, 24, 25, 26, 27, 28], // Upper Left
  Q3: [31, 32, 33, 34, 35, 36, 37, 38], // Lower Left
  Q4: [48, 47, 46, 45, 44, 43, 42, 41], // Lower Right
});

/** All 32 FDI tooth numbers (for iteration) */
const ALL_FDI_TEETH = Object.freeze([
  ...FDI_QUADRANTS.Q1, ...FDI_QUADRANTS.Q2,
  ...FDI_QUADRANTS.Q3, ...FDI_QUADRANTS.Q4,
]);

/** Notification types */
const NOTIFICATION_TYPE = Object.freeze({
  APPOINTMENT:   'appointment',
  PAYMENT:       'payment',
  SYSTEM:        'system',
  ALERT:         'alert',
  REMINDER:      'reminder',
  DENTAL_SCAN:   'dental_scan',
  PRESCRIPTION:  'prescription',
  VIDEO_CALL:    'video_call',
  EMERGENCY:     'emergency',
  CHAT_MESSAGE:     'chat_message',
  PRESENCE:         'presence',
  PURCHASE_ORDER:   'purchase_order',
});

/**
 * Socket.IO event contract
 *
 * Room naming:
 *   user:{userId}                     — private user inbox
 *   tenant:{slug}:doctors             — all doctor-role users
 *   tenant:{slug}:receptionists       — receptionist/admin/owner users
 *   tenant:{slug}:owners              — owners only
 *   tenant:{slug}:admins              — admins only
 *   video:{slug}:{roomId}             — scoped to a single video/emergency session
 *   emergency:{sessionId}             — scoped to an emergency request lifecycle
 */
const SOCKET_EVENTS = Object.freeze({
  // Video lifecycle
  VIDEO_INCOMING_CALL: 'video:incoming-call',
  VIDEO_PEER_JOINED:   'video:peer-joined',
  VIDEO_PEER_LEFT:     'video:peer-left',
  VIDEO_CALL_ENDED:    'video:call-ended',
  VIDEO_RECONNECTING:  'video:reconnecting',
  VIDEO_MEDIA_STATE:   'video:media-state',
  VIDEO_CONSENT_UPDATED: 'video:consent-updated',
  VIDEO_SESSION_EXTENDED: 'video:session-extended',
  // WebRTC signaling (already used by videoHandler)
  VIDEO_JOIN_ROOM:     'video:join-room',
  VIDEO_LEAVE_ROOM:    'video:leave-room',
  VIDEO_OFFER:         'video:offer',
  VIDEO_ANSWER:        'video:answer',
  VIDEO_ICE_CANDIDATE: 'video:ice-candidate',
  VIDEO_TOGGLE_MEDIA:  'video:toggle-media',
  VIDEO_USER_JOINED:   'video:user-joined',
  VIDEO_USER_LEFT:     'video:user-left',
  VIDEO_ERROR:         'video:error',

  // Chat (unified, session-scoped)
  CHAT_MESSAGE:        'chat:message',
  CHAT_DELIVERED:      'chat:delivered',
  CHAT_READ:           'chat:read',
  CHAT_TYPING:         'chat:typing',

  // Emergency
  EMERGENCY_NEW:       'emergency:new',
  EMERGENCY_ACCEPTED:  'emergency:accepted',
  EMERGENCY_DECLINED:  'emergency:declined',
  EMERGENCY_CANCELLED: 'emergency:cancelled',
  EMERGENCY_ENDED:     'emergency:ended',

  // Presence
  PRESENCE_CHANGE:     'presence:change',
  PRESENCE_HEARTBEAT:  'presence:heartbeat',

  // Notification bus (existing)
  NOTIFICATION_NEW:         'notification:new',
  NOTIFICATION_UNREAD_COUNT: 'notification:unreadCount',
  NOTIFICATION_ACK:          'notification:ack',
});

/** Presence status */
const PRESENCE_STATUS = Object.freeze({
  ONLINE:  'online',
  BUSY:    'busy',      // doctor is in a call / treating a patient
  DND:     'dnd',       // do not disturb
  OFFLINE: 'offline',
});

/** Legacy upload statuses */
const UPLOAD_STATUS = Object.freeze({
  PENDING:    'pending',
  VALIDATING: 'validating',
  PROCESSING: 'processing',
  COMPLETED:  'completed',
  FAILED:     'failed',
  PARTIAL:    'partial',
});

/** Legacy upload entity types */
const UPLOAD_ENTITY_TYPE = Object.freeze({
  PATIENTS:     'patients',
  APPOINTMENTS: 'appointments',
  INVOICES:     'invoices',
  DOCTORS:      'doctors',
  STAFF:        'staff',
});

/** Prescription statuses */
const PRESCRIPTION_STATUS = Object.freeze({
  ACTIVE:    'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

/** Care task types (extracted from prescriptions + dynamic consultation tasks) */
const CARE_TASK_TYPE = Object.freeze({
  MEDICATION: 'medication',
  HYGIENE:    'hygiene',
  POST_CARE:  'post_care',
  FOLLOW_UP:  'follow_up',
  DIETARY:    'dietary',
  CUSTOM:     'custom',
});

/** Consultation statuses (on TreatmentRecord) */
const CONSULTATION_STATUS = Object.freeze({
  IN_PROGRESS: 'in_progress',
  COMPLETED:   'completed',
});

/** Care task statuses */
const CARE_TASK_STATUS = Object.freeze({
  ACTIVE:      'active',
  COMPLETED:   'completed',
  DEACTIVATED: 'deactivated',
});

/** Care reminder statuses */
const CARE_REMINDER_STATUS = Object.freeze({
  PENDING:   'pending',
  SENT:      'sent',
  DONE:      'done',
  SKIPPED:   'skipped',
  MISSED:    'missed',
  CANCELLED: 'cancelled',
});

/** Reminder delivery modes */
const REMINDER_MODE = Object.freeze({
  ITEM_WISE:     'item_wise',
  EOD_CHECKLIST: 'eod_checklist',
});

/** Inventory item categories */
const INVENTORY_CATEGORY = Object.freeze({
  BRACES:         'braces',
  IMPLANTS:       'implants',
  PROSTHETICS:    'prosthetics',
  SURGICAL_KITS:  'surgical_kits',
  CONSUMABLES:    'consumables',
  INSTRUMENTS:    'instruments',
  ORTHODONTIC:    'orthodontic',
  ENDODONTIC:     'endodontic',
  PERIODONTAL:    'periodontal',
  IMAGING:        'imaging',
  STERILIZATION:  'sterilization',
  OTHER:          'other',
});

/** Inventory transaction types (immutable audit trail) */
const INVENTORY_TRANSACTION_TYPE = Object.freeze({
  STOCK_IN:    'stock_in',
  STOCK_OUT:   'stock_out',
  RESERVED:    'reserved',
  RELEASED:    'released',
  ADJUSTMENT:  'adjustment',
  EXPIRED:     'expired',
  DAMAGED:     'damaged',
});

/** Purchase order statuses */
const PURCHASE_ORDER_STATUS = Object.freeze({
  REQUESTED:  'requested',
  CONFIRMED:  'confirmed',
  SHIPPED:    'shipped',
  DELIVERED:  'delivered',
  CANCELLED:  'cancelled',
});

/** Valid purchase order status transitions */
const PURCHASE_ORDER_TRANSITIONS = Object.freeze({
  requested:  ['confirmed', 'cancelled'],
  confirmed:  ['shipped', 'cancelled'],
  shipped:    ['delivered'],
  delivered:  [],
  cancelled:  [],
});

/** Purchase order urgency levels */
const PURCHASE_ORDER_URGENCY = Object.freeze({
  NORMAL: 'normal',
  URGENT: 'urgent',
});

/**
 * Procedure template categories.
 *
 * These six values are not a design choice — they are the exact set measured in
 * the live `proceduretemplates` collection: 16 documents, `category` present in
 * 100% of them, zero nulls, zero drift (sql/FINDINGS.md F-3).
 *
 * The constant was referenced by src/models/tenant/ProcedureTemplate.js but never
 * defined, so `Object.values(undefined)` threw at require time and the model was
 * excluded from the tenant registry. Defining it makes the model loadable; it does
 * not mount the feature, which has no module in src/modules/.
 */
const PROCEDURE_CATEGORY = Object.freeze({
  COSMETIC:    'cosmetic',
  SURGERY:     'surgery',
  PROSTHETIC:  'prosthetic',
  ORTHODONTIC: 'orthodontic',
  ENDODONTIC:  'endodontic',
  PERIODONTAL: 'periodontal',
});

/**
 * Material reservation lifecycle.
 *
 * `materialreservations` is empty in every profiled clinic, so unlike
 * PROCEDURE_CATEGORY above there is no data to measure. The values are taken from
 * the only other statement of them in the codebase — the per-item enum inside
 * src/models/tenant/MaterialReservation.js, which lists exactly these three — so
 * the parent status and its items cannot disagree.
 */
const RESERVATION_STATUS = Object.freeze({
  RESERVED: 'reserved',
  USED:     'used',
  RELEASED: 'released',
});

/** Consent statuses */
const CONSENT_STATUS = Object.freeze({
  ACTIVE:  'active',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
});

/** Consent types */
const CONSENT_TYPE = Object.freeze({
  DATA_SHARING: 'data_sharing',
  TREATMENT:    'treatment',
  RESEARCH:     'research',
  MARKETING:    'marketing',
});

/** Queue entry statuses */
const QUEUE_STATUS = Object.freeze({
  WAITING:         'waiting',
  IN_CONSULTATION: 'in_consultation',
  COMPLETED:       'completed',
  CANCELLED:       'cancelled',
  NO_SHOW:         'no_show',
});

/** Queue priority levels */
const QUEUE_PRIORITY = Object.freeze({
  NORMAL:    'normal',
  HIGH:      'high',
  EMERGENCY: 'emergency',
});

/** Emergency session types */
const EMERGENCY_SESSION_TYPE = Object.freeze({
  CHAT:  'chat',
  VIDEO: 'video',
});

/** Emergency session statuses */
const EMERGENCY_SESSION_STATUS = Object.freeze({
  REQUESTED: 'requested',
  ACTIVE:    'active',
  ENDED:     'ended',
  MISSED:    'missed',
  CANCELLED: 'cancelled',
});

/** HTTP header for tenant resolution */
const TENANT_HEADER = 'x-tenant-id';

/** JWT audiences */
const JWT_AUDIENCE = Object.freeze({
  CLIENT:    'bestoclinic-client',
  PLATFORM:  'bestoclinic-platform',
});

/** Pagination defaults */
const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});

/** Payment modes */
const PAYMENT_MODE = Object.freeze({
  CASH:           'cash',
  UPI:            'upi',
  CARD:           'card',
  NET_BANKING:    'net_banking',
  INSURANCE:      'insurance',
  CREDIT_BALANCE: 'credit_balance',
  OTHER:          'other',
});

/** Payment statuses */
const PAYMENT_STATUS = Object.freeze({
  PENDING:    'pending',
  PROCESSING: 'processing',
  COMPLETED:  'completed',
  FAILED:     'failed',
  REFUNDED:   'refunded',
});

/** Credit note statuses */
const CREDIT_NOTE_STATUS = Object.freeze({
  DRAFT:   'draft',
  ISSUED:  'issued',
  APPLIED: 'applied',
  EXPIRED: 'expired',
});

/** Credit note reasons */
const CREDIT_NOTE_REASON = Object.freeze({
  TREATMENT_CANCELLATION: 'treatment_cancellation',
  MEDICINE_RETURN:        'medicine_return',
  EQUIPMENT_RETURN:       'equipment_return',
  BILLING_ERROR:          'billing_error',
  OVERCHARGE:             'overcharge',
  GOODWILL:               'goodwill',
  OTHER:                  'other',
});

/** Cash register statuses */
const CASH_REGISTER_STATUS = Object.freeze({
  OPEN:        'open',
  CLOSED:      'closed',
  RECONCILED:  'reconciled',
});

/** Service item categories */
const SERVICE_ITEM_CATEGORY = Object.freeze({
  TREATMENT:    'treatment',
  MEDICINE:     'medicine',
  EQUIPMENT:    'equipment',
  LAB:          'lab',
  CONSULTATION: 'consultation',
  OTHER:        'other',
});

/** Ledger entry types */
const LEDGER_ENTRY_TYPE = Object.freeze({
  DEBIT:  'debit',
  CREDIT: 'credit',
});

/** Ledger source types */
const LEDGER_SOURCE = Object.freeze({
  PAYMENT:     'payment',
  REFUND:      'refund',
  CREDIT_NOTE: 'credit_note',
  ADVANCE:     'advance',
  ADJUSTMENT:  'adjustment',
  WRITE_OFF:   'write_off',
});

/** Financial audit log actions */
const FINANCIAL_AUDIT_ACTION = Object.freeze({
  PAYMENT_CREATED:         'payment_created',
  PAYMENT_COMPLETED:       'payment_completed',
  PAYMENT_FAILED:          'payment_failed',
  PAYMENT_REFUNDED:        'payment_refunded',
  INVOICE_CREATED:         'invoice_created',
  INVOICE_UPDATED:         'invoice_updated',
  INVOICE_VOIDED:          'invoice_voided',
  INVOICE_STATUS_CHANGED:  'invoice_status_changed',
  CREDIT_NOTE_CREATED:     'credit_note_created',
  CREDIT_NOTE_APPLIED:     'credit_note_applied',
  CASH_REGISTER_OPENED:    'cash_register_opened',
  CASH_REGISTER_CLOSED:    'cash_register_closed',
  CASH_REGISTER_RECONCILED:'cash_register_reconciled',
  CASH_ADJUSTMENT:         'cash_adjustment',
  LEDGER_ENTRY:            'ledger_entry',
  INSURANCE_CLAIM_UPDATED: 'insurance_claim_updated',
});

/** Tax types */
const TAX_TYPE = Object.freeze({
  INCLUSIVE: 'inclusive',
  EXCLUSIVE: 'exclusive',
});

/** Common GST rates (India) */
const GST_RATES = Object.freeze({
  EXEMPT: 0,
  FIVE:   5,
  TWELVE: 12,
  EIGHTEEN: 18,
  TWENTY_EIGHT: 28,
});

const VIDEO_SESSION_TYPE = Object.freeze({
  EMERGENCY: 'emergency',
  SCHEDULED: 'scheduled',
  FOLLOW_UP: 'follow_up',
});

const VIDEO_SESSION_STATUS = Object.freeze({
  REQUESTED:    'requested',
  SCHEDULED:    'scheduled',
  WAITING:      'waiting',
  ACTIVE:       'active',
  PAUSED:       'paused',
  ENDED:        'ended',
  CANCELLED:    'cancelled',
  EXPIRED:      'expired',
  NO_SHOW:      'no_show',
});

const VIDEO_SESSION_TRANSITIONS = Object.freeze({
  requested: ['scheduled', 'waiting', 'cancelled', 'expired', 'ended'],
  scheduled: ['waiting', 'cancelled', 'expired', 'ended'],
  waiting:   ['active', 'cancelled', 'expired', 'no_show', 'ended'],
  active:    ['paused', 'ended'],
  paused:    ['active', 'ended'],
});

const CHAT_MESSAGE_TYPE = Object.freeze({
  TEXT:   'text',
  FILE:   'file',
  IMAGE:  'image',
  SYSTEM: 'system',
});

/** Prescription scan status */
const PRESCRIPTION_SCAN_STATUS = Object.freeze({
  PENDING:   'pending',
  COMPLETED: 'completed',
  FAILED:    'failed',
});

/** Conflict resolution statuses for schedule-change-driven appointment actions */
const CONFLICT_RESOLUTION_STATUS = Object.freeze({
  PENDING:      'pending',
  RESCHEDULED:  'rescheduled',
  REFUNDED:     'refunded',
  CREDITED:     'credited',
  CONTACTED:    'contacted',
});

// ─── Job Portal ──────────────────────────────────────────

/** Job posting statuses */
const JOB_STATUS = Object.freeze({
  DRAFT:  'draft',
  ACTIVE: 'active',
  CLOSED: 'closed',
  FILLED: 'filled',
});

/** Job employment types */
const JOB_EMPLOYMENT_TYPE = Object.freeze({
  FULL_TIME: 'full_time',
  PART_TIME: 'part_time',
  CONTRACT:  'contract',
});

/** Job experience levels */
const JOB_EXPERIENCE_LEVEL = Object.freeze({
  ENTRY:  'entry',
  MID:    'mid',
  SENIOR: 'senior',
});

/** Job location types */
const JOB_LOCATION_TYPE = Object.freeze({
  ON_SITE: 'on_site',
  REMOTE:  'remote',
  HYBRID:  'hybrid',
});

/** Credit transaction categories */
const CREDIT_TRANSACTION_TYPE = Object.freeze({
  PURCHASE:   'purchase',
  PLAN_GRANT: 'plan_grant',
  DEDUCTION:  'deduction',
  REFUND:     'refund',
  EXPIRY:     'expiry',
});

/** Credit action types (granular audit) */
const CREDIT_ACTION = Object.freeze({
  CREDIT_PACK_PURCHASE: 'credit_pack_purchase',
  PLAN_MONTHLY_GRANT:   'plan_monthly_grant',
  JOB_POST_PUBLISH:     'job_post_publish',
  JOB_POST_FEATURE:     'job_post_feature',
  JOB_POST_REFUND:      'job_post_refund',
  ADMIN_ADJUSTMENT:     'admin_adjustment',
  CREDITS_EXPIRED:      'credits_expired',
});

/** Default credit costs for job portal actions */
const JOB_CREDIT_COSTS = Object.freeze({
  PUBLISH: 1,
  FEATURE: 2,
});

/** Predefined credit packs available for purchase */
const CREDIT_PACKS = Object.freeze([
  { id: 'pack_5',  credits: 5,  price: 500,  currency: 'INR', label: '5 Credits' },
  { id: 'pack_10', credits: 10, price: 900,  currency: 'INR', label: '10 Credits' },
  { id: 'pack_25', credits: 25, price: 2000, currency: 'INR', label: '25 Credits' },
]);

/** Supported languages for prescription transcription/translation */
const SUPPORTED_LANGUAGES = Object.freeze([
  'English', 'Hindi', 'Marathi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Bengali',
  'Punjabi', 'Malayalam', 'Urdu', 'Arabic', 'Spanish', 'French', 'Portuguese',
  'German', 'Japanese', 'Korean', 'Mandarin', 'Russian', 'Thai', 'Vietnamese',
  'Indonesian', 'Turkish', 'Italian', 'Dutch', 'Polish', 'Swahili',
]);

module.exports = {
  ROLES,
  ROLE_GROUPS,
  STAFF_ROLES,
  APPOINTMENT_STATUS,
  APPOINTMENT_TRANSITIONS,
  INVOICE_STATUS,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_STATUS_LEGACY,
  TENANT_STATUS,
  TENANT_TRANSITIONS,
  PRICEABLE_FEATURES,
  PROVISIONING_STATUS,
  PROVISIONING_TRANSITIONS,
  INTEGRATION_TYPES,
  INSURANCE_CLAIM_STATUS,
  INSURANCE_CLAIM_TRANSITIONS,
  PAYSLIP_STATUS,
  NOTIFICATION_TYPE,
  SOCKET_EVENTS,
  PRESENCE_STATUS,
  UPLOAD_STATUS,
  UPLOAD_ENTITY_TYPE,
  PRESCRIPTION_STATUS,
  CONSENT_STATUS,
  CONSENT_TYPE,
  QUEUE_STATUS,
  QUEUE_PRIORITY,
  EMERGENCY_SESSION_TYPE,
  EMERGENCY_SESSION_STATUS,
  TENANT_HEADER,
  JWT_AUDIENCE,
  PAGINATION,
  PAYMENT_MODE,
  PAYMENT_STATUS,
  CREDIT_NOTE_STATUS,
  CREDIT_NOTE_REASON,
  CASH_REGISTER_STATUS,
  SERVICE_ITEM_CATEGORY,
  LEDGER_ENTRY_TYPE,
  LEDGER_SOURCE,
  FINANCIAL_AUDIT_ACTION,
  TAX_TYPE,
  GST_RATES,
  VIDEO_SESSION_TYPE,
  VIDEO_SESSION_STATUS,
  VIDEO_SESSION_TRANSITIONS,
  CHAT_MESSAGE_TYPE,
  DENTAL_SCAN_STATUS,
  DENTAL_SCAN_ANGLE,
  DENTAL_SCAN_MODE,
  SCAN_MODE_ANGLES,
  FDI_QUADRANTS,
  ALL_FDI_TEETH,
  DENTAL_OBSERVATION_TYPE,
  CONFIDENCE_LEVEL,
  CARE_TASK_TYPE,
  CARE_TASK_STATUS,
  CARE_REMINDER_STATUS,
  REMINDER_MODE,
  INVENTORY_CATEGORY,
  INVENTORY_TRANSACTION_TYPE,
  PURCHASE_ORDER_STATUS,
  PURCHASE_ORDER_TRANSITIONS,
  PURCHASE_ORDER_URGENCY,
  PROCEDURE_CATEGORY,
  RESERVATION_STATUS,
  CONSULTATION_STATUS,
  PRESCRIPTION_SCAN_STATUS,
  CONFLICT_RESOLUTION_STATUS,
  SUPPORTED_LANGUAGES,
  JOB_STATUS,
  JOB_EMPLOYMENT_TYPE,
  JOB_EXPERIENCE_LEVEL,
  JOB_LOCATION_TYPE,
  CREDIT_TRANSACTION_TYPE,
  CREDIT_ACTION,
  JOB_CREDIT_COSTS,
  CREDIT_PACKS,
};
