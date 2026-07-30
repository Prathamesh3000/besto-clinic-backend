#!/usr/bin/env python3
"""Generate BestoClinic Features & Test Cases Word documents with proper table formatting."""

from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_ORIENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml
import os

# ============================================================
# COLORS
# ============================================================
HEADER_BG = "1B4F72"
HEADER_TEXT = RGBColor(0xFF, 0xFF, 0xFF)
ALT_ROW_BG = "EBF5FB"
PRIMARY = RGBColor(0x1B, 0x4F, 0x72)
DARK_TEXT = RGBColor(0x2C, 0x3E, 0x50)
MEDIUM_TEXT = RGBColor(0x56, 0x65, 0x73)

# ============================================================
# HELPERS
# ============================================================

def set_cell_shading(cell, color):
    """Set cell background color."""
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color}"/>')
    cell._tc.get_or_add_tcPr().append(shading)


def set_cell_width(cell, width_inches):
    """Set exact cell width."""
    cell.width = Inches(width_inches)


def set_cell_margins(cell, top=40, bottom=40, left=80, right=80):
    """Set cell margins in twips."""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcMar = parse_xml(
        f'<w:tcMar {nsdecls("w")}>'
        f'  <w:top w:w="{top}" w:type="dxa"/>'
        f'  <w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'  <w:left w:w="{left}" w:type="dxa"/>'
        f'  <w:right w:w="{right}" w:type="dxa"/>'
        f'</w:tcMar>'
    )
    tcMar_existing = tcPr.find(qn('w:tcMar'))
    if tcMar_existing is not None:
        tcPr.remove(tcMar_existing)
    tcPr.append(tcMar)


def set_table_col_widths(table, widths_inches):
    """Set column widths for a table."""
    for row in table.rows:
        for i, cell in enumerate(row.cells):
            if i < len(widths_inches):
                cell.width = Inches(widths_inches[i])


def make_table(doc, headers, rows, col_widths, font_size=8):
    """Create a properly formatted table with exact column widths."""
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    # Set preferred table width to sum of columns
    total = sum(col_widths)
    tbl = table._tbl
    tblPr = tbl.tblPr if tbl.tblPr is not None else parse_xml(f'<w:tblPr {nsdecls("w")}/>')
    tblW = parse_xml(f'<w:tblW {nsdecls("w")} w:w="{int(total * 1440)}" w:type="dxa"/>')
    existing_w = tblPr.find(qn('w:tblW'))
    if existing_w is not None:
        tblPr.remove(existing_w)
    tblPr.append(tblW)

    # Style
    table.style = 'Table Grid'

    # Header row
    hdr_row = table.rows[0]
    hdr_row.height = Cm(0.8)
    for i, hdr_text in enumerate(headers):
        cell = hdr_row.cells[i]
        set_cell_shading(cell, HEADER_BG)
        set_cell_margins(cell)
        cell.width = Inches(col_widths[i])
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(hdr_text)
        run.bold = True
        run.font.color.rgb = HEADER_TEXT
        run.font.size = Pt(font_size)
        run.font.name = 'Calibri'

    # Data rows
    for ri, row_data in enumerate(rows):
        row = table.rows[ri + 1]
        for ci, val in enumerate(row_data):
            cell = row.cells[ci]
            cell.width = Inches(col_widths[ci])
            set_cell_margins(cell)
            if ri % 2 == 1:
                set_cell_shading(cell, ALT_ROW_BG)
            p = cell.paragraphs[0]
            run = p.add_run(str(val))
            run.font.size = Pt(font_size)
            run.font.name = 'Calibri'
            run.font.color.rgb = DARK_TEXT

    # Force column widths
    set_table_col_widths(table, col_widths)

    return table


def add_heading_styled(doc, text, level=1):
    """Add a styled heading."""
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        run.font.color.rgb = PRIMARY
    return h


def add_para(doc, text, bold=False, size=11):
    """Add a paragraph."""
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.size = Pt(size)
    run.font.name = 'Calibri'
    run.font.color.rgb = DARK_TEXT
    run.bold = bold
    return p


def add_bullet(doc, text, size=10):
    """Add a bullet point."""
    p = doc.add_paragraph(style='List Bullet')
    run = p.add_run(text)
    run.font.size = Pt(size)
    run.font.name = 'Calibri'
    run.font.color.rgb = DARK_TEXT
    return p


def title_page(doc, title, subtitle):
    """Add a title page."""
    for _ in range(6):
        doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(title)
    run.font.size = Pt(28)
    run.font.color.rgb = PRIMARY
    run.bold = True
    run.font.name = 'Calibri'

    p2 = doc.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run2 = p2.add_run(subtitle)
    run2.font.size = Pt(14)
    run2.font.color.rgb = RGBColor(0x2E, 0x86, 0xC1)
    run2.italic = True
    run2.font.name = 'Calibri'

    from datetime import date
    p3 = doc.add_paragraph()
    p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run3 = p3.add_run(f"Generated: {date.today().strftime('%d %B %Y')}")
    run3.font.size = Pt(11)
    run3.font.color.rgb = MEDIUM_TEXT
    run3.font.name = 'Calibri'

    p4 = doc.add_paragraph()
    p4.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run4 = p4.add_run('BestoClinic - Multi-Tenant Dental Clinic Management SaaS')
    run4.font.size = Pt(11)
    run4.font.color.rgb = MEDIUM_TEXT
    run4.font.name = 'Calibri'

    doc.add_page_break()


# ============================================================
# FEATURES DOCUMENT
# ============================================================

