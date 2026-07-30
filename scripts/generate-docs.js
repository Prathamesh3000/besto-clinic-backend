'use strict';

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, HeadingLevel, ShadingType,
  PageBreak, Header, Footer, PageNumber,
} = require('docx');
const fs = require('fs');
const path = require('path');

// ============================================================
// STYLE HELPERS
// ============================================================

const COLORS = {
  primary: '1B4F72',
  secondary: '2E86C1',
  headerBg: '1B4F72',
  headerText: 'FFFFFF',
  altRowBg: 'EBF5FB',
  darkText: '2C3E50',
  mediumText: '566573',
};

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 400 : 200, after: 120 },
    children: [new TextRun({ text, color: COLORS.primary, bold: true })],
  });
}

function subheading(text) { return heading(text, HeadingLevel.HEADING_2); }
function h3(text) { return heading(text, HeadingLevel.HEADING_3); }

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 22, color: COLORS.darkText, font: 'Calibri', ...opts })],
  });
}

function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 22, color: COLORS.darkText, font: 'Calibri' })],
  });
}

function emptyLine() {
  return new Paragraph({ spacing: { after: 100 }, children: [] });
}

function pgBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// Table helpers with proper percentage widths
function headerCell(text, pct) {
  return new TableCell({
    width: { size: pct, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.SOLID, color: COLORS.headerBg },
    verticalAlign: 'center',
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 20, after: 20 },
      children: [new TextRun({ text, bold: true, color: COLORS.headerText, size: 18, font: 'Calibri' })],
    })],
  });
}

function dataCell(text, pct, shaded) {
  return new TableCell({
    width: { size: pct, type: WidthType.PERCENTAGE },
    shading: shaded ? { type: ShadingType.SOLID, color: COLORS.altRowBg } : undefined,
    verticalAlign: 'center',
    margins: { top: 30, bottom: 30, left: 80, right: 80 },
    children: [new Paragraph({
      spacing: { before: 10, after: 10 },
      children: [new TextRun({ text: String(text || ''), size: 18, color: COLORS.darkText, font: 'Calibri' })],
    })],
  });
}

function makeTable(headers, rows, colPcts) {
  const pcts = colPcts || distributeWidths(headers);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: 'fixed',
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => headerCell(h, pcts[i])),
      }),
      ...rows.map((row, ri) =>
        new TableRow({
          children: row.map((c, ci) => dataCell(c, pcts[ci], ri % 2 === 1)),
        })
      ),
    ],
  });
}

// Smart width distribution based on column count
function distributeWidths(headers) {
  const n = headers.length;
  if (n === 2) return [35, 65];
  if (n === 3) return [8, 30, 62];
  if (n === 4) return [20, 30, 25, 25];
  if (n === 5) return [10, 22, 26, 30, 12];
  // For 6+ columns, use equal
  return headers.map(() => Math.floor(100 / n));
}

function titlePage(title, subtitle) {
  return [
    new Paragraph({ spacing: { before: 3000 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, bold: true, size: 56, color: COLORS.primary, font: 'Calibri' })],
    }),
    new Paragraph({ spacing: { before: 200 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: subtitle, size: 28, color: COLORS.secondary, italics: true, font: 'Calibri' })],
    }),
    new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Generated: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, size: 22, color: COLORS.mediumText, font: 'Calibri' })],
    }),
    new Paragraph({ spacing: { before: 100 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'BestoClinic - Multi-Tenant Dental Clinic Management SaaS', size: 22, color: COLORS.mediumText, font: 'Calibri' })],
    }),
    pgBreak(),
  ];
}

// ============================================================
// DOCUMENT 1: FEATURES
// ============================================================