def build_features_doc():
    doc = Document()

    # Set default font
    style = doc.styles['Normal']
    style.font.name = 'Calibri'
    style.font.size = Pt(10)

    title_page(doc, 'BestoClinic', 'Complete Features Document')

    # --- CREDENTIALS (VERIFIED FROM DATABASE) ---
    add_heading_styled(doc, 'Verified Login Credentials', 1)
    add_para(doc, 'The following credentials have been verified against the live database.')

    add_heading_styled(doc, 'Platform Admin', 2)
    make_table(doc,
        ['Field', 'Value'],
        [
            ['Role', 'Product Owner (Platform-level)'],
            ['Name', 'Platform Administrator'],
            ['Email', 'admin@bestoclinic.com'],
            ['Password', 'Admin@12345'],
            ['Login URL', 'https://bestoclinic.com/platform/login'],
        ],
        [2.0, 4.5]
    )

    doc.add_paragraph()
    add_heading_styled(doc, 'SmileCare Dental Clinic - Staff Accounts', 2)
    add_para(doc, 'Tenant: smilecare-dental | X-Tenant-ID: smilecare-dental')
    make_table(doc,
        ['Name', 'Email', 'Role', 'Password'],
        [
            ['Dr. Priya Sharma', 'priya.sharma@smilecare.clinic', 'super_admin', 'Doctor@123'],
            ['Dr. Rahul Mehta', 'rahul.mehta@smilecare.clinic', 'doctor', 'Doctor@123'],
            ['Dr. Anita Desai', 'anita.desai@smilecare.clinic', 'doctor', 'Doctor@123'],
            ['Dr. Vikram Singh', 'vikram.singh@smilecare.clinic', 'doctor', 'Doctor@123'],
            ['Dr. Sneha Patel', 'sneha.patel@smilecare.clinic', 'doctor', 'Doctor@123'],
            ['Dr. Arjun Nair', 'arjun.nair@smilecare.clinic', 'doctor', 'Doctor@123'],
            ['Kavita Joshi', 'kavita.joshi@smilecare.clinic', 'admin', 'Staff@1234'],
            ['Manish Gupta', 'manish.gupta@smilecare.clinic', 'manager', 'Staff@1234'],
            ['Pooja Verma', 'pooja.verma@smilecare.clinic', 'receptionist', 'Staff@1234'],
            ['Ritu Agarwal', 'ritu.agarwal@smilecare.clinic', 'receptionist', 'Staff@1234'],
            ['Suresh Kulkarni', 'suresh.kulkarni@smilecare.clinic', 'billing_officer', 'Staff@1234'],
            ['Deepak Kumar', 'deepak.kumar@smilecare.clinic', 'support_staff', 'Staff@1234'],
            ['Meena Tiwari', 'meena.tiwari@smilecare.clinic', 'support_staff', 'Staff@1234'],
        ],
        [1.5, 2.5, 1.2, 1.0],
        font_size=8
    )

    doc.add_paragraph()
    add_heading_styled(doc, 'SmileCare Dental - Patient Accounts', 2)
    add_para(doc, 'Patient passwords were set via UI and could not be determined from the database.')
    make_table(doc,
        ['Name', 'Email', 'Role', 'Password'],
        [
            ['Preeti', 'preeti@gmail.com', 'patient', 'Set via UI (unknown)'],
            ['Abcd', 'kakaka@gmail.com', 'patient', 'Set via UI (unknown)'],
        ],
        [1.5, 2.5, 1.2, 1.5]
    )

    doc.add_page_break()

    # --- ACTIVE CLINICS (Verified from DB) ---
    add_heading_styled(doc, 'Active Clinics (Verified from Database)', 1)
    add_para(doc, 'Only 1 clinic is currently provisioned in the database.')
    make_table(doc,
        ['Field', 'Value'],
        [
            ['Clinic Name', 'SmileCare Dental Clinic'],
            ['Slug / Tenant ID', 'smilecare-dental'],
            ['Email', 'contact@smilecare.clinic'],
            ['Plan', 'Professional (Active)'],
            ['City', 'Mumbai, Maharashtra'],
            ['Doctors', '3 (active in usage)'],
            ['Staff', '13 (active in usage)'],
            ['Patients', '20'],
            ['Appointments', '60'],
            ['Invoices', '22'],
            ['Collections', '30 (fully provisioned)'],
        ],
        [2.0, 4.5]
    )

    doc.add_paragraph()
    add_heading_styled(doc, 'Platform Database Summary', 2)
    make_table(doc,
        ['Collection', 'Documents'],
        [
            ['platformusers', '1'],
            ['plans', '4'],
            ['clinics', '1'],
            ['featureflags', '7'],
            ['promotions', '4'],
            ['rebates', '7'],
            ['integrations', '0'],
            ['provisioningstatuses', '0'],
            ['subscriptions', '0'],
            ['tenantauditlogs', '0'],
        ],
        [3.0, 3.5]
    )

    doc.add_page_break()

    # --- SUBSCRIPTION PLANS ---
    add_heading_styled(doc, 'Subscription Plans', 1)
    make_table(doc,
        ['Plan', 'Price/Mo', 'Doctors', 'Staff', 'Branches', 'Storage', 'SMS/Mo', 'Tele', 'Brand', 'API'],
        [
            ['Free', '0', '1', '2', '1', '250 MB', '0', 'No', 'No', 'No'],
            ['Starter', '2,999', '3', '10', '1', '2 GB', '500', 'No', 'No', 'No'],
            ['Professional', '7,999', '10', '30', '3', '10 GB', '2,000', 'Yes', 'Yes', 'No'],
            ['Enterprise', '19,999', '50', '100', '10', '50 GB', '10,000', 'Yes', 'Yes', 'Yes'],
        ],
        [1.0, 0.7, 0.6, 0.5, 0.7, 0.6, 0.6, 0.45, 0.5, 0.45],
        font_size=8
    )

    doc.add_page_break()

    # --- TECH STACK ---
    add_heading_styled(doc, 'Tech Stack', 1)
    make_table(doc,
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
        [1.8, 4.7]
    )

    doc.add_page_break()

    # --- ROLES ---
    add_heading_styled(doc, 'User Roles', 1)
    make_table(doc,
        ['#', 'Role', 'Description'],
        [
            ['1', 'Product Owner', 'Platform-level admin, tenant management, feature flags'],
            ['2', 'Super Admin', 'Full clinic-level access, system configuration'],
            ['3', 'Admin', 'Clinic administration, user management'],
            ['4', 'Manager', 'Clinic operations oversight, reporting'],
            ['5', 'Dept Manager', 'Department-level operations, staff oversight'],
            ['6', 'Doctor', 'Patient consultations, treatments, prescriptions'],
            ['7', 'Receptionist', 'Check-in, appointment scheduling, queue'],
            ['8', 'Support Staff', 'Patient assistance, front-desk operations'],
            ['9', 'Billing Officer', 'Invoice creation, payment processing'],
            ['10', 'Accountant', 'Financial reporting, reconciliation'],
            ['11', 'HR/Payroll Mgr', 'Salary management, payslip generation'],
            ['12', 'IT Support', 'System maintenance, technical support'],
            ['13', 'Patient', 'Self-service portal, appointments, payments'],
            ['14', 'Guardian', 'Manage multiple linked patients'],
        ],
        [0.4, 1.3, 4.8]
    )

    doc.add_page_break()

    # --- FEATURES BY MODULE ---
    features = [
        ('1. Authentication & Authorization', [
            'Multi-tenant JWT authentication', 'Login / Logout / Registration', 'Role-based access control (RBAC) with 12+ roles',
            'Permission-based endpoint authorization', 'Feature guards based on subscription tier', 'Token expiry and refresh handling',
        ]),
        ('2. Patient Management', [
            'Patient registration with demographics (name, DOB, gender, contact)', 'Medical history tracking (allergies, medications, conditions)',
            'Blood group and insurance information storage', 'Emergency contact and guardian linking', 'Patient search by name, phone, or ID',
            'Soft delete with historical data preservation', 'External data sync (RioView, RomExis)', 'Patient-doctor relationship management',
        ]),
        ('3. Appointments & Scheduling', [
            'Appointment booking (consultation, follow-up, procedure, emergency, teleconsult)',
            'Full lifecycle: requested > confirmed > checked-in > in-progress > completed',
            'Cancellation with reason tracking', 'No-show marking and tracking', 'Rescheduling support',
            'Duration and time slot management', 'Filtering by date, doctor, status, and type',
            'Reminder system integration', 'Invoice linking to appointments',
        ]),
        ('4. Billing & Invoicing', [
            'Invoice creation with line items (treatment, medicine, equipment, lab, consultation)',
            'GST/Tax management (CGST, SGST, IGST, cess)', 'Promotion codes and discount application',
            'Invoice lifecycle: draft > sent > paid > partially paid > overdue > cancelled > refunded',
            'Sequential invoice numbering per tenant', 'Service item management with configurable pricing',
            'Invoice PDF generation and download',
        ]),
        ('5. Financial Management', [
            'Revenue trends and analytics', 'Doctor-wise revenue breakdown', 'Outstanding balance tracking',
            'Patient ledger with full financial history', 'Advance payment recording',
            'Ledger adjustments with audit trail', 'Multi-currency support (default INR)', 'Financial audit logging',
        ]),
        ('6. Payments & Razorpay Gateway', [
            'Direct payment recording (cash, card, etc.)', 'Razorpay integration (order creation, checkout, verification)',
            'Payment webhooks for real-time status updates', 'Full and partial refund processing',
            'Payment status tracking', 'Invoice-specific payment history', 'Patient-initiated payment support',
        ]),
        ('7. Cash Register Management', [
            'Cash register open/close operations', 'Opening and closing balance tracking',
            'Transaction recording and reconciliation', 'Daily reconciliation reports',
            'Variance calculation and flagging', 'Multiple register support across branches',
        ]),
        ('8. Credit Note Management', [
            'Credit note creation with reason', 'Application to patient invoices',
            'Refund tracking via credit notes', 'Patient-wise credit note listing',
        ]),
        ('9. Telemedicine', [
            'Video consultation sessions via WebRTC', 'Session lifecycle: create > accept > join > end > cancel',
            'Real-time in-session chat messaging', 'File sharing during consultations',
            'Recording consent management', 'Connection event logging', 'Room token generation',
        ]),
        ('10. Prescription Management', [
            'Create and issue prescriptions with medications', 'Prescription status tracking (active, issued, cancelled)',
            'Update and cancel prescriptions', 'Patient prescription history', 'Doctor-issued prescription listing',
        ]),
        ('11. Doctor Management', [
            'Doctor profile creation (name, specialty, qualifications)', 'Department and branch assignment',
            'Schedule / availability management', 'Patient list per doctor',
            'Doctor performance analytics', 'Doctor-specific revenue tracking',
            'Doctor self-service dashboard', 'Consultation lifecycle management',
        ]),
        ('12. Staff Management', [
            'Staff creation with role assignment', 'Department and branch assignment',
            'Profile management and editing', 'Staff listing with filtering',
            'Staff activation/deactivation', 'Permission management based on role',
        ]),
        ('13. Clinic Settings & Configuration', [
            'Clinic information management', 'Clinic branding and logo (subscription-dependent)',
            'Clinic-level configuration', 'Clinic detail viewing',
        ]),
        ('14. Branch Management', [
            'Multi-branch clinic support', 'Branch creation with address',
            'Branch-level configurations', 'Staff assignment to branches', 'Branch deletion with safety checks',
        ]),
        ('15. Department Management', [
            'Department creation and editing', 'Doctor assignment to departments',
            'Department-specific analytics', 'Department hierarchy and listing',
        ]),
        ('16. Insurance Management', [
            'Insurance provider database', 'Claim creation and submission',
            'Claim status: pending > approved > rejected > paid',
            'Co-pay calculation', 'Pre-authorization recording', 'Settlement reconciliation', 'Insurance claim analytics',
        ]),
        ('17. Payroll & HR', [
            'Salary structure creation (base, allowances, deductions)', 'Monthly payslip generation',
            'Payslip approval workflow', 'Payment marking and tracking',
            'Payroll analytics and reporting', 'Staff salary history',
        ]),
        ('18. Queue Management', [
            'Smart patient queue system', 'Queue entry creation', 'Patient call and completion tracking',
            'Queue statuses: waiting > called > completed > cancelled', 'Current queue view',
            'No-show tracking', 'Real-time queue updates',
        ]),
        ('19. Emergency Management', [
            'Emergency session creation', 'Emergency acceptance and doctor assignment',
            'Emergency video chat', 'Emergency status tracking', 'Real-time WebSocket alerts to doctors',
        ]),
        ('20. Patient Portal (Self-Service)', [
            'Patient dashboard', 'Appointment booking, rescheduling, cancellation',
            'Medical history and treatment viewing', 'Prescription access',
            'Payment initiation and financial summary', 'Review and rating submission',
            'Consent management', 'Invoice PDF download', 'Share tokens for record sharing',
            'Access log viewing', 'Guardian multi-patient support',
        ]),
        ('21. Integrations', [
            'RioView integration (dental management)', 'RomExis integration',
            'Credential storage with encryption', 'Manual sync triggering',
            'Integration status monitoring', 'Test connection validation', 'Sync log tracking',
        ]),
        ('22. Notifications', [
            'In-app notification system', 'Types: appointment, billing, system alerts',
            'Unread count badge', 'Mark as read (individual and bulk)',
            'Push notifications via FCM', 'Real-time delivery via WebSocket',
        ]),
        ('23. Analytics & Dashboard', [
            'Dashboard summary with key metrics', 'Revenue trends', 'Appointment trends',
            'Doctor performance metrics', 'No-show analysis', 'Insurance analytics',
            'Telemedicine usage', 'Patient growth trends', 'Filtering by branch and date range',
        ]),
        ('24. Consent Management', [
            'Medical procedure consent', 'Data sharing consent', 'Approval and revocation', 'Full audit trail',
        ]),
        ('25. Treatment Records', [
            'Treatment documentation', 'Consultation notes', 'Follow-up creation',
            'Attachment uploads (X-rays, images)', 'Treatment history per patient',
        ]),
        ('26. Legacy Data Upload', [
            'Bulk patient CSV import', 'Data validation', 'Upload status tracking',
            'Error handling and reporting', 'Background processing via BullMQ',
        ]),
        ('27. Subscription Management', [
            'Multi-plan support: Free, Starter, Professional, Enterprise',
            'Feature allocation and toggles', 'Subscription lifecycle management',
            'Add-on pricing (SMS, telehealth, API)', 'Plan upgrade/downgrade',
        ]),
        ('28. Platform Management', [
            'Tenant provisioning and onboarding', 'Platform user management',
            'Feature flag management', 'Tenant audit logging', 'Health check endpoint',
        ]),
        ('29. Public Routes', [
            'Public clinic listing', 'Plan information', 'Doctor browsing', 'Department info', 'Registration endpoints',
        ]),
        ('30. Mobile App (React Native)', [
            'iOS and Android builds', 'Appointment booking and management',
            'Prescription viewing', 'Razorpay payment processing',
            'Push notifications via FCM', 'Biometric authentication (fingerprint/Face ID)',
            'WebRTC video consultations', 'Socket.io real-time updates', 'Offline data access (MMKV)',
        ]),
    ]

    add_heading_styled(doc, 'Features by Module', 1)
    for title, items in features:
        add_heading_styled(doc, title, 2)
        for item in items:
            add_bullet(doc, item)

    doc.add_page_break()

    # --- API ENDPOINTS ---
    add_heading_styled(doc, 'API Endpoints (34 Route Modules)', 1)
    endpoints = [
        ['1', '/api/v1/auth', 'Authentication'], ['2', '/api/v1/patients', 'Patient Management'],
        ['3', '/api/v1/appointments', 'Appointments'], ['4', '/api/v1/invoices', 'Invoicing'],
        ['5', '/api/v1/payments', 'Payments'], ['6', '/api/v1/billing', 'Billing'],
        ['7', '/api/v1/cash-register', 'Cash Register'], ['8', '/api/v1/credit-notes', 'Credit Notes'],
        ['9', '/api/v1/doctors', 'Doctor Management'], ['10', '/api/v1/staff', 'Staff Management'],
        ['11', '/api/v1/insurance', 'Insurance'], ['12', '/api/v1/payroll', 'Payroll'],
        ['13', '/api/v1/prescriptions', 'Prescriptions'], ['14', '/api/v1/consent', 'Consent Management'],
        ['15', '/api/v1/telemedicine', 'Video Consultations'], ['16', '/api/v1/queue', 'Queue Management'],
        ['17', '/api/v1/emergency', 'Emergency Management'], ['18', '/api/v1/notifications', 'Notifications'],
        ['19', '/api/v1/clinic', 'Clinic Settings'], ['20', '/api/v1/branches', 'Branch Management'],
        ['21', '/api/v1/departments', 'Department Management'], ['22', '/api/v1/users', 'User Management'],
        ['23', '/api/v1/dashboard', 'Dashboard Analytics'], ['24', '/api/v1/analytics', 'Advanced Analytics'],
        ['25', '/api/v1/integrations', 'Integration Management'], ['26', '/api/v1/integration-data', 'Integration Data Viewer'],
        ['27', '/api/v1/portal', 'Patient Portal'], ['28', '/api/v1/doctor', 'Doctor Dashboard'],
        ['29', '/api/v1/subscriptions', 'Subscription Management'], ['30', '/api/v1/legacy-uploads', 'Legacy Data Import'],
        ['31', '/api/v1/roles', 'Role Viewer'], ['32', '/api/v1/public', 'Public Endpoints'],
        ['33', '/api/v1/platform', 'Platform/Product Owner'], ['34', '/health', 'Health Check'],
    ]
    make_table(doc, ['#', 'Route', 'Module'], endpoints, [0.4, 2.5, 3.6])

    doc.add_page_break()

    # --- DATABASE MODELS ---
    add_heading_styled(doc, 'Database Models (40+ Collections)', 1)
    add_heading_styled(doc, 'Tenant-Level Models', 2)
    tenant_models = [
        ['1', 'Patient', 'Patient profiles and demographics'], ['2', 'Appointment', 'Scheduling and tracking'],
        ['3', 'Invoice', 'Billing and invoicing'], ['4', 'Payment', 'Payment records'],
        ['5', 'User', 'Staff and user accounts'], ['6', 'TreatmentRecord', 'Treatment documentation'],
        ['7', 'ServiceItem', 'Billable services/pricing'], ['8', 'Branch', 'Clinic branches'],
        ['9', 'Department', 'Clinic departments'], ['10', 'Prescription', 'Medication prescriptions'],
        ['11', 'Consent', 'Patient consent records'], ['12', 'InsuranceProvider', 'Insurance provider DB'],
        ['13', 'InsuranceClaim', 'Insurance claim tracking'], ['14', 'Notification', 'In-app notifications'],
        ['15', 'Payslip', 'Salary payslips'], ['16', 'SalaryStructure', 'Salary configurations'],
        ['17', 'CashRegister', 'Cash register ops'], ['18', 'QueueEntry', 'Patient queue entries'],
        ['19', 'ChatMessage', 'Telemedicine chat'], ['20', 'EmergencySession', 'Emergency records'],
        ['21', 'VideoSession', 'Video sessions'], ['22', 'CreditNote', 'Credit note records'],
        ['23', 'Review', 'Patient reviews/ratings'], ['24', 'ShareToken', 'Record sharing tokens'],
        ['25', 'AccessLog', 'Data access audit'], ['26', 'PatientLedger', 'Patient financial ledger'],
        ['27', 'LegacyUpload', 'Bulk import records'], ['28', 'IntegrationCredential', 'Encrypted credentials'],
        ['29', 'SyncLog', 'Integration sync history'], ['30', 'FinancialAuditLog', 'Financial audit trail'],
    ]
    make_table(doc, ['#', 'Model', 'Purpose'], tenant_models, [0.4, 1.8, 4.3], font_size=8)

    doc.add_paragraph()
    add_heading_styled(doc, 'Platform-Level Models', 2)
    platform_models = [
        ['1', 'Clinic', 'Tenant/clinic registration'], ['2', 'Subscription', 'Plans and status'],
        ['3', 'PlatformUser', 'Platform admin accounts'], ['4', 'ProvisioningStatus', 'Tenant setup tracking'],
        ['5', 'Plan', 'Subscription plans'], ['6', 'Integration', 'Integration definitions'],
        ['7', 'Rebate', 'Rebate/discount records'], ['8', 'FeatureFlag', 'Global feature toggles'],
        ['9', 'TenantAuditLog', 'Tenant audit trail'],
    ]
    make_table(doc, ['#', 'Model', 'Purpose'], platform_models, [0.4, 1.8, 4.3])

    return doc


# ============================================================
# TEST CASES DOCUMENT (Landscape)
# ============================================================

def build_test_cases_doc():
    doc = Document()

    # Set default font
    style = doc.styles['Normal']
    style.font.name = 'Calibri'
    style.font.size = Pt(9)

    # Set landscape
    section = doc.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    new_width, new_height = section.page_height, section.page_width
    section.page_width = new_width
    section.page_height = new_height
    section.left_margin = Cm(1.5)
    section.right_margin = Cm(1.5)

    title_page(doc, 'BestoClinic', 'Comprehensive Test Cases Document')

    # --- CREDENTIALS (VERIFIED FROM DATABASE) ---
    add_heading_styled(doc, 'Test Credentials (Verified from Database)', 1)
    add_para(doc, 'Use these credentials for testing. All verified against the live database.')

    add_heading_styled(doc, 'Platform Admin', 3)
    make_table(doc, ['Field', 'Value'], [
        ['Email', 'admin@bestoclinic.com'], ['Password', 'Admin@12345'], ['Role', 'Product Owner'],
    ], [2.0, 5.0])

    doc.add_paragraph()
    add_heading_styled(doc, 'SmileCare Dental - Doctors (Password: Doctor@123)', 3)
    make_table(doc, ['Name', 'Email', 'Role'], [
        ['Dr. Priya Sharma', 'priya.sharma@smilecare.clinic', 'super_admin'],
        ['Dr. Rahul Mehta', 'rahul.mehta@smilecare.clinic', 'doctor'],
        ['Dr. Anita Desai', 'anita.desai@smilecare.clinic', 'doctor'],
        ['Dr. Vikram Singh', 'vikram.singh@smilecare.clinic', 'doctor'],
        ['Dr. Sneha Patel', 'sneha.patel@smilecare.clinic', 'doctor'],
        ['Dr. Arjun Nair', 'arjun.nair@smilecare.clinic', 'doctor'],
    ], [2.0, 3.5, 1.5])

    doc.add_paragraph()
    add_heading_styled(doc, 'SmileCare Dental - Staff (Password: Staff@1234)', 3)
    make_table(doc, ['Name', 'Email', 'Role'], [
        ['Kavita Joshi', 'kavita.joshi@smilecare.clinic', 'admin'],
        ['Manish Gupta', 'manish.gupta@smilecare.clinic', 'manager'],
        ['Pooja Verma', 'pooja.verma@smilecare.clinic', 'receptionist'],
        ['Ritu Agarwal', 'ritu.agarwal@smilecare.clinic', 'receptionist'],
        ['Suresh Kulkarni', 'suresh.kulkarni@smilecare.clinic', 'billing_officer'],
        ['Deepak Kumar', 'deepak.kumar@smilecare.clinic', 'support_staff'],
        ['Meena Tiwari', 'meena.tiwari@smilecare.clinic', 'support_staff'],
    ], [2.0, 3.5, 1.5])

    doc.add_paragraph()
    add_heading_styled(doc, 'SmileCare Dental - Patients (Passwords unknown)', 3)
    make_table(doc, ['Name', 'Email', 'Note'], [
        ['Preeti', 'preeti@gmail.com', 'Password set via UI'],
        ['Abcd', 'kakaka@gmail.com', 'Password set via UI'],
    ], [2.0, 3.5, 2.5])

    doc.add_paragraph()
    add_heading_styled(doc, 'Tenant Header', 3)
    make_table(doc, ['Field', 'Value'], [
        ['Header Name', 'X-Tenant-ID'],
        ['Value', 'smilecare-dental'],
        ['Active Clinic', 'SmileCare Dental Clinic (only provisioned clinic)'],
    ], [2.0, 5.0])

    doc.add_page_break()

    # TC column widths for landscape (total ~9.5 inches usable)
    tc_widths = [0.8, 2.0, 2.8, 2.8, 0.9]

    modules = [
        ('1. Authentication & Authorization', [
            ['AUTH-001', 'Login with valid credentials', 'Enter valid email/password, click login', 'User authenticated, JWT returned, redirected to dashboard'],
            ['AUTH-002', 'Login with invalid password', 'Enter valid email, wrong password', 'Error "Invalid credentials", no token issued'],
            ['AUTH-003', 'Login with non-existent email', 'Enter unregistered email, any password', 'Error message, login denied'],
            ['AUTH-004', 'Login with empty fields', 'Leave email/password empty, click login', 'Validation error for required fields'],
            ['AUTH-005', 'Login with invalid email format', 'Enter "notanemail", enter password', 'Validation error for email format'],
            ['AUTH-006', 'JWT token expiry', 'Login, wait for token to expire, make API request', '401 Unauthorized response'],
            ['AUTH-007', 'Access without token', 'Call protected API without Authorization header', '401 Unauthorized response'],
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
            ['AUTH-019', 'Feature guard - subscription', 'Login to Free plan, access Pro feature', '403 feature not available'],
        ]),
        ('2. Patient Management', [
            ['PAT-001', 'Create new patient', 'Fill form (name, DOB, gender, contact), submit', 'Patient created with unique ID'],
            ['PAT-002', 'Create with all fields', 'Fill all fields incl. allergies, insurance', 'Patient created with complete profile'],
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
        ]),
        ('3. Appointments & Scheduling', [
            ['APT-001', 'Book consultation', 'Select patient, doctor, date/time, consultation', 'Appointment created, status "requested"'],
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
        ]),
        ('4. Billing & Invoicing', [
            ['INV-001', 'Create invoice - single item', 'Select patient, add one service, save', 'Invoice with correct total'],
            ['INV-002', 'Create invoice - multiple', 'Add treatment + medicine + lab, save', 'All items, correct subtotal'],
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
        ]),
        ('5. Payments & Gateway', [
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
        ]),
        ('6. Cash Register', [
            ['CR-001', 'Open register', 'Enter opening balance, open', 'Register opened with timestamp'],
            ['CR-002', 'Record transaction', 'Process payment through register', 'Transaction recorded'],
            ['CR-003', 'Close register', 'Enter closing balance, close', 'Closed, variance calculated'],
            ['CR-004', 'Transaction history', 'Select register, view transactions', 'All transactions listed'],
            ['CR-005', 'Reconciliation report', 'Select date, generate report', 'Report with opening/closing'],
            ['CR-006', 'Close with variance', 'Close with different balance', 'Variance flagged'],
        ]),
        ('7. Credit Notes', [
            ['CN-001', 'Create credit note', 'Select patient, enter amount/reason, save', 'Credit note created'],
            ['CN-002', 'Apply to invoice', 'Select invoice, apply credit note', 'Invoice balance reduced'],
            ['CN-003', 'View patient credits', 'Open patient, view credit notes', 'All credit notes listed'],
        ]),
        ('8. Telemedicine', [
            ['TM-001', 'Create video session', 'Select appointment, create session', 'Session created, room token generated'],
            ['TM-002', 'Doctor accepts session', 'Doctor clicks accept', 'Session status: active'],
            ['TM-003', 'Patient joins', 'Patient clicks join link', 'Enters video room'],
            ['TM-004', 'End session', 'Doctor ends session', 'Session ended, duration recorded'],
            ['TM-005', 'Cancel session', 'Cancel before start', 'Session cancelled'],
            ['TM-006', 'Send chat message', 'Type message, send', 'Message delivered in real-time'],
            ['TM-007', 'Share file in session', 'Upload and share file', 'File shared with participant'],
            ['TM-008', 'Recording consent', 'Request recording consent', 'Consent prompt shown'],
        ]),
        ('9. Prescriptions', [
            ['RX-001', 'Create prescription', 'Select patient, add medications, save', 'Prescription created'],
            ['RX-002', 'Issue prescription', 'Create and issue', 'Status: issued'],
            ['RX-003', 'Update prescription', 'Edit medication details, save', 'Updated'],
            ['RX-004', 'Cancel prescription', 'Select, cancel', 'Cancelled'],
            ['RX-005', 'View patient prescriptions', 'Open patient, view prescriptions', 'All listed'],
        ]),
        ('10. Doctor Management', [
            ['DOC-001', 'Create doctor profile', 'Fill details (specialty, dept), save', 'Doctor created'],
            ['DOC-002', 'Update profile', 'Edit specialization, save', 'Profile updated'],
            ['DOC-003', 'Assign to department', 'Select department, save', 'Doctor assigned'],
            ['DOC-004', 'View patient list', 'Open doctor, view patients', 'Linked patients listed'],
            ['DOC-005', 'Dashboard statistics', 'Login as doctor, view dashboard', 'Stats shown'],
            ['DOC-006', 'Performance analytics', 'View doctor analytics', 'Metrics displayed'],
            ['DOC-007', 'Schedule management', 'Set availability, save', 'Schedule updated'],
        ]),
        ('11. Staff Management', [
            ['STF-001', 'Create staff member', 'Fill details, assign role, save', 'Staff created'],
            ['STF-002', 'Assign to department', 'Select department, save', 'Assigned'],
            ['STF-003', 'Update role', 'Change role, save', 'Role updated, permissions changed'],
            ['STF-004', 'Deactivate staff', 'Deactivate member', 'Access revoked'],
            ['STF-005', 'List by role', 'Filter by role', 'Matching staff shown'],
        ]),
        ('12. Clinic, Branches & Departments', [
            ['CLN-001', 'Update clinic info', 'Edit name/address/phone, save', 'Info updated'],
            ['BR-001', 'Create branch', 'Enter branch name/address, save', 'Branch created'],
            ['BR-002', 'Update branch', 'Edit details, save', 'Branch updated'],
            ['BR-003', 'Delete branch (no data)', 'Delete empty branch', 'Branch removed'],
            ['BR-004', 'Delete branch (active data)', 'Delete branch with appointments', 'Error: active data'],
            ['DEP-001', 'Create department', 'Enter name, save', 'Department created'],
            ['DEP-002', 'Assign doctors', 'Add doctors, save', 'Doctors assigned'],
            ['DEP-003', 'Department analytics', 'Open stats', 'Revenue, appointments shown'],
        ]),
        ('13. Insurance Management', [
            ['INS-001', 'Add provider', 'Enter provider details, save', 'Provider added'],
            ['INS-002', 'Create claim', 'Select patient/invoice, enter details', 'Claim created (pending)'],
            ['INS-003', 'Approve claim', 'Update status to approved', 'Status: approved'],
            ['INS-004', 'Reject claim', 'Update with rejection reason', 'Status: rejected'],
            ['INS-005', 'Mark claim paid', 'Record settlement, update', 'Status: paid'],
            ['INS-006', 'Calculate co-pay', 'Enter coverage %, calculate', 'Correct co-pay shown'],
            ['INS-007', 'Pre-authorization', 'Record pre-auth details', 'Pre-auth saved'],
            ['INS-008', 'Insurance analytics', 'View analytics', 'Trends, approval rates shown'],
        ]),
        ('14. Payroll & HR', [
            ['HR-001', 'Create salary structure', 'Enter base salary, allowances, save', 'Structure created'],
            ['HR-002', 'Generate payslip', 'Select staff, month, generate', 'Payslip created'],
            ['HR-003', 'Approve payslip', 'Review, approve', 'Status: approved'],
            ['HR-004', 'Mark payslip paid', 'Record payment, mark paid', 'Status: paid'],
            ['HR-005', 'Payroll analytics', 'Open payroll analytics', 'Breakdown shown'],
            ['HR-006', 'Salary history', 'Select staff, view history', 'All payslips listed'],
        ]),
        ('15. Queue Management', [
            ['QUE-001', 'Add to queue', 'Select checked-in patient, add', 'Queue entry created'],
            ['QUE-002', 'Call patient', 'Click call on next patient', 'Status: called'],
            ['QUE-003', 'Complete entry', 'Mark as done', 'Status: completed'],
            ['QUE-004', 'Cancel entry', 'Remove from queue', 'Status: cancelled'],
            ['QUE-005', 'View current queue', 'Open queue view', 'Ordered list shown'],
            ['QUE-006', 'No-show in queue', 'Mark called patient as no-show', 'No-show recorded'],
        ]),
        ('16. Emergency Management', [
            ['EMR-001', 'Create emergency', 'Enter patient details, create', 'Emergency created'],
            ['EMR-002', 'Accept emergency', 'Doctor accepts', 'Assigned to doctor'],
            ['EMR-003', 'Emergency video chat', 'Initiate video', 'Video session started'],
            ['EMR-004', 'Complete emergency', 'Mark resolved', 'Status updated, records saved'],
            ['EMR-005', 'Real-time alert', 'Create emergency', 'WebSocket alert sent to doctors'],
        ]),
        ('17. Patient Portal', [
            ['PP-001', 'Book appointment', 'Login, select doctor/date, book', 'Appointment requested'],
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
        ]),
        ('18. Integrations', [
            ['INT-001', 'Add credentials', 'Select integration, enter creds, save', 'Stored (encrypted)'],
            ['INT-002', 'Test connection', 'Click test connection', 'Status returned'],
            ['INT-003', 'Manual sync', 'Click sync now', 'Sync initiated'],
            ['INT-004', 'Disable integration', 'Toggle off', 'Disabled'],
            ['INT-005', 'View sync logs', 'Open sync logs', 'Entries with status'],
            ['INT-006', 'Invalid credentials', 'Enter wrong credentials, test', 'Connection failed'],
        ]),
        ('19. Notifications', [
            ['NTF-001', 'Appointment notification', 'Book/confirm appointment', 'Notification created'],
            ['NTF-002', 'Billing notification', 'Create invoice for patient', 'Patient notified'],
            ['NTF-003', 'Unread count', 'Check notification bell', 'Correct count shown'],
            ['NTF-004', 'Mark as read', 'Click notification', 'Marked read, count decremented'],
            ['NTF-005', 'Mark all read', 'Click "mark all read"', 'All marked read'],
            ['NTF-006', 'Push notification', 'Trigger event', 'FCM push received on mobile'],
            ['NTF-007', 'Real-time notification', 'Trigger event', 'WebSocket delivers instantly'],
        ]),
        ('20. Analytics & Dashboard', [
            ['ANL-001', 'Dashboard summary', 'Open dashboard', 'Key metrics displayed'],
            ['ANL-002', 'Revenue trends', 'Open revenue analytics, select range', 'Revenue chart shown'],
            ['ANL-003', 'Appointment trends', 'View appointment analytics', 'Volume charts shown'],
            ['ANL-004', 'Doctor performance', 'View doctor analytics', 'Per-doctor metrics'],
            ['ANL-005', 'No-show analysis', 'View no-show report', 'Rates and patterns'],
            ['ANL-006', 'Insurance analytics', 'View insurance report', 'Claim trends'],
            ['ANL-007', 'Patient growth', 'View patient analytics', 'Growth trends'],
            ['ANL-008', 'Filter by branch', 'Select branch filter', 'Scoped analytics'],
            ['ANL-009', 'Filter by date range', 'Set custom range', 'Filtered data'],
        ]),
        ('21. Consent & Treatment Records', [
            ['CON-001', 'Create consent request', 'Select patient, consent type, create', 'Request created'],
            ['CON-002', 'Patient approves', 'Patient views, approves', 'Approved, timestamp recorded'],
            ['CON-003', 'Patient revokes', 'Revoke previously approved', 'Revoked, audit logged'],
            ['TR-001', 'Create treatment record', 'Select patient, enter details, save', 'Record created'],
            ['TR-002', 'Add consultation notes', 'Enter diagnosis/notes, save', 'Notes saved'],
            ['TR-003', 'Upload attachment', 'Upload X-ray/image, save', 'Attachment linked'],
            ['TR-004', 'Create follow-up', 'Mark for follow-up, set date', 'Follow-up scheduled'],
            ['TR-005', 'View treatment history', 'Open patient, view treatments', 'Listed chronologically'],
        ]),
        ('22. Legacy Upload & Subscriptions', [
            ['LDU-001', 'Upload patient CSV', 'Prepare CSV, upload', 'Data imported, count shown'],
            ['LDU-002', 'Upload with errors', 'Upload CSV with invalid data', 'Errors listed, valid imported'],
            ['LDU-003', 'Large file upload', 'Upload 1000+ records', 'Background processing'],
            ['SUB-001', 'View current plan', 'Open subscription page', 'Plan and features shown'],
            ['SUB-002', 'Upgrade plan', 'Select higher plan, confirm', 'Upgraded, features unlocked'],
            ['SUB-003', 'Downgrade plan', 'Select lower plan, confirm', 'Downgraded, restricted'],
            ['SUB-004', 'Feature access by plan', 'Access feature not in plan', 'Blocked with upgrade prompt'],
        ]),
        ('23. Platform Management', [
            ['PLT-001', 'View all tenants', 'Login as Product Owner, list clinics', 'All tenants listed'],
            ['PLT-002', 'Provision tenant', 'Create new clinic, configure', 'Tenant DB created'],
            ['PLT-003', 'Manage feature flags', 'Toggle flag, save', 'Feature enabled/disabled'],
            ['PLT-004', 'View audit logs', 'Select tenant, view logs', 'Audit trail shown'],
            ['PLT-005', 'Health check', 'Call /health endpoint', 'System status returned'],
        ]),
        ('24. Public Routes', [
            ['PUB-001', 'View clinic listing', 'Access public clinic list (no auth)', 'Clinics listed'],
            ['PUB-002', 'View plans', 'Access public plans page', 'Plans with features'],
            ['PUB-003', 'Browse doctors', 'View public doctor list', 'Names, specialties shown'],
            ['PUB-004', 'Public registration', 'Register through public page', 'Account created'],
        ]),
        ('25. Mobile App', [
            ['MOB-001', 'Login on mobile', 'Enter credentials, login', 'Authenticated, token stored'],
            ['MOB-002', 'Biometric login', 'Enable fingerprint/Face ID, login', 'Authenticated via biometric'],
            ['MOB-003', 'Book appointment', 'Select doctor/date, book', 'Appointment created'],
            ['MOB-004', 'View prescriptions', 'Open prescriptions tab', 'Prescriptions displayed'],
            ['MOB-005', 'Make payment', 'Select invoice, pay via Razorpay', 'Payment processed'],
            ['MOB-006', 'Push notification', 'Trigger event', 'Push received'],
            ['MOB-007', 'Join video call', 'Accept teleconsult, join', 'WebRTC session started'],
            ['MOB-008', 'Offline access', 'Open app offline', 'Cached data shown'],
            ['MOB-009', 'Session expiry', 'Let token expire, use app', 'Redirect to login'],
        ]),
        ('26. Security & Non-Functional', [
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
        ]),
    ]

    total_cases = 0
    for mod_title, cases in modules:
        add_heading_styled(doc, mod_title, 1)
        rows_with_status = [c + [''] for c in cases]
        make_table(doc,
            ['TC#', 'Test Case', 'Steps', 'Expected Result', 'Status'],
            rows_with_status,
            tc_widths,
            font_size=8
        )
        total_cases += len(cases)
        doc.add_paragraph()

    # SUMMARY
    doc.add_page_break()
    add_heading_styled(doc, 'Test Cases Summary', 1)
    summary_rows = [[str(i+1), t, str(len(c))] for i, (t, c) in enumerate(modules)]
    make_table(doc,
        ['#', 'Module', 'Test Cases'],
        summary_rows,
        [0.5, 6.5, 1.5]
    )
    doc.add_paragraph()
    add_para(doc, f'Total Test Cases: {total_cases}', bold=True, size=13)

    return doc


# ============================================================
# MAIN
# ============================================================

if __name__ == '__main__':
    out_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    print('Generating Features document...')
    features_doc = build_features_doc()
    features_path = os.path.join(out_dir, 'BestoClinic_Features.docx')
    features_doc.save(features_path)
    print(f'  Saved: {features_path}')

    print('Generating Test Cases document...')
    test_doc = build_test_cases_doc()
    test_path = os.path.join(out_dir, 'BestoClinic_TestCases.docx')
    test_doc.save(test_path)
    print(f'  Saved: {test_path}')

    print('\nDone! Both Word documents generated successfully.')