function buildFeaturesDoc() {
  const s = [];

  s.push(...titlePage('BestoClinic', 'Complete Features Document'));

  // CREDENTIALS
  s.push(heading('Seeded Data & Login Credentials'));
  s.push(para('The following credentials and data are pre-seeded into the system via seed scripts.'));

  s.push(subheading('Platform Admin'));
  s.push(makeTable(
    ['Field', 'Value'],
    [
      ['Role', 'Product Owner (Platform-level)'],
      ['Name', 'Platform Administrator'],
      ['Email', 'admin@bestoclinic.com'],
      ['Password', 'Admin@12345'],
      ['Login URL', 'https://bestoclinic.com/platform/login'],
    ],
    [30, 70]
  ));

  s.push(emptyLine());
  s.push(subheading('Clinic SuperAdmin Accounts'));
  s.push(para('Each clinic gets a SuperAdmin with these default credentials:'));
  s.push(makeTable(
    ['Clinic', 'Email', 'Password', 'Role'],
    [
      ['SmileCare Dental Clinic', 'admin@smilecare-dental.com', 'Admin@12345', 'super_admin'],
      ['HealthPlus Multispecialty Hospital', 'admin@healthplus-hospital.com', 'Admin@12345', 'super_admin'],
      ['Vision Eye Care Center', 'admin@vision-eyecare.com', 'Admin@12345', 'super_admin'],
      ['Little Angels Pediatric Clinic', 'admin@little-angels-pediatric.com', 'Admin@12345', 'super_admin'],
      ['OrthoLife Bone & Joint Clinic', 'admin@ortholife-clinic.com', 'Admin@12345', 'super_admin'],
      ['Skin & You Dermatology Center', 'admin@skin-and-you-derma.com', 'Admin@12345', 'super_admin'],
      ['Wellness Family Clinic', 'admin@wellness-family-clinic.com', 'Admin@12345', 'super_admin'],
      ['CardioCare Heart Hospital', 'admin@cardiocare-heart.com', 'Admin@12345', 'super_admin'],
      ['NeuroHealth Brain & Spine Clinic', 'admin@neurohealth-clinic.com', 'Admin@12345', 'super_admin'],
      ['MomCare Women & Child Hospital', 'admin@momcare-hospital.com', 'Admin@12345', 'super_admin'],
      ['Demo Dental Clinic', 'demo@bestoclinic.com', 'ChangeMe@123', 'super_admin'],
    ],
    [28, 35, 20, 17]
  ));

  s.push(emptyLine());
  s.push(subheading('Patient Accounts (SmileCare Dental)'));
  s.push(makeTable(
    ['Name', 'Email', 'Password', 'Clinic/Tenant'],
    [
      ['Ananya Sharma', 'ananya.sharma@bestoclinic.com', 'Ananya@123', 'smilecare-dental'],
      ['Vinayak Mehta', 'vinayak.mehta@smilecare.clinic', 'Vinayak@2025', 'smilecare-dental'],
    ],
    [20, 35, 20, 25]
  ));

  s.push(emptyLine());
  s.push(subheading('New Tenant Default Credentials'));
  s.push(para('When a new clinic is provisioned via create-tenant script:'));
  s.push(makeTable(
    ['Field', 'Value'],
    [
      ['Admin Email', '<provided during setup>'],
      ['Default Password', 'ChangeMe@123'],
      ['Role', 'super_admin'],
      ['Tenant Header', 'X-Tenant-ID: <clinic-slug>'],
    ],
    [30, 70]
  ));

  s.push(pgBreak());

  // SEEDED CLINICS
  s.push(heading('Seeded Clinics'));
  const clinics = [
    ['SmileCare Dental Clinic', 'smilecare-dental', 'Professional', 'Active', 'Mumbai', '5', '12', '842'],
    ['HealthPlus Multispecialty Hospital', 'healthplus-hospital', 'Enterprise', 'Active', 'Bangalore', '28', '65', '3254'],
    ['Vision Eye Care Center', 'vision-eyecare', 'Starter', 'Trial', 'Noida', '2', '5', '156'],
    ['Little Angels Pediatric Clinic', 'little-angels-pediatric', 'Starter', 'Active', 'Pune', '3', '6', '524'],
    ['OrthoLife Bone & Joint Clinic', 'ortholife-clinic', 'Professional', 'Active', 'Kolkata', '6', '15', '1234'],
    ['Skin & You Dermatology Center', 'skin-and-you-derma', 'Starter', 'Active', 'Hyderabad', '2', '7', '678'],
    ['Wellness Family Clinic', 'wellness-family-clinic', 'Free', 'Active', 'Kochi', '1', '2', '89'],
    ['CardioCare Heart Hospital', 'cardiocare-heart', 'Enterprise', 'Active', 'Bhopal', '18', '45', '2156'],
    ['NeuroHealth Brain & Spine Clinic', 'neurohealth-clinic', 'Professional', 'Trial', 'Chandigarh', '4', '9', '234'],
    ['MomCare Women & Child Hospital', 'momcare-hospital', 'Professional', 'Active', 'Guwahati', '8', '22', '1456'],
    ['Demo Dental Clinic', 'demo-clinic', 'Starter', 'Trial', 'Mumbai', '-', '-', '-'],
  ];
  s.push(makeTable(
    ['Clinic Name', 'Slug', 'Plan', 'Status', 'City', 'Docs', 'Staff', 'Patients'],
    clinics,
    [22, 18, 12, 8, 12, 7, 7, 10]
  ));

  s.push(pgBreak());

  // SUBSCRIPTION PLANS
  s.push(heading('Subscription Plans'));
  s.push(makeTable(
    ['Plan', 'Price/Mo', 'Doctors', 'Staff', 'Branches', 'Storage', 'SMS/Mo', 'Tele', 'Brand', 'API'],
    [
      ['Free', '0', '1', '2', '1', '250 MB', '0', 'No', 'No', 'No'],
      ['Starter', '2,999', '3', '10', '1', '2 GB', '500', 'No', 'No', 'No'],
      ['Professional', '7,999', '10', '30', '3', '10 GB', '2,000', 'Yes', 'Yes', 'No'],
      ['Enterprise', '19,999', '50', '100', '10', '50 GB', '10,000', 'Yes', 'Yes', 'Yes'],
    ],
    [14, 10, 8, 8, 9, 10, 10, 8, 8, 7]
  ));

  s.push(pgBreak());

  // TECH STACK
  s.push(heading('Tech Stack'));
  s.push(makeTable(
    ['Component', 'Technology'],
    [
      ['Backend', 'Node.js / Express (v18+)'],
      ['Database', 'MongoDB (Multi-tenant)'],
      ['Frontend', 'React 19 + Vite, Tailwind CSS, Recharts'],
      ['Mobile', 'React Native (iOS & Android) with TypeScript'],
      ['Real-time', 'Socket.io (WebSocket)'],
      ['Authentication', 'JWT with RBAC'],
      ['Payment Gateway', 'Razorpay'],
      ['Background Jobs', 'BullMQ'],
      ['Caching/Sessions', 'Redis'],
      ['Logging', 'Winston with daily rotation'],
    ],
    [25, 75]
  ));

  s.push(pgBreak());

  // ROLES
  s.push(heading('User Roles'));
  s.push(makeTable(
    ['#', 'Role', 'Description'],
    [
      ['1', 'Product Owner', 'Platform-level admin, tenant management, feature flags'],
      ['2', 'Super Admin', 'Full clinic-level access, system configuration'],
      ['3', 'Admin', 'Clinic administration, user management'],
      ['4', 'Manager', 'Clinic operations oversight, reporting'],
      ['5', 'Department Manager', 'Department-level operations, staff oversight'],
      ['6', 'Doctor', 'Patient consultations, treatments, prescriptions'],
      ['7', 'Receptionist', 'Check-in, appointment scheduling, queue'],
      ['8', 'Support Staff', 'Patient assistance, front-desk operations'],
      ['9', 'Billing Officer', 'Invoice creation, payment processing'],
      ['10', 'Accountant', 'Financial reporting, reconciliation'],
      ['11', 'HR/Payroll Manager', 'Salary management, payslip generation'],
      ['12', 'IT Support', 'System maintenance, technical support'],
      ['13', 'Patient', 'Self-service portal, appointments, payments'],
      ['14', 'Guardian', 'Manage multiple linked patients'],
    ],
    [6, 22, 72]
  ));

  s.push(pgBreak());

  // FEATURES BY MODULE
  const features = [
    { title: '1. Authentication & Authorization', items: [
      'Multi-tenant JWT authentication', 'Login / Logout / Registration', 'Role-based access control (RBAC) with 12+ roles',
      'Permission-based endpoint authorization', 'Feature guards based on subscription tier', 'Token expiry and refresh handling',
    ]},
    { title: '2. Patient Management', items: [
      'Patient registration with demographics (name, DOB, gender, contact)', 'Medical history tracking (allergies, medications, conditions)',
      'Blood group and insurance information storage', 'Emergency contact and guardian linking', 'Patient search by name, phone, or ID',
      'Soft delete with historical data preservation', 'External data sync (RioView, RomExis)', 'Patient-doctor relationship management',
    ]},
    { title: '3. Appointments & Scheduling', items: [
      'Appointment booking (consultation, follow-up, procedure, emergency, teleconsult)',
      'Full lifecycle: requested > confirmed > checked-in > in-progress > completed',
      'Cancellation with reason tracking', 'No-show marking and tracking', 'Rescheduling support',
      'Duration and time slot management', 'Filtering by date, doctor, status, and type',
      'Reminder system integration', 'Invoice linking to appointments',
    ]},
    { title: '4. Billing & Invoicing', items: [
      'Invoice creation with line items (treatment, medicine, equipment, lab, consultation)',
      'GST/Tax management (CGST, SGST, IGST, cess)', 'Promotion codes and discount application',
      'Invoice lifecycle: draft > sent > paid > partially paid > overdue > cancelled > refunded',
      'Sequential invoice numbering per tenant', 'Service item management with configurable pricing',
      'Invoice PDF generation and download',
    ]},
    { title: '5. Financial Management', items: [
      'Revenue trends and analytics', 'Doctor-wise revenue breakdown', 'Outstanding balance tracking',
      'Patient ledger with full financial history', 'Advance payment recording',
      'Ledger adjustments with audit trail', 'Multi-currency support (default INR)', 'Financial audit logging',
    ]},
    { title: '6. Payments & Razorpay Gateway', items: [
      'Direct payment recording (cash, card, etc.)', 'Razorpay integration (order creation, checkout, verification)',
      'Payment webhooks for real-time status updates', 'Full and partial refund processing',
      'Payment status tracking', 'Invoice-specific payment history', 'Patient-initiated payment support',
    ]},
    { title: '7. Cash Register Management', items: [
      'Cash register open/close operations', 'Opening and closing balance tracking',
      'Transaction recording and reconciliation', 'Daily reconciliation reports',
      'Variance calculation and flagging', 'Multiple register support across branches',
    ]},
    { title: '8. Credit Note Management', items: [
      'Credit note creation with reason', 'Application to patient invoices',
      'Refund tracking via credit notes', 'Patient-wise credit note listing',
    ]},
    { title: '9. Telemedicine', items: [
      'Video consultation sessions via WebRTC', 'Session lifecycle: create > accept > join > end > cancel',
      'Real-time in-session chat messaging', 'File sharing during consultations',
      'Recording consent management', 'Connection event logging', 'Room token generation',
    ]},
    { title: '10. Prescription Management', items: [
      'Create and issue prescriptions with medications', 'Prescription status tracking (active, issued, cancelled)',
      'Update and cancel prescriptions', 'Patient prescription history', 'Doctor-issued prescription listing',
    ]},
    { title: '11. Doctor Management', items: [
      'Doctor profile creation (name, specialty, qualifications)', 'Department and branch assignment',
      'Schedule / availability management', 'Patient list per doctor',
      'Doctor performance analytics', 'Doctor-specific revenue tracking',
      'Doctor self-service dashboard', 'Consultation lifecycle management',
    ]},
    { title: '12. Staff Management', items: [
      'Staff creation with role assignment', 'Department and branch assignment',
      'Profile management and editing', 'Staff listing with filtering',
      'Staff activation/deactivation', 'Permission management based on role',
    ]},
    { title: '13. Clinic Settings & Configuration', items: [
      'Clinic information management', 'Clinic branding and logo (subscription-dependent)',
      'Clinic-level configuration', 'Clinic detail viewing',
    ]},
    { title: '14. Branch Management', items: [
      'Multi-branch clinic support', 'Branch creation with address',
      'Branch-level configurations', 'Staff assignment to branches', 'Branch deletion with safety checks',
    ]},
    { title: '15. Department Management', items: [
      'Department creation and editing', 'Doctor assignment to departments',
      'Department-specific analytics', 'Department hierarchy and listing',
    ]},
    { title: '16. Insurance Management', items: [
      'Insurance provider database', 'Claim creation and submission',
      'Claim status tracking: pending > approved > rejected > paid',
      'Co-pay calculation', 'Pre-authorization recording', 'Settlement reconciliation',
      'Insurance claim analytics',
    ]},
    { title: '17. Payroll & HR', items: [
      'Salary structure creation (base, allowances, deductions)', 'Monthly payslip generation',
      'Payslip approval workflow', 'Payment marking and tracking',
      'Payroll analytics and reporting', 'Staff salary history',
    ]},
    { title: '18. Queue Management', items: [
      'Smart patient queue system', 'Queue entry creation', 'Patient call and completion tracking',
      'Queue statuses: waiting > called > completed > cancelled', 'Current queue view',
      'No-show tracking', 'Real-time queue updates',
    ]},
    { title: '19. Emergency Management', items: [
      'Emergency session creation', 'Emergency acceptance and doctor assignment',
      'Emergency video chat', 'Emergency status tracking',
      'Real-time WebSocket alerts to doctors',
    ]},
    { title: '20. Patient Portal (Self-Service)', items: [
      'Patient dashboard', 'Appointment booking, rescheduling, cancellation',
      'Medical history and treatment viewing', 'Prescription access',
      'Payment initiation and financial summary', 'Review and rating submission',
      'Consent management', 'Invoice PDF download', 'Share tokens for record sharing',
      'Access log viewing', 'Guardian multi-patient support',
    ]},
    { title: '21. Integrations', items: [
      'RioView integration (dental management)', 'RomExis integration',
      'Credential storage with encryption', 'Manual sync triggering',
      'Integration status monitoring', 'Test connection validation',
      'Sync log tracking',
    ]},
    { title: '22. Notifications', items: [
      'In-app notification system', 'Notification types: appointment, billing, system',
      'Unread count badge', 'Mark as read (individual and bulk)',
      'Push notifications via FCM', 'Real-time delivery via WebSocket',
    ]},
    { title: '23. Analytics & Dashboard', items: [
      'Dashboard summary with key metrics', 'Revenue trends', 'Appointment trends',
      'Doctor performance metrics', 'No-show analysis', 'Insurance analytics',
      'Telemedicine usage', 'Patient growth trends', 'Filtering by branch and date range',
    ]},
    { title: '24. Consent Management', items: [
      'Medical procedure consent', 'Data sharing consent',
      'Approval and revocation', 'Full audit trail',
    ]},
    { title: '25. Treatment Records', items: [
      'Treatment documentation', 'Consultation notes', 'Follow-up creation',
      'Attachment uploads (X-rays, images)', 'Treatment history per patient',
    ]},
    { title: '26. Legacy Data Upload', items: [
      'Bulk patient CSV import', 'Data validation', 'Upload status tracking',
      'Error handling and reporting', 'Background processing via BullMQ',
    ]},
    { title: '27. Subscription Management', items: [
      'Multi-plan support: Free, Starter, Professional, Enterprise',
      'Feature allocation and toggles', 'Subscription lifecycle management',
      'Add-on pricing (SMS, telehealth, API)', 'Plan upgrade/downgrade',
    ]},
    { title: '28. Platform Management', items: [
      'Tenant provisioning and onboarding', 'Platform user management',
      'Feature flag management', 'Tenant audit logging', 'Health check endpoint',
    ]},
    { title: '29. Public Routes', items: [
      'Public clinic listing', 'Plan information', 'Doctor browsing',
      'Department info', 'Registration endpoints',
    ]},
    { title: '30. Mobile App (React Native)', items: [
      'iOS and Android builds', 'Appointment booking and management',
      'Prescription viewing', 'Razorpay payment processing',
      'Push notifications via FCM', 'Biometric authentication (fingerprint/Face ID)',
      'WebRTC video consultations', 'Socket.io real-time updates', 'Offline data access (MMKV)',
    ]},
  ];

  s.push(heading('Features by Module'));
  for (const feat of features) {
    s.push(subheading(feat.title));
    for (const item of feat.items) s.push(bullet(item));
    s.push(emptyLine());
  }

  s.push(pgBreak());

  // API ENDPOINTS
  s.push(heading('API Endpoints (34 Route Modules)'));
  s.push(makeTable(
    ['#', 'Route', 'Module'],
    [
      ['1', '/api/v1/auth', 'Authentication'],
      ['2', '/api/v1/patients', 'Patient Management'],
      ['3', '/api/v1/appointments', 'Appointments'],
      ['4', '/api/v1/invoices', 'Invoicing'],
      ['5', '/api/v1/payments', 'Payments'],
      ['6', '/api/v1/billing', 'Billing'],
      ['7', '/api/v1/cash-register', 'Cash Register'],
      ['8', '/api/v1/credit-notes', 'Credit Notes'],
      ['9', '/api/v1/doctors', 'Doctor Management'],
      ['10', '/api/v1/staff', 'Staff Management'],
      ['11', '/api/v1/insurance', 'Insurance'],
      ['12', '/api/v1/payroll', 'Payroll'],
      ['13', '/api/v1/prescriptions', 'Prescriptions'],
      ['14', '/api/v1/consent', 'Consent Management'],
      ['15', '/api/v1/telemedicine', 'Video Consultations'],
      ['16', '/api/v1/queue', 'Queue Management'],
      ['17', '/api/v1/emergency', 'Emergency Management'],
      ['18', '/api/v1/notifications', 'Notifications'],
      ['19', '/api/v1/clinic', 'Clinic Settings'],
      ['20', '/api/v1/branches', 'Branch Management'],
      ['21', '/api/v1/departments', 'Department Management'],
      ['22', '/api/v1/users', 'User Management'],
      ['23', '/api/v1/dashboard', 'Dashboard Analytics'],
      ['24', '/api/v1/analytics', 'Advanced Analytics'],
      ['25', '/api/v1/integrations', 'Integration Management'],
      ['26', '/api/v1/integration-data', 'Integration Data Viewer'],
      ['27', '/api/v1/portal', 'Patient Portal'],
      ['28', '/api/v1/doctor', 'Doctor Dashboard'],
      ['29', '/api/v1/subscriptions', 'Subscription Management'],
      ['30', '/api/v1/legacy-uploads', 'Legacy Data Import'],
      ['31', '/api/v1/roles', 'Role Viewer'],
      ['32', '/api/v1/public', 'Public Endpoints'],
      ['33', '/api/v1/platform', 'Platform/Product Owner'],
      ['34', '/health', 'Health Check'],
    ],
    [6, 38, 56]
  ));

  s.push(pgBreak());

  // DATABASE MODELS
  s.push(heading('Database Models (40+ Collections)'));
  s.push(subheading('Tenant-Level Models'));
  s.push(makeTable(
    ['#', 'Model', 'Purpose'],
    [
      ['1', 'Patient', 'Patient profiles and demographics'],
      ['2', 'Appointment', 'Appointment scheduling and tracking'],
      ['3', 'Invoice', 'Billing and invoicing'],
      ['4', 'Payment', 'Payment records'],
      ['5', 'User', 'Staff and user accounts'],
      ['6', 'TreatmentRecord', 'Treatment documentation'],
      ['7', 'ServiceItem', 'Billable services and pricing'],
      ['8', 'Branch', 'Clinic branches'],
      ['9', 'Department', 'Clinic departments'],
      ['10', 'Prescription', 'Medication prescriptions'],
      ['11', 'Consent', 'Patient consent records'],
      ['12', 'InsuranceProvider', 'Insurance provider database'],
      ['13', 'InsuranceClaim', 'Insurance claim tracking'],
      ['14', 'Notification', 'In-app notifications'],
      ['15', 'Payslip', 'Salary payslips'],
      ['16', 'SalaryStructure', 'Staff salary configurations'],
      ['17', 'CashRegister', 'Cash register operations'],
      ['18', 'QueueEntry', 'Patient queue entries'],
      ['19', 'ChatMessage', 'Telemedicine chat messages'],
      ['20', 'EmergencySession', 'Emergency session records'],
      ['21', 'VideoSession', 'Telemedicine video sessions'],
      ['22', 'CreditNote', 'Credit note records'],
      ['23', 'Review', 'Patient reviews and ratings'],
      ['24', 'ShareToken', 'Medical record sharing tokens'],
      ['25', 'AccessLog', 'Data access audit logs'],
      ['26', 'PatientLedger', 'Patient financial ledger'],
      ['27', 'LegacyUpload', 'Bulk data import records'],
      ['28', 'IntegrationCredential', 'Encrypted integration credentials'],
      ['29', 'SyncLog', 'Integration sync history'],
      ['30', 'FinancialAuditLog', 'Financial audit trail'],
    ],
    [6, 26, 68]
  ));
  s.push(emptyLine());
  s.push(subheading('Platform-Level Models'));
  s.push(makeTable(
    ['#', 'Model', 'Purpose'],
    [
      ['1', 'Clinic', 'Tenant/clinic registration'],
      ['2', 'Subscription', 'Subscription plans and status'],
      ['3', 'PlatformUser', 'Platform admin accounts'],
      ['4', 'ProvisioningStatus', 'Tenant setup tracking'],
      ['5', 'Plan', 'Available subscription plans'],
      ['6', 'Integration', 'Integration definitions'],
      ['7', 'Rebate', 'Rebate/discount records'],
      ['8', 'FeatureFlag', 'Global feature toggles'],
      ['9', 'TenantAuditLog', 'Tenant-level audit trail'],
    ],
    [6, 26, 68]
  ));

  return s;
}

// ============================================================
// DOCUMENT 2: TEST CASES (Landscape for wider tables)
// ============================================================

function buildTestCasesDoc() {
  const s = [];

  s.push(...titlePage('BestoClinic', 'Comprehensive Test Cases Document'));

  // CREDENTIALS
  s.push(heading('Test Credentials (Seeded Data)'));
  s.push(para('Use these credentials for testing:'));
  s.push(h3('Platform Admin'));
  s.push(makeTable(['Field', 'Value'], [
    ['Email', 'admin@bestoclinic.com'],
    ['Password', 'Admin@12345'],
    ['Role', 'Product Owner'],
  ], [30, 70]));
  s.push(emptyLine());
  s.push(h3('Clinic SuperAdmin (All Clinics)'));
  s.push(makeTable(['Field', 'Value'], [
    ['Email Pattern', 'admin@<clinic-slug>.com'],
    ['Password', 'Admin@12345'],
    ['Role', 'super_admin'],
    ['Example', 'admin@smilecare-dental.com'],
  ], [30, 70]));
  s.push(emptyLine());
  s.push(h3('Patient Accounts'));
  s.push(makeTable(['Name', 'Email', 'Password', 'Tenant'], [
    ['Ananya Sharma', 'ananya.sharma@bestoclinic.com', 'Ananya@123', 'smilecare-dental'],
    ['Vinayak Mehta', 'vinayak.mehta@smilecare.clinic', 'Vinayak@2025', 'smilecare-dental'],
  ], [20, 35, 20, 25]));
  s.push(emptyLine());
  s.push(h3('New Tenant Default'));
  s.push(makeTable(['Field', 'Value'], [
    ['Default Password', 'ChangeMe@123'],
    ['Role', 'super_admin'],
    ['Header', 'X-Tenant-ID: <clinic-slug>'],
  ], [30, 70]));
  s.push(pgBreak());

  // TC widths: TC#=8, Test Case=20, Steps=28, Expected=32, Status=12
  const tcWidths = [8, 20, 28, 32, 12];

  const modules = [
    {
      title: '1. Authentication & Authorization',
      cases: [
        ['AUTH-001', 'Login with valid credentials', 'Enter valid email/password, click login', 'User authenticated, JWT token returned, redirected to dashboard'],
        ['AUTH-002', 'Login with invalid password', 'Enter valid email, wrong password, click login', 'Error "Invalid credentials", no token issued'],
        ['AUTH-003', 'Login with non-existent email', 'Enter unregistered email, any password', 'Error message, login denied'],
        ['AUTH-004', 'Login with empty fields', 'Leave email/password empty, click login', 'Validation error for required fields'],
        ['AUTH-005', 'Login with invalid email format', 'Enter "notanemail", enter password', 'Validation error for email format'],
        ['AUTH-006', 'JWT token expiry', 'Login, wait for token to expire, make API request', '401 Unauthorized response'],
        ['AUTH-007', 'Access protected route without token', 'Call protected API without Authorization header', '401 Unauthorized response'],
        ['AUTH-008', 'Access with malformed token', 'Send request with "Bearer invalidtoken123"', '401 Unauthorized response'],
        ['AUTH-009', 'Register new patient', 'Fill all required fields, submit', 'Patient account created'],
        ['AUTH-010', 'Register with existing email', 'Use already registered email, submit', 'Error: "Email already in use"'],
        ['AUTH-011', 'Register with missing fields', 'Leave name/email empty, submit', 'Validation errors returned'],
        ['AUTH-012', 'Register with invalid phone', 'Enter invalid phone format, submit', 'Validation error for phone'],
        ['AUTH-013', 'Admin accesses admin route', 'Login as Admin, access admin route', 'Access granted'],
        ['AUTH-014', 'Patient accesses admin route', 'Login as Patient, access admin route', '403 Forbidden'],
        ['AUTH-015', 'Doctor accesses doctor routes', 'Login as Doctor, access doctor dashboard', 'Access granted'],
        ['AUTH-016', 'Receptionist accesses billing', 'Login as Receptionist, try billing', 'Access based on permissions'],
        ['AUTH-017', 'Billing Officer accesses payroll', 'Login as Billing Officer, access payroll', '403 Forbidden'],
        ['AUTH-018', 'HR Manager accesses payroll', 'Login as HR/Payroll Manager, access payroll', 'Access granted'],
        ['AUTH-019', 'Feature guard - subscription', 'Login to Free plan clinic, access Pro feature', '403 feature not available'],
      ],
    },
    {
      title: '2. Patient Management',
      cases: [
        ['PAT-001', 'Create new patient', 'Fill patient form (name, DOB, gender, contact), submit', 'Patient created with unique ID'],
        ['PAT-002', 'Create with all fields', 'Fill all fields including allergies, medications, insurance', 'Patient created with complete profile'],
        ['PAT-003', 'Duplicate phone number', 'Use existing patient phone number', 'Error or handled per rules'],
        ['PAT-004', 'View patient list', 'Navigate to patient list', 'Paginated list displayed'],
        ['PAT-005', 'Search by name', 'Enter patient name in search', 'Matching patients returned'],
        ['PAT-006', 'Search by phone', 'Enter phone in search', 'Matching patient returned'],
        ['PAT-007', 'View patient profile', 'Click on patient from list', 'Full details displayed'],
        ['PAT-008', 'Update patient info', 'Edit name/contact, save', 'Info updated'],
        ['PAT-009', 'Update medical history', 'Add allergy and medication, save', 'Medical history updated'],
        ['PAT-010', 'Soft delete patient', 'Delete patient', 'Marked as deleted, not permanent'],
        ['PAT-011', 'Add allergies', 'Open profile, add allergy, save', 'Allergy recorded'],
        ['PAT-012', 'Add medications', 'Add medication with dosage, save', 'Medication recorded'],
        ['PAT-013', 'Add emergency contact', 'Enter emergency contact, save', 'Contact saved'],
        ['PAT-014', 'Link guardian', 'Link guardian to patient, save', 'Guardian linked'],
        ['PAT-015', 'Record blood group', 'Select blood group, save', 'Blood group saved'],
      ],
    },
    {
      title: '3. Appointments & Scheduling',
      cases: [
        ['APT-001', 'Book consultation', 'Select patient, doctor, date/time, type: consultation', 'Appointment created, status "requested"'],
        ['APT-002', 'Book follow-up', 'Select patient, type: follow-up, submit', 'Follow-up created'],
        ['APT-003', 'Book emergency', 'Select patient, type: emergency, submit', 'Emergency appointment with priority'],
        ['APT-004', 'Book teleconsult', 'Select patient, type: teleconsult, submit', 'Teleconsult created'],
        ['APT-005', 'Overlapping time slot', 'Book at time already taken for same doctor', 'Error: time slot unavailable'],
        ['APT-006', 'Missing required fields', 'Submit without patient/doctor', 'Validation error'],
        ['APT-007', 'Confirm appointment', 'Select requested appointment, confirm', 'Status: "confirmed"'],
        ['APT-008', 'Check-in patient', 'Select confirmed appointment, check in', 'Status: "checked-in", timestamp'],
        ['APT-009', 'Start appointment', 'Select checked-in, start', 'Status: "in-progress"'],
        ['APT-010', 'Complete appointment', 'Select in-progress, complete', 'Status: "completed"'],
        ['APT-011', 'Cancel appointment', 'Select appointment, cancel with reason', 'Status: "cancelled"'],
        ['APT-012', 'Mark no-show', 'Select confirmed past time, mark no-show', 'Status: "no-show"'],
        ['APT-013', 'Reschedule', 'Change date/time, save', 'Rescheduled'],
        ['APT-014', 'Filter by date range', 'Set start/end date, search', 'Appointments in range'],
        ['APT-015', 'Filter by doctor', 'Select doctor filter', "Doctor's appointments only"],
        ['APT-016', 'Filter by status', 'Select status filter', 'Matching status shown'],
      ],
    },
    {
      title: '4. Billing & Invoicing',
      cases: [
        ['INV-001', 'Create invoice - single item', 'Select patient, add one service, save', 'Invoice with correct total'],
        ['INV-002', 'Create invoice - multiple items', 'Add treatment + medicine + lab, save', 'All items, correct subtotal'],
        ['INV-003', 'Invoice with GST', 'Add items, apply GST (CGST+SGST), save', 'Tax calculated correctly'],
        ['INV-004', 'Invoice with IGST', 'Add items, apply IGST, save', 'IGST calculated correctly'],
        ['INV-005', 'Apply promo code', 'Create invoice, apply valid promo', 'Discount applied, total reduced'],
        ['INV-006', 'Invalid promo code', 'Enter non-existent promo', 'Error: invalid promo code'],
        ['INV-007', 'Invoice with zero items', 'Save with no items', 'Validation error'],
        ['INV-008', 'Sequential numbering', 'Create invoice A then B', 'B number = A + 1'],
        ['INV-009', 'Draft to Sent', 'Create draft, send to patient', 'Status: "sent"'],
        ['INV-010', 'Mark as Paid', 'Record full payment, update', 'Status: "paid"'],
        ['INV-011', 'Partial payment', 'Record partial payment', 'Status: "partially paid"'],
        ['INV-012', 'Cancel invoice', 'Cancel unpaid invoice', 'Status: "cancelled"'],
        ['INV-013', 'Refund invoice', 'Process refund on paid', 'Status: "refunded"'],
        ['INV-014', 'Download PDF', 'Click download on invoice', 'PDF generated'],
        ['INV-015', 'Create service item', 'Add name, price, type, save', 'Service item created'],
        ['INV-016', 'Update service price', 'Edit price, save', 'Price updated'],
      ],
    },
    {
      title: '5. Payments & Payment Gateway',
      cases: [
        ['PAY-001', 'Record cash payment', 'Select invoice, record cash, enter amount', 'Payment recorded, invoice updated'],
        ['PAY-002', 'Record card payment', 'Select invoice, record card payment', 'Payment recorded'],
        ['PAY-003', 'Partial payment', 'Pay less than total', 'Partial recorded, balance remaining'],
        ['PAY-004', 'Create Razorpay order', 'Initiate online payment', 'Razorpay order ID returned'],
        ['PAY-005', 'Verify Razorpay payment', 'Complete Razorpay checkout, verify', 'Payment verified and recorded'],
        ['PAY-006', 'Razorpay failure', 'Initiate payment, cancel on Razorpay', 'Payment marked as failed'],
        ['PAY-007', 'Razorpay webhook', 'Receive payment.captured webhook', 'Status updated automatically'],
        ['PAY-008', 'Invalid webhook signature', 'Send webhook with wrong signature', 'Webhook rejected'],
        ['PAY-009', 'Full refund', 'Select paid invoice, full refund', 'Refund processed'],
        ['PAY-010', 'Partial refund', 'Select paid invoice, partial amount', 'Partial refund recorded'],
        ['PAY-011', 'Payment history', 'Open invoice, view payments', 'All payments listed'],
      ],
    },
    {
      title: '6. Cash Register',
      cases: [
        ['CR-001', 'Open register', 'Enter opening balance, open', 'Register opened with timestamp'],
        ['CR-002', 'Record transaction', 'Process payment through register', 'Transaction recorded'],
        ['CR-003', 'Close register', 'Enter closing balance, close', 'Closed, variance calculated'],
        ['CR-004', 'Transaction history', 'Select register, view transactions', 'All transactions listed'],
        ['CR-005', 'Reconciliation report', 'Select date, generate report', 'Report with opening/closing'],
        ['CR-006', 'Close with variance', 'Close with different balance', 'Variance flagged'],
      ],
    },
    {
      title: '7. Credit Notes',
      cases: [
        ['CN-001', 'Create credit note', 'Select patient, enter amount/reason, save', 'Credit note created'],
        ['CN-002', 'Apply to invoice', 'Select invoice, apply credit note', 'Invoice balance reduced'],
        ['CN-003', 'View patient credits', 'Open patient, view credit notes', 'All credit notes listed'],
      ],
    },
    {
      title: '8. Telemedicine',
      cases: [
        ['TM-001', 'Create video session', 'Select appointment, create session', 'Session created, room token generated'],
        ['TM-002', 'Doctor accepts session', 'Doctor clicks accept', 'Session status: active'],
        ['TM-003', 'Patient joins', 'Patient clicks join link', 'Enters video room'],
        ['TM-004', 'End session', 'Doctor ends session', 'Session ended, duration recorded'],
        ['TM-005', 'Cancel session', 'Cancel before start', 'Session cancelled'],
        ['TM-006', 'Send chat message', 'Type message, send', 'Message delivered in real-time'],
        ['TM-007', 'Share file in session', 'Upload and share file', 'File shared with participant'],
        ['TM-008', 'Recording consent', 'Request recording consent', 'Consent prompt shown'],
      ],
    },
    {
      title: '9. Prescriptions',
      cases: [
        ['RX-001', 'Create prescription', 'Select patient, add medications, save', 'Prescription created'],
        ['RX-002', 'Issue prescription', 'Create and issue', 'Status: issued'],
        ['RX-003', 'Update prescription', 'Edit medication details, save', 'Updated'],
        ['RX-004', 'Cancel prescription', 'Select, cancel', 'Cancelled'],
        ['RX-005', 'View patient prescriptions', 'Open patient, view prescriptions', 'All listed'],
      ],
    },
    {
      title: '10. Doctor Management',
      cases: [
        ['DOC-001', 'Create doctor profile', 'Fill details (specialty, dept), save', 'Doctor created'],
        ['DOC-002', 'Update profile', 'Edit specialization, save', 'Profile updated'],
        ['DOC-003', 'Assign to department', 'Select department, save', 'Doctor assigned'],
        ['DOC-004', 'View patient list', 'Open doctor, view patients', 'Linked patients listed'],
        ['DOC-005', 'Dashboard statistics', 'Login as doctor, view dashboard', 'Stats shown'],
        ['DOC-006', 'Performance analytics', 'View doctor analytics', 'Metrics displayed'],
        ['DOC-007', 'Schedule management', 'Set availability, save', 'Schedule updated'],
      ],
    },
    {
      title: '11. Staff Management',
      cases: [
        ['STF-001', 'Create staff member', 'Fill details, assign role, save', 'Staff created'],
        ['STF-002', 'Assign to department', 'Select department, save', 'Assigned'],
        ['STF-003', 'Update role', 'Change role, save', 'Role updated, permissions changed'],
        ['STF-004', 'Deactivate staff', 'Deactivate member', 'Access revoked'],
        ['STF-005', 'List by role', 'Filter by role', 'Matching staff shown'],
      ],
    },
    {
      title: '12. Clinic, Branches & Departments',
      cases: [
        ['CLN-001', 'Update clinic info', 'Edit name/address/phone, save', 'Info updated'],
        ['BR-001', 'Create branch', 'Enter branch name/address, save', 'Branch created'],
        ['BR-002', 'Update branch', 'Edit details, save', 'Branch updated'],
        ['BR-003', 'Delete branch (no data)', 'Delete empty branch', 'Branch removed'],
        ['BR-004', 'Delete branch (active data)', 'Delete branch with appointments', 'Error: active data'],
        ['DEP-001', 'Create department', 'Enter name, save', 'Department created'],
        ['DEP-002', 'Assign doctors', 'Add doctors, save', 'Doctors assigned'],
        ['DEP-003', 'View department analytics', 'Open stats', 'Revenue, appointments shown'],
      ],
    },
    {
      title: '13. Insurance Management',
      cases: [
        ['INS-001', 'Add provider', 'Enter provider details, save', 'Provider added'],
        ['INS-002', 'Create claim', 'Select patient/invoice, enter details', 'Claim created (pending)'],
        ['INS-003', 'Approve claim', 'Update status to approved', 'Status: approved'],
        ['INS-004', 'Reject claim', 'Update status to rejected with reason', 'Status: rejected'],
        ['INS-005', 'Mark claim paid', 'Record settlement, update', 'Status: paid'],
        ['INS-006', 'Calculate co-pay', 'Enter coverage %, calculate', 'Correct co-pay shown'],
        ['INS-007', 'Pre-authorization', 'Record pre-auth details', 'Pre-auth saved'],
        ['INS-008', 'Insurance analytics', 'View analytics', 'Trends, approval rates shown'],
      ],
    },
    {
      title: '14. Payroll & HR',
      cases: [
        ['HR-001', 'Create salary structure', 'Enter base salary, allowances, save', 'Structure created'],
        ['HR-002', 'Generate payslip', 'Select staff, month, generate', 'Payslip created'],
        ['HR-003', 'Approve payslip', 'Review, approve', 'Status: approved'],
        ['HR-004', 'Mark payslip paid', 'Record payment, mark paid', 'Status: paid'],
        ['HR-005', 'Payroll analytics', 'Open payroll analytics', 'Breakdown shown'],
        ['HR-006', 'Salary history', 'Select staff, view history', 'All payslips listed'],
      ],
    },
    {
      title: '15. Queue Management',
      cases: [
        ['QUE-001', 'Add to queue', 'Select checked-in patient, add', 'Queue entry created'],
        ['QUE-002', 'Call patient', 'Click call on next patient', 'Status: called'],
        ['QUE-003', 'Complete entry', 'Mark as done', 'Status: completed'],
        ['QUE-004', 'Cancel entry', 'Remove from queue', 'Status: cancelled'],
        ['QUE-005', 'View current queue', 'Open queue view', 'Ordered list shown'],
        ['QUE-006', 'No-show in queue', 'Mark called patient as no-show', 'No-show recorded'],
      ],
    },
    {
      title: '16. Emergency Management',
      cases: [
        ['EMR-001', 'Create emergency', 'Enter patient details, create', 'Emergency created'],
        ['EMR-002', 'Accept emergency', 'Doctor accepts', 'Assigned to doctor'],
        ['EMR-003', 'Emergency video chat', 'Initiate video', 'Video session started'],
        ['EMR-004', 'Complete emergency', 'Mark resolved', 'Status updated, records saved'],
        ['EMR-005', 'Real-time alert', 'Create emergency', 'WebSocket alert sent to doctors'],
      ],
    },
    {
      title: '17. Patient Portal',
      cases: [
        ['PP-001', 'Patient books appointment', 'Login, select doctor/date, book', 'Appointment requested'],
        ['PP-002', 'Reschedule appointment', 'Select appointment, new date, save', 'Rescheduled'],
        ['PP-003', 'Cancel appointment', 'Select, cancel', 'Cancelled'],
        ['PP-004', 'View medical history', 'Open medical history tab', 'Records displayed'],
        ['PP-005', 'View prescriptions', 'Open prescriptions tab', 'Prescriptions listed'],
        ['PP-006', 'Initiate payment', 'Select unpaid invoice, pay', 'Payment flow initiated'],
        ['PP-007', 'Submit review', 'Rate doctor, write review, submit', 'Review submitted'],
        ['PP-008', 'Manage consent', 'View consents, approve/revoke', 'Consent updated'],
        ['PP-009', 'Update profile', 'Edit personal info, save', 'Profile updated'],
        ['PP-010', 'Download invoice PDF', 'Select invoice, download', 'PDF downloaded'],
        ['PP-011', 'Share records', 'Generate share token', 'Token created'],
        ['PP-012', 'View access logs', 'Open access log', 'Access records shown'],
        ['PP-013', 'Guardian multi-patient', 'Login as guardian, switch patients', 'Can manage linked patients'],
      ],
    },
    {
      title: '18. Integrations',
      cases: [
        ['INT-001', 'Add credentials', 'Select integration, enter credentials, save', 'Stored (encrypted)'],
        ['INT-002', 'Test connection', 'Click test connection', 'Status returned'],
        ['INT-003', 'Manual sync', 'Click sync now', 'Sync initiated'],
        ['INT-004', 'Disable integration', 'Toggle off', 'Disabled'],
        ['INT-005', 'View sync logs', 'Open sync logs', 'Entries with status'],
        ['INT-006', 'Invalid credentials', 'Enter wrong credentials, test', 'Connection failed'],
      ],
    },
    {
      title: '19. Notifications',
      cases: [
        ['NTF-001', 'Appointment notification', 'Book/confirm appointment', 'Notification created'],
        ['NTF-002', 'Billing notification', 'Create invoice for patient', 'Patient notified'],
        ['NTF-003', 'Unread count', 'Check notification bell', 'Correct count shown'],
        ['NTF-004', 'Mark as read', 'Click notification', 'Marked read, count decremented'],
        ['NTF-005', 'Mark all read', 'Click "mark all read"', 'All marked read'],
        ['NTF-006', 'Push notification (mobile)', 'Trigger event', 'FCM push received'],
        ['NTF-007', 'Real-time notification', 'Trigger event', 'WebSocket delivers instantly'],
      ],
    },
    {
      title: '20. Analytics & Dashboard',
      cases: [
        ['ANL-001', 'Dashboard summary', 'Open dashboard', 'Key metrics displayed'],
        ['ANL-002', 'Revenue trends', 'Open revenue analytics, select range', 'Revenue chart shown'],
        ['ANL-003', 'Appointment trends', 'View appointment analytics', 'Volume charts shown'],
        ['ANL-004', 'Doctor performance', 'View doctor analytics', 'Per-doctor metrics'],
        ['ANL-005', 'No-show analysis', 'View no-show report', 'Rates and patterns'],
        ['ANL-006', 'Insurance analytics', 'View insurance report', 'Claim trends'],
        ['ANL-007', 'Patient growth', 'View patient analytics', 'Growth trends'],
        ['ANL-008', 'Filter by branch', 'Select branch filter', 'Scoped analytics'],
        ['ANL-009', 'Filter by date range', 'Set custom range', 'Filtered data'],
      ],
    },
    {
      title: '21. Consent & Treatment Records',
      cases: [
        ['CON-001', 'Create consent request', 'Select patient, consent type, create', 'Request created'],
        ['CON-002', 'Patient approves', 'Patient views, approves', 'Approved, timestamp recorded'],
        ['CON-003', 'Patient revokes', 'Revoke previously approved', 'Revoked, audit logged'],
        ['TR-001', 'Create treatment record', 'Select patient, enter details, save', 'Record created'],
        ['TR-002', 'Add consultation notes', 'Enter diagnosis/notes, save', 'Notes saved'],
        ['TR-003', 'Upload attachment', 'Upload X-ray/image, save', 'Attachment linked'],
        ['TR-004', 'Create follow-up', 'Mark for follow-up, set date', 'Follow-up scheduled'],
        ['TR-005', 'View treatment history', 'Open patient, view treatments', 'Listed chronologically'],
      ],
    },
    {
      title: '22. Legacy Upload & Subscriptions',
      cases: [
        ['LDU-001', 'Upload patient CSV', 'Prepare CSV, upload', 'Data imported, count shown'],
        ['LDU-002', 'Upload with errors', 'Upload CSV with invalid data', 'Errors listed, valid imported'],
        ['LDU-003', 'Large file upload', 'Upload 1000+ records', 'Background processing'],
        ['SUB-001', 'View current plan', 'Open subscription page', 'Plan and features shown'],
        ['SUB-002', 'Upgrade plan', 'Select higher plan, confirm', 'Upgraded, features unlocked'],
        ['SUB-003', 'Downgrade plan', 'Select lower plan, confirm', 'Downgraded, features restricted'],
        ['SUB-004', 'Feature access by plan', 'Access feature not in plan', 'Blocked with upgrade prompt'],
      ],
    },
    {
      title: '23. Platform Management',
      cases: [
        ['PLT-001', 'View all tenants', 'Login as Product Owner, list clinics', 'All tenants listed'],
        ['PLT-002', 'Provision tenant', 'Create new clinic, configure', 'Tenant DB created'],
        ['PLT-003', 'Manage feature flags', 'Toggle flag, save', 'Feature enabled/disabled'],
        ['PLT-004', 'View audit logs', 'Select tenant, view logs', 'Audit trail shown'],
        ['PLT-005', 'Health check', 'Call /health endpoint', 'System status returned'],
      ],
    },
    {
      title: '24. Public Routes',
      cases: [
        ['PUB-001', 'View clinic listing', 'Access public clinic list (no auth)', 'Clinics listed'],
        ['PUB-002', 'View plans', 'Access public plans page', 'Plans with features'],
        ['PUB-003', 'Browse doctors', 'View public doctor list', 'Names, specialties shown'],
        ['PUB-004', 'Public registration', 'Register through public page', 'Account created'],
      ],
    },
    {
      title: '25. Mobile App',
      cases: [
        ['MOB-001', 'Login on mobile', 'Enter credentials, login', 'Authenticated, token stored'],
        ['MOB-002', 'Biometric login', 'Enable fingerprint/Face ID, login', 'Authenticated via biometric'],
        ['MOB-003', 'Book appointment', 'Select doctor/date, book', 'Appointment created'],
        ['MOB-004', 'View prescriptions', 'Open prescriptions tab', 'Prescriptions displayed'],
        ['MOB-005', 'Make payment', 'Select invoice, pay via Razorpay', 'Payment processed'],
        ['MOB-006', 'Push notification', 'Trigger event', 'Push received'],
        ['MOB-007', 'Join video call', 'Accept teleconsult, join', 'WebRTC session started'],
        ['MOB-008', 'Offline access', 'Open app offline', 'Cached data shown'],
        ['MOB-009', 'Session expiry', 'Let token expire, use app', 'Redirect to login'],
      ],
    },
    {
      title: '26. Security & Non-Functional',
      cases: [
        ['SEC-001', 'NoSQL injection', 'Enter malicious input in fields', 'Input sanitized'],
        ['SEC-002', 'XSS prevention', 'Enter script tags in text fields', 'Scripts escaped'],
        ['SEC-003', 'Rate limiting', 'Send 100+ requests rapidly', '429 Too Many Requests'],
        ['SEC-004', 'Tenant data isolation', 'Login Clinic A, try Clinic B data', 'Access denied'],
        ['SEC-005', 'Password hashing', 'Check database', 'Passwords hashed, not plaintext'],
        ['SEC-006', 'Security headers', 'Check response headers', 'Helmet headers present'],
        ['PERF-001', 'Large patient list', 'Load 10,000+ patients', 'Pagination works'],
        ['PERF-002', 'Concurrent WebSockets', 'Connect 50+ users', 'All maintained'],
        ['MT-001', 'Tenant resolution', 'Login to specific clinic', 'Correct tenant DB connected'],
        ['MT-002', 'Cross-tenant leak test', 'Manipulate tenant ID in request', 'Access denied'],
      ],
    },
  ];

  for (const mod of modules) {
    s.push(heading(mod.title));
    s.push(makeTable(
      ['TC#', 'Test Case', 'Steps', 'Expected Result', 'Status'],
      mod.cases.map((c) => [...c, '']),
      tcWidths
    ));
    s.push(emptyLine());
  }

  // SUMMARY
  s.push(pgBreak());
  s.push(heading('Test Cases Summary'));
  const totalCases = modules.reduce((sum, m) => sum + m.cases.length, 0);
  s.push(makeTable(
    ['#', 'Module', 'Test Cases'],
    modules.map((m, i) => [String(i + 1), m.title, String(m.cases.length)]),
    [8, 72, 20]
  ));
  s.push(emptyLine());
  s.push(para(`Total Test Cases: ${totalCases}`, { bold: true, size: 24 }));

  return s;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const outDir = path.resolve(__dirname, '..');

  const makeDocSection = (title, children, landscape) => ({
    properties: landscape ? {
      page: { size: { orientation: 'landscape' } },
    } : undefined,
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: title, size: 16, color: COLORS.mediumText, italics: true, font: 'Calibri' })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Page ', size: 16, color: COLORS.mediumText, font: 'Calibri' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLORS.mediumText, font: 'Calibri' }),
          ],
        })],
      }),
    },
    children,
  });

  // Features Document (Portrait)
  const featuresDoc = new Document({
    title: 'BestoClinic - Features Document',
    sections: [makeDocSection('BestoClinic - Features Document', buildFeaturesDoc(), false)],
  });
  const featuresBuffer = await Packer.toBuffer(featuresDoc);
  const featuresPath = path.join(outDir, 'BestoClinic_Features.docx');
  fs.writeFileSync(featuresPath, featuresBuffer);
  console.log(`Features document: ${featuresPath}`);

  // Test Cases Document (Landscape for wider test case tables)
  const testCasesDoc = new Document({
    title: 'BestoClinic - Test Cases',
    sections: [makeDocSection('BestoClinic - Test Cases', buildTestCasesDoc(), true)],
  });
  const testBuffer = await Packer.toBuffer(testCasesDoc);
  const testPath = path.join(outDir, 'BestoClinic_TestCases.docx');
  fs.writeFileSync(testPath, testBuffer);
  console.log(`Test cases document: ${testPath}`);

  console.log('\nDone! Both Word documents generated successfully.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
