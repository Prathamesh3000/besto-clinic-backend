#!/usr/bin/env python3
"""
BestoClinic — Comprehensive UAT Template Generator
Generates an Excel workbook with role-based sheets covering ALL website + mobile + backend features.
Deadline: Saturday 25 April 2026
"""

import os
from datetime import date
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# ─── Styling ───────────────────────────────────────────────
HEADER_FONT = Font(name='Calibri', bold=True, size=11, color='FFFFFF')
HEADER_FILL = PatternFill(start_color='1F4E79', end_color='1F4E79', fill_type='solid')
SUBHEADER_FILL = PatternFill(start_color='D6E4F0', end_color='D6E4F0', fill_type='solid')
SUBHEADER_FONT = Font(name='Calibri', bold=True, size=11, color='1F4E79')
SECTION_FILL = PatternFill(start_color='FFF2CC', end_color='FFF2CC', fill_type='solid')
SECTION_FONT = Font(name='Calibri', bold=True, size=11, color='7F6000')
BODY_FONT = Font(name='Calibri', size=10)
WRAP = Alignment(wrap_text=True, vertical='top')
CENTER = Alignment(horizontal='center', vertical='top', wrap_text=True)
THIN_BORDER = Border(
    left=Side(style='thin', color='B0B0B0'),
    right=Side(style='thin', color='B0B0B0'),
    top=Side(style='thin', color='B0B0B0'),
    bottom=Side(style='thin', color='B0B0B0'),
)
DEADLINE = 'Apr 25, 2026'

# Priority colors
PRIORITY_COLORS = {
    'P0 - Critical': PatternFill(start_color='FF4444', end_color='FF4444', fill_type='solid'),
    'P1 - High': PatternFill(start_color='FF8C00', end_color='FF8C00', fill_type='solid'),
    'P2 - Medium': PatternFill(start_color='FFD700', end_color='FFD700', fill_type='solid'),
    'P3 - Low': PatternFill(start_color='90EE90', end_color='90EE90', fill_type='solid'),
}

UAT_COLUMNS = [
    ('TC #', 8),
    ('Module / Page', 22),
    ('Platform', 10),
    ('Feature / Test Case', 50),
    ('Steps to Reproduce', 55),
    ('Expected Result', 40),
    ('Priority', 14),
    ('Status', 14),
    ('Tested By', 14),
    ('Test Date', 12),
    ('Bug ID / Notes', 30),
]


def style_header(ws, row=1):
    for col_idx, (title, width) in enumerate(UAT_COLUMNS, 1):
        cell = ws.cell(row=row, column=col_idx, value=title)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = CENTER
        cell.border = THIN_BORDER
        ws.column_dimensions[get_column_letter(col_idx)].width = width
    ws.freeze_panes = f'A{row + 1}'
    ws.auto_filter.ref = f'A{row}:{get_column_letter(len(UAT_COLUMNS))}{row}'


def add_section(ws, row, title):
    for col_idx in range(1, len(UAT_COLUMNS) + 1):
        cell = ws.cell(row=row, column=col_idx)
        cell.fill = SECTION_FILL
        cell.font = SECTION_FONT
        cell.border = THIN_BORDER
    ws.cell(row=row, column=2, value=title)
    return row + 1


def add_row(ws, row, tc_num, module, platform, feature, steps, expected, priority='P2 - Medium'):
    vals = [tc_num, module, platform, feature, steps, expected, priority, 'Not Tested', '', '', '']
    for col_idx, val in enumerate(vals, 1):
        cell = ws.cell(row=row, column=col_idx, value=val)
        cell.font = BODY_FONT
        cell.alignment = WRAP
        cell.border = THIN_BORDER
    return row + 1


def add_rows(ws, start_row, tc_start, rows_data):
    """rows_data: list of (module, platform, feature, steps, expected, priority)"""
    r = start_row
    tc = tc_start
    for item in rows_data:
        module, platform, feature, steps, expected, priority = item
        r = add_row(ws, r, f'TC-{tc:03d}', module, platform, feature, steps, expected, priority)
        tc += 1
    return r, tc


# ═══════════════════════════════════════════════════════════
#  WORKBOOK CREATION
# ═══════════════════════════════════════════════════════════
wb = Workbook()

# ──────────────────────────────────────────────────────────
# SHEET 1: OVERVIEW
# ──────────────────────────────────────────────────────────
ws = wb.active
ws.title = 'Overview'
ws.sheet_properties.tabColor = '1F4E79'

overview_data = [
    ['BestoClinic — User Acceptance Testing (UAT)', '', '', '', ''],
    ['', '', '', '', ''],
    ['Project', 'BestoClinic Multi-Tenant Clinic Management Platform'],
    ['Version', 'April 2026 Release'],
    ['UAT Period', f'April 23 – 25, 2026 (3 days)'],
    ['Deadline', 'Saturday, April 25, 2026'],
    ['Prepared By', 'Claude Code (AI-assisted)'],
    ['Date Prepared', date.today().strftime('%B %d, %Y')],
    ['', ''],
    ['TEST ENVIRONMENT', ''],
    ['Backend URL', 'http://192.168.1.60:5001/api/v1'],
    ['Website URL', 'http://localhost:5173 (Vite dev)'],
    ['Mobile App', 'React Native 0.76.9 (Android emulator / physical device)'],
    ['Database', 'MongoDB (multi-tenant, per-clinic DBs)'],
    ['', ''],
    ['CREDENTIAL SUMMARY', ''],
    ['Clinic', 'Jathar Clinic | Code: JATHR4521'],
    ['', ''],
    ['Role', 'Email', 'Password', 'Notes'],
    ['SuperAdmin / Owner', 'dr.sandeep@jathardental.in', 'Doctor@2025', 'Full access to all features'],
    ['Admin', 'vishal@jathardental.in', 'Staff@2025', 'Clinic admin (no platform)'],
    ['Doctor', 'dr.priya@jathardental.in', 'Doctor@2025', 'Clinical features only'],
    ['Receptionist', 'snehal@jathardental.in', 'Staff@2025', 'Front desk features'],
    ['Guardian 1', 'harshadadaml6@example.com', 'Staff@2025', 'Patient with dependents'],
    ['Guardian 2', 'jyotikulkarn97@example.com', 'Staff@2025', 'Patient with dependents'],
    ['Guardian 3', 'kavitabhosal15@example.com', 'Staff@2025', 'Patient with dependents'],
    ['', ''],
    ['SHEET INDEX', ''],
    ['Sheet Name', 'Scope', 'Test Case Count (approx)'],
    ['Owner / SuperAdmin', 'All tenant management pages + analytics (website)', '~90'],
    ['Doctor', 'Doctor dashboard, consultations, schedule (website + mobile)', '~85'],
    ['Receptionist', 'Front desk, queue, billing (website)', '~45'],
    ['Billing Officer', 'Invoices, payments, insurance (website)', '~35'],
    ['Accountant', 'Financial reports, invoices (website)', '~25'],
    ['HR Manager', 'Staff, payroll (website)', '~20'],
    ['IT Support', 'Integrations, settings (website)', '~15'],
    ['Support Staff', 'Appointments, reminders (website)', '~15'],
    ['Patient (Web)', 'Patient portal website', '~55'],
    ['Patient (Mobile)', 'Patient mobile app screens', '~65'],
    ['Doctor (Mobile)', 'Doctor mobile app screens', '~55'],
    ['Auth & Discovery', 'Login, registration, clinic browsing (web + mobile)', '~40'],
    ['Platform Admin', 'Platform-level tenant/plan management (website)', '~50'],
    ['Push & Real-Time', 'FCM push notifications, socket events, telemedicine', '~40'],
    ['Backend & APIs', 'API contracts, background jobs, middleware', '~50'],
    ['', ''],
    ['STATUS LEGEND', ''],
    ['Not Tested', 'Test not yet executed'],
    ['Pass', 'Feature works as expected'],
    ['Fail', 'Feature broken — log Bug ID'],
    ['Blocked', 'Cannot test (dependency, environment issue)'],
    ['Partial', 'Some sub-steps pass, others fail'],
    ['', ''],
    ['PRIORITY LEGEND', ''],
    ['P0 - Critical', 'Blocker — must fix before release (auth, data loss, crash)'],
    ['P1 - High', 'Major feature broken — core workflow affected'],
    ['P2 - Medium', 'Feature works but has issues — usability, minor bugs'],
    ['P3 - Low', 'Cosmetic, nice-to-have, edge cases'],
]

for row_idx, row_data in enumerate(overview_data, 1):
    for col_idx, val in enumerate(row_data, 1):
        cell = ws.cell(row=row_idx, column=col_idx, value=val)
        cell.font = Font(name='Calibri', size=10)
        cell.alignment = WRAP
# Title styling
ws['A1'].font = Font(name='Calibri', bold=True, size=16, color='1F4E79')
ws.merge_cells('A1:E1')
# Section headers
for r in [10, 16, 28, 45, 51]:
    ws.cell(row=r, column=1).font = Font(name='Calibri', bold=True, size=12, color='1F4E79')
# Column widths
for i, w in enumerate([25, 35, 20, 20, 50], 1):
    ws.column_dimensions[get_column_letter(i)].width = w
# Credential header
for c in range(1, 5):
    ws.cell(row=19, column=c).font = Font(name='Calibri', bold=True, size=10)
    ws.cell(row=19, column=c).fill = SUBHEADER_FILL
# Sheet index header
for c in range(1, 4):
    ws.cell(row=29, column=c).font = Font(name='Calibri', bold=True, size=10)
    ws.cell(row=29, column=c).fill = SUBHEADER_FILL


# ══════════════════════════════════════════════════════════════
# HELPER: Create a UAT sheet
# ══════════════════════════════════════════════════════════════
def create_uat_sheet(name, tab_color, sections):
    """
    sections: list of (section_title, [(module, platform, feature, steps, expected, priority), ...])
    """
    ws = wb.create_sheet(title=name)
    ws.sheet_properties.tabColor = tab_color
    style_header(ws, row=1)
    r = 2
    tc = 1
    for section_title, rows in sections:
        r = add_section(ws, r, section_title)
        r, tc = add_rows(ws, r, tc, rows)
    return ws


# ══════════════════════════════════════════════════════════════
# SHEET: Owner / SuperAdmin
# ══════════════════════════════════════════════════════════════
create_uat_sheet('Owner - SuperAdmin', '2E75B6', [
    ('DASHBOARD', [
        ('Dashboard', 'Web', 'Dashboard loads with stats cards', 'Login as owner → navigate to /clinic', 'Shows totalPatients, todayAppointments, pendingInvoices, revenueThisMonth', 'P0 - Critical'),
        ('Dashboard', 'Web', 'Revenue chart renders', 'View dashboard → check revenue chart section', 'Monthly revenue chart renders with correct data points', 'P1 - High'),
        ('Dashboard', 'Web', 'Today\'s appointments list', 'View dashboard → scroll to appointments section', 'Shows today\'s scheduled appointments with patient names, times, status', 'P1 - High'),
        ('Dashboard', 'Web', 'Doctor leaderboard', 'View dashboard → scroll to leaderboard', 'Shows doctors ranked by appointments/revenue for current period', 'P2 - Medium'),
        ('Dashboard', 'Web', 'Live queue monitor', 'View dashboard → check queue section', 'Shows current patients in queue with status and wait time', 'P1 - High'),
        ('Dashboard', 'Web', 'Alerts / notifications panel', 'View dashboard → check alerts section', 'Shows recent alerts (overdue invoices, low stock, expiring insurance)', 'P2 - Medium'),
    ]),
    ('BRANCH MANAGEMENT', [
        ('Branches', 'Web', 'List all branches', 'Navigate to /clinic/branches', 'Shows all clinic branches with name, address, status', 'P1 - High'),
        ('Branches', 'Web', 'Create new branch', 'Click "Add Branch" → fill form → submit', 'New branch created and appears in list', 'P1 - High'),
        ('Branches', 'Web', 'Edit branch details', 'Click on a branch → edit fields → save', 'Branch details updated successfully', 'P2 - Medium'),
        ('Branches', 'Web', 'Assign staff to branch', 'Edit branch → assign staff members', 'Staff assigned and visible under branch', 'P2 - Medium'),
    ]),
    ('DEPARTMENT MANAGEMENT', [
        ('Departments', 'Web', 'List all departments', 'Navigate to /clinic/departments', 'Shows all departments with name, head, doctor count', 'P1 - High'),
        ('Departments', 'Web', 'Create department', 'Click "Add Department" → fill name, head → submit', 'New department appears in list', 'P1 - High'),
        ('Departments', 'Web', 'Assign doctors to department', 'Edit department → add doctors', 'Doctors appear under department', 'P2 - Medium'),
    ]),
    ('DOCTOR MANAGEMENT', [
        ('Doctors', 'Web', 'List all doctors', 'Navigate to /clinic/doctors', 'Paginated list of all doctors with qualifications, status', 'P1 - High'),
        ('Doctors', 'Web', 'View doctor profile', 'Click on a doctor from list', 'Full profile: specialization, schedule, documents', 'P1 - High'),
        ('Doctors', 'Web', 'Edit doctor details', 'Edit doctor → change fields → save', 'Doctor details updated', 'P2 - Medium'),
        ('Doctors', 'Web', 'Manage doctor availability', 'Navigate to doctor availability page', 'View/edit doctor schedule slots', 'P1 - High'),
    ]),
    ('STAFF MANAGEMENT', [
        ('Staff', 'Web', 'List all staff', 'Navigate to /clinic/staff', 'Shows non-doctor staff with roles, department, status', 'P1 - High'),
        ('Staff', 'Web', 'Create staff member', 'Click "Add Staff" → fill form (name, email, role) → submit', 'New staff created with correct role permissions', 'P1 - High'),
        ('Staff', 'Web', 'Edit staff role/permissions', 'Edit staff → change role → save', 'Role updated and permissions reflect correctly', 'P1 - High'),
        ('Staff', 'Web', 'Deactivate staff', 'Click deactivate on a staff member', 'Staff soft-deleted, cannot login', 'P2 - Medium'),
    ]),
    ('PATIENT MANAGEMENT', [
        ('Patients', 'Web', 'List all patients', 'Navigate to /clinic/patients', 'Paginated list with search, patientId, name, phone', 'P1 - High'),
        ('Patients', 'Web', 'Search patient by name/ID', 'Type in search box', 'Filtered results matching query', 'P1 - High'),
        ('Patients', 'Web', 'View patient profile', 'Click on a patient', 'Full profile: demographics, medical history, contact', 'P1 - High'),
        ('Patients', 'Web', 'Create patient', 'Click "Add Patient" → fill form → submit', 'Patient created with auto-generated patientId', 'P1 - High'),
        ('Patients', 'Web', 'Edit patient details', 'Edit patient → modify fields → save', 'Patient details updated', 'P2 - Medium'),
        ('Patients', 'Web', 'Soft-delete patient', 'Click delete on patient → confirm', 'Patient soft-deleted (deletedAt set), disappears from list', 'P2 - Medium'),
        ('Patients', 'Web', 'Bulk import patients (CSV)', 'Click bulk upload → upload CSV → submit', 'All valid rows created, errors reported for invalid rows', 'P2 - Medium'),
    ]),
    ('APPOINTMENTS (ADMIN VIEW)', [
        ('Appointments', 'Web', 'List appointments with filters', 'Navigate to /clinic/appointments → use filters', 'Appointments filtered by doctor, branch, status, date range', 'P0 - Critical'),
        ('Appointments', 'Web', 'Calendar view — Week', 'Switch to Calendar view → Week mode', 'Week calendar renders with time slots and events', 'P0 - Critical'),
        ('Appointments', 'Web', 'Calendar view — Month', 'Switch to Calendar view → Month mode', 'Month grid renders with appointment dots/counts', 'P1 - High'),
        ('Appointments', 'Web', 'Calendar view — Day', 'Switch to Calendar view → Day mode', 'Single day timeline with all appointments', 'P1 - High'),
        ('Appointments', 'Web', 'Calendar view — Agenda', 'Switch to Calendar view → Agenda mode', 'Agenda list view with date range', 'P1 - High'),
        ('Appointments', 'Web', 'List view with pagination', 'Switch to List view → paginate', 'Paginated table with appointment details', 'P1 - High'),
        ('Appointments', 'Web', 'Timeline view', 'Switch to Timeline view', 'Horizontal timeline of appointments grouped by doctor', 'P2 - Medium'),
        ('Appointments', 'Web', 'Board view (Kanban)', 'Switch to Board view', 'Columns by status (requested, confirmed, checked_in, etc.)', 'P2 - Medium'),
        ('Appointments', 'Web', 'Tile view (cards)', 'Switch to Tile view', 'Card-based layout with appointment summaries', 'P2 - Medium'),
        ('Appointments', 'Web', 'Create appointment', 'Click "New Appointment" → fill patient, doctor, date, time → submit', 'Appointment created with status=requested', 'P0 - Critical'),
        ('Appointments', 'Web', 'Update appointment status', 'Click appointment → change status (confirm, check-in, etc.)', 'Status transitions follow: requested→confirmed→checked_in→in_progress→completed', 'P0 - Critical'),
        ('Appointments', 'Web', 'Cancel appointment', 'Click cancel on appointment → provide reason', 'Appointment marked cancelled, cancel reason saved', 'P1 - High'),
        ('Appointments', 'Web', 'Click on calendar slot to create', 'Click empty slot on calendar', 'Opens create form pre-filled with selected date/time', 'P2 - Medium'),
    ]),
    ('QUEUE MANAGEMENT', [
        ('Queue', 'Web', 'View live queue', 'Navigate to /clinic/queue', 'Shows current patient queue with positions, status, wait times', 'P1 - High'),
        ('Queue', 'Web', 'Call next patient', 'Click "Call Next" button', 'Next patient called, status updated', 'P1 - High'),
        ('Queue', 'Web', 'Assign room', 'Select a queue entry → assign room', 'Room assignment saved and visible', 'P2 - Medium'),
    ]),
    ('PRESCRIPTIONS', [
        ('Prescriptions', 'Web', 'List all prescriptions', 'Navigate to /clinic/prescriptions', 'All prescriptions with patient, doctor, date, status', 'P1 - High'),
        ('Prescriptions', 'Web', 'View prescription details', 'Click on a prescription', 'Full details: medicines, dosage, frequency, notes', 'P1 - High'),
    ]),
    ('BILLING (ADMIN)', [
        ('Billing', 'Web', 'View invoice list', 'Navigate to /clinic/billing', 'All invoices with status, amounts, dates', 'P0 - Critical'),
        ('Billing', 'Web', 'Create invoice', 'Click "Create Invoice" → add line items → submit', 'Invoice created with correct totals, tax calculations', 'P0 - Critical'),
        ('Billing', 'Web', 'Record payment against invoice', 'Open invoice → click "Record Payment" → enter amount', 'Payment recorded, invoice status updated (paid/partially_paid)', 'P0 - Critical'),
        ('Billing', 'Web', 'Write-off invoice', 'Open overdue invoice → click write-off', 'Invoice marked as written off', 'P2 - Medium'),
    ]),
    ('INSURANCE MANAGEMENT', [
        ('Insurance', 'Web', 'List insurance providers', 'Navigate to /clinic/insurance', 'All insurance companies with plans, contact info', 'P1 - High'),
        ('Insurance', 'Web', 'Create insurance claim', 'Click "New Claim" → fill form → submit', 'Claim created with correct patient/provider link', 'P1 - High'),
        ('Insurance', 'Web', 'Track claim status', 'View claim → check status updates', 'Status reflects: submitted→under_review→approved/rejected', 'P1 - High'),
    ]),
    ('INVENTORY', [
        ('Inventory', 'Web', 'List inventory items', 'Navigate to /clinic/inventory', 'All items with stock levels, expiry dates, reorder points', 'P1 - High'),
        ('Inventory', 'Web', 'Low stock alerts', 'Check items below reorder point', 'Low stock items highlighted with alert indicator', 'P1 - High'),
        ('Inventory', 'Web', 'Restock item', 'Select item → restock → enter quantity', 'Stock level updated, transaction logged', 'P2 - Medium'),
        ('Inventory', 'Web', 'Expiry tracking', 'View expiring items section', 'Items expiring within threshold highlighted', 'P2 - Medium'),
    ]),
    ('PROCEDURES', [
        ('Procedures', 'Web', 'List procedure templates', 'Navigate to /clinic/procedures', 'All procedures with name, cost, duration, required materials', 'P1 - High'),
        ('Procedures', 'Web', 'Create procedure template', 'Click "Add Procedure" → fill form → submit', 'Procedure template created', 'P2 - Medium'),
        ('Procedures', 'Web', 'Check inventory availability for procedure', 'Select procedure → check availability', 'Shows if all required materials are in stock', 'P2 - Medium'),
    ]),
    ('ANALYTICS & REPORTS', [
        ('Analytics', 'Web', 'Analytics dashboard loads', 'Navigate to /clinic/analytics', 'Dashboard shows KPIs, revenue trends, appointment charts', 'P1 - High'),
        ('Analytics', 'Web', 'Revenue analytics', 'Navigate to /clinic/revenue', 'Revenue by branch, by doctor, monthly trend, outstanding aging', 'P1 - High'),
        ('Analytics', 'Web', 'Revenue by branch chart', 'View revenue analytics → branch breakdown', 'Bar chart with branch revenue data', 'P2 - Medium'),
        ('Analytics', 'Web', 'Doctor performance metrics', 'View analytics → doctor tab', 'Table with doctorName, totalAppointments, noShowCount, revenue', 'P2 - Medium'),
        ('Analytics', 'Web', 'Outstanding aging analysis', 'View billing analytics → outstanding tab', 'Aging buckets: 0-30, 31-60, 61-90, 90+ days', 'P2 - Medium'),
        ('Reports', 'Web', 'Generate custom report', 'Navigate to /clinic/reports → configure → generate', 'Report generated with selected filters and exported', 'P2 - Medium'),
        ('Compliance', 'Web', 'Compliance dashboard', 'Navigate to /clinic/compliance', 'Care compliance rates, consent tracking, audit trail', 'P2 - Medium'),
    ]),
    ('TELEMEDICINE (ADMIN VIEW)', [
        ('Telemedicine', 'Web', 'List telemedicine sessions', 'Navigate to /clinic/telemedicine', 'All sessions with status, participants, timestamps', 'P1 - High'),
        ('Telemedicine', 'Web', 'View session details', 'Click on a session', 'Full session: video status, chat messages, files shared', 'P2 - Medium'),
    ]),
    ('SETTINGS & CONFIGURATION', [
        ('Settings', 'Web', 'Clinic settings page loads', 'Navigate to /clinic/settings', 'Shows clinic name, logo, address, working hours', 'P1 - High'),
        ('Settings', 'Web', 'Update clinic name/logo', 'Edit clinic name → save', 'Clinic name updated across all pages', 'P2 - Medium'),
        ('Settings', 'Web', 'Manage working hours', 'Edit working hours → save', 'Working hours reflected in availability', 'P2 - Medium'),
        ('Notifications', 'Web', 'Notification settings', 'Navigate to /clinic/notifications', 'Notification templates, delivery logs', 'P2 - Medium'),
        ('Integrations', 'Web', 'View active integrations', 'Navigate to /clinic/integrations', 'Shows integration status (SMS, email, payment gateways)', 'P2 - Medium'),
        ('QR Code', 'Web', 'Generate QR code', 'Navigate to /clinic/qr-code → generate', 'QR code generated for patient check-in', 'P3 - Low'),
        ('Branch Monitor', 'Web', 'Real-time branch metrics', 'Navigate to /clinic/branch-monitor', 'Shows capacity, presence, room availability per branch', 'P2 - Medium'),
    ]),
    ('PAYROLL', [
        ('Payroll', 'Web', 'View payroll overview', 'Navigate to /clinic/payroll', 'Staff salary list, cycle status', 'P2 - Medium'),
    ]),
    ('CONSULTATIONS', [
        ('Consultations', 'Web', 'List all consultations', 'Navigate to /clinic/consultations', 'All treatment records with patient, doctor, date, status', 'P1 - High'),
    ]),
])


# ══════════════════════════════════════════════════════════════
# SHEET: Doctor (Website)
# ══════════════════════════════════════════════════════════════
create_uat_sheet('Doctor (Web)', '2E8B57', [
    ('DOCTOR DASHBOARD', [
        ('Dashboard', 'Web', 'Dashboard loads with greeting + stats', 'Login as doctor → navigate to /clinic/doctor-dashboard', 'Shows greeting, stats (appointments, revenue, patients), current room badge', 'P0 - Critical'),
        ('Dashboard', 'Web', 'Today\'s schedule timeline', 'View dashboard → check schedule section', 'Shows today\'s appointments in timeline format', 'P1 - High'),
        ('Dashboard', 'Web', 'Live queue display', 'View dashboard → check queue section', 'Shows patients waiting for this doctor', 'P1 - High'),
        ('Dashboard', 'Web', 'Compliance metrics', 'View dashboard → compliance section', 'Shows care compliance rates, pending reminders', 'P2 - Medium'),
        ('Dashboard', 'Web', 'Week total appointments stat', 'Check stats cards on dashboard', 'weekTotal field shows appointments for current week', 'P2 - Medium'),
    ]),
    ('MY APPOINTMENTS', [
        ('Appointments', 'Web', 'List doctor\'s appointments', 'Navigate to /clinic/doctor-appointments', 'Shows only this doctor\'s appointments (filtered by userId)', 'P0 - Critical'),
        ('Appointments', 'Web', 'Calendar view — Week', 'Switch to Calendar → Week mode', 'Week calendar with doctor\'s appointments', 'P0 - Critical'),
        ('Appointments', 'Web', 'Calendar view — Month', 'Switch to Calendar → Month mode', 'Month view with appointment indicators', 'P1 - High'),
        ('Appointments', 'Web', 'Calendar view — Day', 'Switch to Calendar → Day mode', 'Single day view with time slots', 'P1 - High'),
        ('Appointments', 'Web', 'Filter by status', 'Use status filter dropdown', 'Appointments filtered correctly', 'P1 - High'),
        ('Appointments', 'Web', 'Confirm appointment', 'Find requested appointment → click confirm', 'Status changes to confirmed', 'P0 - Critical'),
        ('Appointments', 'Web', 'Start consultation from appointment', 'Click "Start Consultation" on checked-in appointment', 'Opens consultation room, appointment status→in_progress', 'P0 - Critical'),
    ]),
    ('CONSULTATION ROOM', [
        ('Consultation', 'Web', 'Consultation room loads', 'Click "Start Consultation" on an appointment', 'Full consultation interface: patient info, notes area, vital signs', 'P0 - Critical'),
        ('Consultation', 'Web', 'Add clinical notes', 'Type in chief complaint + examination notes → save', 'Notes saved to treatment record', 'P0 - Critical'),
        ('Consultation', 'Web', 'Record vital signs', 'Enter BP, heart rate, temperature, etc.', 'Vital signs recorded on treatment record', 'P1 - High'),
        ('Consultation', 'Web', 'Create prescription during consultation', 'Click "Add Prescription" → select medicines, dosage → save', 'Prescription created and linked to consultation', 'P0 - Critical'),
        ('Consultation', 'Web', 'Upload document/attachment', 'Click "Upload" → select file', 'File uploaded and attached to treatment record', 'P1 - High'),
        ('Consultation', 'Web', 'Complete consultation', 'Click "Complete" → confirm', 'TreatmentRecord marked complete, appointment status→completed', 'P0 - Critical'),
        ('Consultation', 'Web', 'Schedule follow-up from consultation', 'Click "Schedule Follow-up" → pick date/time', 'Follow-up appointment created with type=follow_up', 'P1 - High'),
        ('Consultation', 'Web', 'Send care reminder from consultation', 'Set up care reminder for patient', 'Care reminder created and scheduled', 'P2 - Medium'),
    ]),
    ('MY PATIENTS', [
        ('Patients', 'Web', 'List doctor\'s patients', 'Navigate to /clinic/doctor-patients', 'Shows patients this doctor has treated', 'P1 - High'),
        ('Patients', 'Web', 'View patient records', 'Navigate to /clinic/doctor-patient-records', 'Full medical records, treatment history, diagnostics', 'P1 - High'),
    ]),
    ('MY SCHEDULE', [
        ('Schedule', 'Web', 'View own schedule', 'Navigate to /clinic/doctor-schedule', 'Shows availability calendar with slots', 'P1 - High'),
        ('Schedule', 'Web', 'Set availability slots', 'Edit schedule → define working hours', 'Slots saved and reflected in booking system', 'P1 - High'),
        ('Schedule', 'Web', 'Block time slots', 'Select time range → block', 'Blocked slots not available for booking', 'P2 - Medium'),
    ]),
    ('VIRTUAL CARE / TELEMEDICINE', [
        ('Virtual Care', 'Web', 'List scheduled teleconsults', 'Navigate to /clinic/doctor-virtual-care', 'Shows upcoming video call sessions', 'P1 - High'),
        ('Telemedicine', 'Web', 'Join video call', 'Click "Join" on a session', 'Video call interface opens with WebRTC stream', 'P0 - Critical'),
        ('Telemedicine', 'Web', 'In-call chat messaging', 'During video call → send chat message', 'Message delivered to patient in real-time', 'P1 - High'),
    ]),
    ('EMERGENCY', [
        ('Emergency', 'Web', 'View emergency queue', 'Navigate to /clinic/doctor-emergency', 'Shows pending emergency requests with patient info, triage', 'P0 - Critical'),
        ('Emergency', 'Web', 'Accept emergency request', 'Click "Accept" on emergency request', 'Session accepted, video session auto-created', 'P0 - Critical'),
        ('Emergency', 'Web', 'Decline emergency request', 'Click "Decline" on emergency request', 'Request remains for other doctors, does not change session status', 'P1 - High'),
    ]),
    ('NOTIFICATIONS', [
        ('Notifications', 'Web', 'View notifications inbox', 'Navigate to /clinic/doctor-notifications', 'Shows all doctor notifications (appointments, reminders, messages)', 'P1 - High'),
        ('Notifications', 'Web', 'Mark notification as read', 'Click on notification → mark read', 'Notification marked read, unread count decreases', 'P2 - Medium'),
    ]),
])


# ══════════════════════════════════════════════════════════════
# SHEET: Receptionist
# ══════════════════════════════════════════════════════════════
create_uat_sheet('Receptionist', 'FF8C00', [
    ('RECEPTIONIST DASHBOARD', [
        ('Dashboard', 'Web', 'Dashboard loads', 'Login as receptionist → /clinic/receptionist-dashboard', 'Shows greeting, stats (appointments, waiting, revenue), emergency badges', 'P0 - Critical'),
        ('Dashboard', 'Web', 'Emergency alert badges', 'Check for emergency requests', 'Active emergency count visible with badge', 'P1 - High'),
        ('Dashboard', 'Web', 'Doctor presence board', 'View presence section', 'Shows which doctors are online/offline/in-consultation', 'P1 - High'),
        ('Dashboard', 'Web', 'Quick actions panel', 'Check quick action buttons', 'Shortcuts to book appointment, check-in patient, create invoice', 'P2 - Medium'),
        ('Dashboard', 'Web', 'Daily timeline', 'View timeline section', 'Chronological list of today\'s events', 'P2 - Medium'),
    ]),
    ('APPOINTMENTS', [
        ('Appointments', 'Web', 'List appointments', 'Navigate to /clinic/receptionist-appointments', 'Today\'s and upcoming appointments with patient/doctor info', 'P0 - Critical'),
        ('Appointments', 'Web', 'Book new appointment', 'Click "Book" → select patient, doctor, time → submit', 'Appointment created successfully', 'P0 - Critical'),
        ('Appointments', 'Web', 'Reschedule appointment', 'Click appointment → reschedule → pick new time', 'Appointment rescheduled, old slot freed', 'P1 - High'),
        ('Appointments', 'Web', 'Cancel appointment', 'Click cancel → provide reason', 'Appointment cancelled with reason', 'P1 - High'),
        ('Appointments', 'Web', 'Check-in patient', 'Find confirmed appointment → click check-in', 'Status: confirmed→checked_in, patient added to queue', 'P0 - Critical'),
    ]),
    ('PATIENT MANAGEMENT', [
        ('Patients', 'Web', 'Search patient', 'Navigate to /clinic/receptionist-patients → search', 'Find patient by name, ID, or phone', 'P0 - Critical'),
        ('Patients', 'Web', 'Register walk-in patient', 'Click "Add Patient" → fill quick form', 'New patient registered with patientId', 'P1 - High'),
        ('Patients', 'Web', 'Verify insurance', 'View patient → check insurance section', 'Insurance provider and plan visible', 'P2 - Medium'),
    ]),
    ('QUEUE MANAGEMENT', [
        ('Queue', 'Web', 'View live queue', 'Navigate to /clinic/receptionist-queue', 'Current queue with positions, wait times, room assignments', 'P0 - Critical'),
        ('Queue', 'Web', 'Call next patient', 'Click "Call Next"', 'Next patient called, display updated', 'P1 - High'),
        ('Queue', 'Web', 'Assign consultation room', 'Select queue entry → assign room', 'Room assigned to patient', 'P2 - Medium'),
        ('Queue', 'Web', 'Mark queue entry complete', 'Click complete on a served patient', 'Entry removed from active queue', 'P2 - Medium'),
    ]),
    ('BILLING AT CHECKOUT', [
        ('Billing', 'Web', 'Generate invoice at checkout', 'Navigate to /clinic/receptionist-billing → select patient', 'Invoice created with consultation charges', 'P0 - Critical'),
        ('Billing', 'Web', 'Process payment', 'Select payment method → enter amount → submit', 'Payment recorded, receipt available', 'P0 - Critical'),
        ('Billing', 'Web', 'Print receipt', 'Click "Print Receipt"', 'Receipt generated for download/print', 'P2 - Medium'),
    ]),
    ('NOTIFICATIONS', [
        ('Notifications', 'Web', 'View notifications', 'Navigate to /clinic/receptionist-notifications', 'Shows new bookings, cancellations, emergency alerts', 'P1 - High'),
    ]),
])


# ══════════════════════════════════════════════════════════════
# SHEET: Billing Officer
# ══════════════════════════════════════════════════════════════
create_uat_sheet('Billing Officer', 'B22222', [
    ('BILLING OFFICER DASHBOARD', [
        ('Dashboard', 'Web', 'Dashboard loads with stats', 'Login as billing officer → /clinic/billing-officer-dashboard', 'Shows greeting, totalInvoiced, totalCollected, totalOutstanding stats', 'P0 - Critical'),
        ('Dashboard', 'Web', 'Payment collection trends chart', 'View dashboard → trend chart', 'Monthly payment collection trend renders', 'P1 - High'),
        ('Dashboard', 'Web', 'Aging analysis chart', 'View dashboard → aging chart', 'Shows 0-30, 31-60, 61-90, 90+ aging buckets', 'P1 - High'),
    ]),
    ('INVOICES', [
        ('Invoices', 'Web', 'List all invoices', 'Navigate to /clinic/billing-officer-invoices', 'Paginated invoice list with status, amounts, dates', 'P0 - Critical'),
        ('Invoices', 'Web', 'Create invoice', 'Click "Create Invoice" → add patient, line items → submit', 'Invoice created with correct calculations', 'P0 - Critical'),
        ('Invoices', 'Web', 'Send invoice to patient', 'Click "Send" on invoice', 'Invoice sent (email/notification)', 'P1 - High'),
        ('Invoices', 'Web', 'Filter invoices by status', 'Use status filter (draft, sent, paid, overdue)', 'Invoices filtered correctly', 'P1 - High'),
        ('Invoices', 'Web', 'View invoice PDF', 'Click "Download PDF"', 'PDF generated with correct invoice layout', 'P2 - Medium'),
    ]),
    ('PAYMENTS', [
        ('Payments', 'Web', 'List payments', 'Navigate to /clinic/billing-officer-payments', 'All payments with invoice reference, amount, method, date', 'P0 - Critical'),
        ('Payments', 'Web', 'Record manual payment', 'Click "Record Payment" → select invoice, enter amount → submit', 'Payment recorded, invoice status updated', 'P0 - Critical'),
        ('Payments', 'Web', 'Process refund', 'Select payment → click "Refund" → enter amount → confirm', 'Refund processed, payment marked refunded', 'P1 - High'),
        ('Payments', 'Web', 'Reconciliation', 'Compare recorded vs. bank payments', 'Discrepancies highlighted', 'P2 - Medium'),
    ]),
    ('INSURANCE CLAIMS', [
        ('Insurance', 'Web', 'List insurance claims', 'Navigate to /clinic/billing-officer-insurance', 'All claims with provider, patient, status, amounts', 'P1 - High'),
        ('Insurance', 'Web', 'Submit new claim', 'Click "New Claim" → fill details → submit', 'Claim submitted with documentation', 'P1 - High'),
        ('Insurance', 'Web', 'Track claim adjudication', 'View claim status changes', 'Status progression visible: submitted→under_review→approved/rejected', 'P1 - High'),
        ('Insurance', 'Web', 'Upload supporting documents', 'Attach documents to a claim', 'Documents uploaded and linked to claim', 'P2 - Medium'),
    ]),
    ('NOTIFICATIONS', [
        ('Notifications', 'Web', 'Billing notifications', 'Navigate to /clinic/billing-officer-notifications', 'Payment alerts, overdue reminders, claim status updates', 'P2 - Medium'),
    ]),
])


# ══════════════════════════════════════════════════════════════
# SHEET: Accountant
# ══════════════════════════════════════════════════════════════
create_uat_sheet('Accountant', '8B4513', [
    ('ACCOUNTANT DASHBOARD', [
        ('Dashboard', 'Web', 'Dashboard loads', 'Login as accountant → /clinic/accountant-dashboard', 'Shows revenue, expenses, balance, monthly trends, P&L summary', 'P0 - Critical'),
    ]),
    ('INVOICES (READ-ONLY)', [
        ('Invoices', 'Web', 'View invoice list for audit', 'Navigate to /clinic/accountant-invoices', 'All invoices with GL coding, reconciliation status', 'P1 - High'),
        ('Invoices', 'Web', 'Export invoices', 'Click "Export" → select format (CSV/PDF)', 'Data exported for accounting software', 'P1 - High'),
    ]),
    ('FINANCIAL REPORTS', [
        ('Reports', 'Web', 'Revenue report', 'Navigate to /clinic/accountant-reports → Revenue tab', 'Revenue breakdown by branch, doctor, period', 'P0 - Critical'),
        ('Reports', 'Web', 'P&L statement', 'Select P&L report', 'Profit & Loss with income, expenses, net income', 'P1 - High'),
        ('Reports', 'Web', 'Cash flow report', 'Select Cash Flow report', 'Cash inflows/outflows summary', 'P2 - Medium'),
        ('Reports', 'Web', 'Tax report', 'Select Tax report', 'Tax liability summary for compliance', 'P2 - Medium'),
        ('Reports', 'Web', 'Audit trail', 'View financial audit trail', 'All financial transactions with timestamps, users', 'P2 - Medium'),
    ]),
    ('NOTIFICATIONS', [
        ('Notifications', 'Web', 'Accounting notifications', 'Navigate to /clinic/accountant-notifications', 'Month-end alerts, reconciliation reminders', 'P2 - Medium'),
    ]),
])


# ══════════════════════════════════════════════════════════════
# SHEET: HR Manager
# ══════════════════════════════════════════════════════════════
create_uat_sheet('HR Manager', '9370DB', [
    ('HR DASHBOARD', [
        ('Dashboard', 'Web', 'Dashboard loads', 'Login as HR → /clinic/hr-dashboard', 'Staff count, payroll cycle status, attendance, upcoming reviews', 'P0 - Critical'),
    ]),
    ('STAFF DIRECTORY', [
        ('Staff', 'Web', 'View staff directory', 'Navigate to /clinic/hr-staff', 'All staff with profiles, documents, department, leave balance', 'P1 - High'),
        ('Staff', 'Web', 'View staff documents', 'Click on staff → Documents tab', 'ID proofs, certificates, etc. visible', 'P2 - Medium'),
    ]),
    ('PAYROLL', [
        ('Payroll', 'Web', 'View salary structures', 'Navigate to /clinic/hr-payroll → Structures tab', 'All salary structures with components', 'P1 - High'),
        ('Payroll', 'Web', 'Generate payslips', 'Click "Generate Payslips" → select period → confirm', 'Payslips generated for all staff', 'P0 - Critical'),
        ('Payroll', 'Web', 'Approve payslip', 'Click "Approve" on a payslip', 'Payslip status: generated→approved', 'P1 - High'),
        ('Payroll', 'Web', 'Mark payslip as paid', 'Click "Mark Paid" on approved payslip', 'Payslip marked paid with date', 'P1 - High'),
    ]),
    ('NOTIFICATIONS', [
        ('Notifications', 'Web', 'HR notifications', 'Navigate to /clinic/hr-notifications', 'Payroll cycle alerts, document expiry, attendance issues', 'P2 - Medium'),
    ]),
])


# ══════════════════════════════════════════════════════════════
# SHEET: IT Support
# ══════════════════════════════════════════════════════════════
create_uat_sheet('IT Support', '708090', [
    ('IT DASHBOARD', [
        ('Dashboard', 'Web', 'Dashboard loads', 'Login as IT → /clinic/it-dashboard', 'System status, uptime, error logs, user activity', 'P1 - High'),
    ]),
    ('IT SETTINGS', [
        ('Settings', 'Web', 'View system config', 'Navigate to /clinic/it-settings', 'Email templates, API keys, backup schedules', 'P1 - High'),
    ]),
    ('INTEGRATIONS', [
        ('Integrations', 'Web', 'View integrations', 'Navigate to /clinic/it-integrations', 'SMS, email, payment processor, LIS/PACS configs', 'P1 - High'),
        ('Integrations', 'Web', 'Test integration connectivity', 'Click "Test Connection" on an integration', 'Test result shows success/failure', 'P2 - Medium'),
    ]),
    ('NOTIFICATIONS', [
        ('Notifications', 'Web', 'IT notifications', 'Navigate to /clinic/it-notifications', 'System alerts, error notifications, integration failures', 'P2 - Medium'),
    ]),
])


# ══════════════════════════════════════════════════════════════
# SHEET: Support Staff
# ══════════════════════════════════════════════════════════════
create_uat_sheet('Support Staff', '20B2AA', [
    ('SUPPORT DASHBOARD', [
        ('Dashboard', 'Web', 'Dashboard loads', 'Login as support → /clinic/support-dashboard', 'Stats, care reminders, patient follow-ups, activity log', 'P0 - Critical'),
    ]),
    ('APPOINTMENTS', [
        ('Appointments', 'Web', 'View appointments', 'Navigate to /clinic/support-appointments', 'Appointment list with reminder tracking, attendance confirmations', 'P1 - High'),
    ]),
    ('NOTIFICATIONS', [
        ('Notifications', 'Web', 'Support notifications', 'Navigate to /clinic/support-notifications', 'Reminders, urgent alerts, follow-up notifications', 'P2 - Medium'),
    ]),
])


# ══════════════════════════════════════════════════════════════
# SHEET: Patient (Website)
# ══════════════════════════════════════════════════════════════
create_uat_sheet('Patient (Web)', '4169E1', [
    ('PATIENT LOGIN & AUTH', [
        ('Login', 'Web', 'Patient login page loads', 'Navigate to /patient/login', 'Login form with email, password, clinic code entry', 'P0 - Critical'),
        ('Login', 'Web', 'Login with valid credentials', 'Enter patient email + password → submit', 'Successfully logged in, redirected to dashboard', 'P0 - Critical'),
        ('Login', 'Web', 'Login with wrong password', 'Enter wrong password → submit', 'Error message shown, no login', 'P0 - Critical'),
        ('Login', 'Web', 'Patient logout redirects correctly', 'Click logout', 'Redirected to /patient/login (NOT /clinic/login)', 'P0 - Critical'),
    ]),
    ('PATIENT DASHBOARD', [
        ('Dashboard', 'Web', 'Dashboard loads', 'Login as patient → /patient', 'Greeting, upcoming appointments, care reminders, quick booking CTA', 'P0 - Critical'),
        ('Dashboard', 'Web', 'Upcoming appointment card', 'View dashboard → appointment section', 'Shows next appointment with doctor, time, join button for teleconsult', 'P1 - High'),
        ('Dashboard', 'Web', 'Care reminder alerts', 'View dashboard → care section', 'Active care reminders shown with due times', 'P1 - High'),
    ]),
    ('APPOINTMENTS', [
        ('Appointments', 'Web', 'List own appointments', 'Navigate to /patient/appointments', 'Shows all patient appointments (upcoming + past)', 'P0 - Critical'),
        ('Appointments', 'Web', 'Book new appointment', 'Click "Book Appointment" → select department, doctor, time → confirm', 'Appointment booked with status=requested', 'P0 - Critical'),
        ('Appointments', 'Web', 'View appointment details', 'Click on an appointment', 'Full details: doctor, time, status, notes, join telemedicine button', 'P1 - High'),
        ('Appointments', 'Web', 'Cancel appointment', 'Click "Cancel" on an appointment', 'Appointment cancelled', 'P1 - High'),
        ('Appointments', 'Web', 'Reschedule appointment', 'Click "Reschedule" → pick new time → confirm', 'Appointment rescheduled to new time', 'P1 - High'),
        ('Appointments', 'Web', 'Confirm attendance (from reminder)', 'Click "Confirm" on attendance prompt', 'Attendance confirmed, notification to clinic', 'P1 - High'),
        ('Appointments', 'Web', 'Check-in via portal', 'Click "Check In" on confirmed appointment', 'Status: confirmed→checked_in', 'P2 - Medium'),
    ]),
    ('HEALTH / PRESCRIPTIONS', [
        ('Health', 'Web', 'View prescriptions list', 'Navigate to /patient/health → Prescriptions tab', 'All prescriptions with doctor, date, status', 'P1 - High'),
        ('Health', 'Web', 'View medical records', 'Navigate to /patient/health → Records tab', 'Treatment records, diagnoses, test results', 'P1 - High'),
    ]),
    ('BILLING & PAYMENTS', [
        ('Payments', 'Web', 'View invoices', 'Navigate to /patient/payments', 'Outstanding and paid invoices with amounts, dates', 'P0 - Critical'),
        ('Payments', 'Web', 'Make online payment', 'Click "Pay" on an invoice → complete payment', 'Payment processed via Razorpay, invoice updated', 'P0 - Critical'),
        ('Payments', 'Web', 'Download invoice PDF', 'Click "Download PDF"', 'PDF invoice downloaded', 'P2 - Medium'),
        ('Payments', 'Web', 'View payment history', 'Check transaction history section', 'All past payments with receipts', 'P2 - Medium'),
    ]),
    ('PROFILE & SETTINGS', [
        ('Profile', 'Web', 'View own profile', 'Navigate to /patient/profile', 'Name, email, phone, emergency contact', 'P1 - High'),
        ('Profile', 'Web', 'Edit profile', 'Click "Edit" → change details → save', 'Profile updated', 'P1 - High'),
    ]),
    ('EMERGENCY', [
        ('Emergency', 'Web', 'Send emergency request', 'Navigate to /patient/emergency → click "Send Emergency"', 'Emergency session created, doctors notified', 'P0 - Critical'),
    ]),
    ('VIDEO CONSULTATION', [
        ('Video', 'Web', 'Join telemedicine call', 'Click "Join" on a teleconsult appointment', 'Video call interface with WebRTC stream', 'P0 - Critical'),
        ('Video', 'Web', 'In-call chat', 'During video → send message', 'Message delivered to doctor', 'P1 - High'),
    ]),
    ('SHARE RECORDS', [
        ('Share', 'Web', 'Generate share link', 'Navigate to /patient/share-records → create share', 'Share token generated with expiry date', 'P1 - High'),
        ('Share', 'Web', 'Access shared record (public URL)', 'Open /shared/:token in incognito', 'Medical record visible without login', 'P1 - High'),
        ('Share', 'Web', 'Revoke share token', 'Click "Revoke" on a share token', 'Token invalidated, link no longer works', 'P2 - Medium'),
    ]),
    ('CONSENTS', [
        ('Consents', 'Web', 'View consent forms', 'Navigate to /patient/consents', 'Treatment and data-sharing consent forms', 'P1 - High'),
        ('Consents', 'Web', 'Approve consent', 'Click "Approve" on a consent form', 'Consent approved with timestamp', 'P1 - High'),
        ('Consents', 'Web', 'Revoke consent', 'Click "Revoke" on an approved consent', 'Consent revoked', 'P2 - Medium'),
    ]),
    ('ACTIVITY LOG', [
        ('Activity', 'Web', 'View access log', 'Navigate to /patient/activity-log', 'Shows who accessed records, when, for what purpose', 'P1 - High'),
        ('Activity', 'Web', 'Staff access appears in log', 'After a doctor views patient profile → check activity log', 'Doctor\'s access logged with timestamp, accessType=view', 'P1 - High'),
    ]),
    ('DEPENDENTS (GUARDIAN)', [
        ('Dependents', 'Web', 'List dependents', 'Navigate to /patient/dependents', 'Shows child/elderly dependent profiles', 'P1 - High'),
        ('Dependents', 'Web', 'Add dependent', 'Click "Add Dependent" → fill form → submit', 'Dependent created and visible in list', 'P1 - High'),
        ('Dependents', 'Web', 'Switch to dependent profile', 'Click on dependent → switch context', 'Dashboard shows dependent\'s data', 'P1 - High'),
    ]),
    ('REVIEWS', [
        ('Reviews', 'Web', 'Submit doctor review', 'Navigate to /patient/reviews → write review → submit', 'Review submitted with star rating', 'P2 - Medium'),
    ]),
    ('NOTIFICATIONS', [
        ('Notifications', 'Web', 'View notification inbox', 'Navigate to /patient/notifications', 'All patient notifications by type', 'P1 - High'),
    ]),
])


# ══════════════════════════════════════════════════════════════
# SHEET: Patient (Mobile)
# ══════════════════════════════════════════════════════════════
create_uat_sheet('Patient (Mobile)', '6495ED', [
    ('HOME TAB — DASHBOARD', [
        ('Dashboard', 'Mobile', 'Dashboard loads with clinic info', 'Open app → Home tab', 'Shows clinic name, profile switcher, upcoming appointments', 'P0 - Critical'),
        ('Dashboard', 'Mobile', 'Stats cards render', 'Scroll dashboard', 'Financial summary, treatment timeline, appointment count', 'P1 - High'),
        ('Dashboard', 'Mobile', 'Care reminder alerts', 'Check care section on dashboard', 'Active reminders with due times', 'P1 - High'),
        ('Dashboard', 'Mobile', 'Profile switcher (guardian)', 'Tap profile switcher → select dependent', 'Dashboard refreshes with dependent\'s data', 'P1 - High'),
        ('Notifications', 'Mobile', 'Open notification list', 'Tap notification bell icon', 'All notifications with read/unread indicators', 'P1 - High'),
        ('Notifications', 'Mobile', 'Mark all as read', 'Tap "Mark all as read"', 'All notifications marked read, badge cleared', 'P2 - Medium'),
    ]),
    ('APPOINTMENTS TAB', [
        ('Appointments', 'Mobile', 'List appointments', 'Tap Appointments tab', 'All appointments with status badges, doctor info, time', 'P0 - Critical'),
        ('Appointments', 'Mobile', 'Filter by status (Upcoming/Completed/Cancelled)', 'Tap filter chips', 'List filtered correctly', 'P1 - High'),
        ('Appointments', 'Mobile', 'View appointment detail', 'Tap on an appointment', 'Full detail: doctor, clinic, time, status, actions', 'P0 - Critical'),
        ('Appointments', 'Mobile', 'Book new appointment', 'Tap "Book" → select clinic/dept/doctor/time → confirm', 'Appointment booked successfully', 'P0 - Critical'),
        ('Appointments', 'Mobile', 'Cancel appointment', 'Tap "Cancel" on appointment detail', 'Appointment cancelled', 'P1 - High'),
        ('Appointments', 'Mobile', 'Join telemedicine from appointment', 'Tap "Join Call" on teleconsult appointment', 'Video call screen opens', 'P0 - Critical'),
    ]),
    ('HEALTH TAB — MEDICAL RECORDS', [
        ('Medical History', 'Mobile', 'View medical history', 'Tap Health tab → Medical History', 'Past treatments, diagnoses, allergies', 'P1 - High'),
        ('Prescriptions', 'Mobile', 'List prescriptions', 'Tap Health tab → Prescriptions', 'Active and past prescriptions', 'P1 - High'),
        ('Prescriptions', 'Mobile', 'View prescription detail', 'Tap on a prescription', 'Medicine names, dosage, frequency, refill status', 'P1 - High'),
        ('Share Records', 'Mobile', 'Share medical records', 'Tap "Share Records"', 'Generate share link with expiry, audit log', 'P2 - Medium'),
    ]),
    ('HEALTH TAB — DENTAL SCANS', [
        ('Dental Scans', 'Mobile', 'View scan history', 'Navigate to Health → Dental Scans', 'List of previous scans with dates, status', 'P1 - High'),
        ('Dental Scans', 'Mobile', 'Start dental scan capture', 'Tap "New Scan" → grant camera permissions', 'Camera opens with multi-position guide (6 angles)', 'P0 - Critical'),
        ('Dental Scans', 'Mobile', 'Capture all 6 angles', 'Follow voice guidance → capture each angle', 'All positions captured, preview shown', 'P0 - Critical'),
        ('Dental Scans', 'Mobile', 'Submit scan for AI analysis', 'After capture → tap "Analyze"', 'Scan submitted, loading indicator shown', 'P0 - Critical'),
        ('Dental Scans', 'Mobile', 'View AI analysis results', 'After analysis complete → view results', '3D tooth visualization, AI findings, recommendations', 'P0 - Critical'),
        ('Dental Scans', 'Mobile', 'Export scan result to PDF', 'Tap "Export PDF"', 'PDF generated and shareable', 'P2 - Medium'),
    ]),
    ('HEALTH TAB — CARE TASKS', [
        ('Care Tasks', 'Mobile', 'List care tasks', 'Navigate to Health → Care Tasks', 'Medication reminders, follow-ups, post-treatment care', 'P1 - High'),
        ('Care Tasks', 'Mobile', 'View task detail', 'Tap on a care task', 'Task details, reminder schedule, completion history', 'P1 - High'),
        ('Care Tasks', 'Mobile', 'Mark task as done', 'Tap "Done" on a care task', 'Task marked complete, logged', 'P1 - High'),
        ('Care Tasks', 'Mobile', 'Skip task', 'Tap "Skip" on a care task', 'Task skipped for this occurrence', 'P2 - Medium'),
    ]),
    ('PAYMENTS TAB', [
        ('Payments', 'Mobile', 'View payment list', 'Tap Payments tab', 'Pending and paid invoices with amounts', 'P0 - Critical'),
        ('Payments', 'Mobile', 'View financial summary', 'Navigate to financial summary screen', 'Lifetime spending, category breakdown, outstanding balance', 'P1 - High'),
    ]),
    ('MORE TAB — PROFILE', [
        ('Profile', 'Mobile', 'View own profile', 'Tap More → Profile', 'Avatar, name, email, phone, clinic code', 'P1 - High'),
        ('Profile', 'Mobile', 'Edit profile', 'Tap "Edit" → change name/phone → save', 'Profile updated', 'P1 - High'),
    ]),
    ('MORE TAB — DEPENDENTS', [
        ('Dependents', 'Mobile', 'List dependents', 'Tap More → Dependents', 'Family members with relationship type', 'P1 - High'),
        ('Dependents', 'Mobile', 'Add dependent', 'Tap "Add" → fill form → submit', 'Dependent created', 'P1 - High'),
        ('Dependents', 'Mobile', 'Edit dependent', 'Tap dependent → edit → save', 'Dependent info updated', 'P2 - Medium'),
        ('Dependents', 'Mobile', 'View dependent compliance', 'Tap dependent → compliance tab', 'Care adherence metrics for dependent', 'P2 - Medium'),
    ]),
    ('MORE TAB — CONSENTS & ACCESS LOG', [
        ('Consents', 'Mobile', 'View consent forms', 'Tap More → Consents', 'Treatment and data sharing consents', 'P1 - High'),
        ('Access Log', 'Mobile', 'View access log', 'Tap More → Access Log', 'Who viewed records, when, access type', 'P1 - High'),
        ('Access Log', 'Mobile', 'View access log detail', 'Tap on an entry', 'Full detail: accessor, timestamp, resource, description', 'P2 - Medium'),
    ]),
    ('MORE TAB — SETTINGS & OTHER', [
        ('Settings', 'Mobile', 'App settings', 'Tap More → Settings', 'Notification preferences, language, theme', 'P2 - Medium'),
        ('Reviews', 'Mobile', 'Submit review', 'Tap More → Reviews → write review', 'Review submitted with star rating', 'P2 - Medium'),
        ('Policy', 'Mobile', 'View legal policies', 'Tap More → Policy', 'T&C and privacy policy displayed', 'P3 - Low'),
    ]),
    ('EMERGENCY', [
        ('Emergency', 'Mobile', 'Emergency triage form', 'Trigger emergency → fill triage form', 'Symptom intake, severity, location confirmed', 'P0 - Critical'),
        ('Emergency', 'Mobile', 'Emergency session created', 'Submit emergency request', 'Session created, doctors notified via socket + FCM', 'P0 - Critical'),
    ]),
    ('VIDEO CALLS', [
        ('Video Call', 'Mobile', 'Receive incoming call', 'Doctor initiates call → patient gets notification', 'Full-screen incoming call modal with accept/decline', 'P0 - Critical'),
        ('Video Call', 'Mobile', 'Accept and join video call', 'Tap "Accept" on incoming call', 'WebRTC video stream established', 'P0 - Critical'),
        ('Video Call', 'Mobile', 'In-call controls (mute, speaker, end)', 'During call → test audio controls', 'Mute/unmute, speaker toggle, end call all work', 'P0 - Critical'),
        ('Video Call', 'Mobile', 'In-call chat messaging', 'During call → open chat → send message', 'Message delivered to other participant', 'P1 - High'),
    ]),
])


# ══════════════════════════════════════════════════════════════
# SHEET: Doctor (Mobile)
# ══════════════════════════════════════════════════════════════
create_uat_sheet('Doctor (Mobile)', '2E8B57', [
    ('HOME TAB — DASHBOARD', [
        ('Dashboard', 'Mobile', 'Dashboard loads with stats', 'Open app as doctor → Home tab', 'Greeting, stats (patients, appointments, revenue), current room', 'P0 - Critical'),
        ('Dashboard', 'Mobile', 'Presence toggle', 'Toggle online/offline presence', 'Presence status updated, visible to receptionists', 'P0 - Critical'),
        ('Dashboard', 'Mobile', 'Today\'s schedule timeline', 'View schedule section on dashboard', 'Timeline of today\'s appointments', 'P1 - High'),
        ('Dashboard', 'Mobile', 'Emergency alert notification', 'When emergency request comes in', 'Alert badge appears on dashboard', 'P0 - Critical'),
        ('Room Monitor', 'Mobile', 'View room occupancy', 'Tap room monitor from dashboard', 'Real-time room status with patient queue', 'P2 - Medium'),
    ]),
    ('SCHEDULE TAB — APPOINTMENTS', [
        ('Schedule', 'Mobile', 'View weekly schedule', 'Tap Schedule tab', 'Weekly view with appointment slots', 'P0 - Critical'),
        ('Schedule', 'Mobile', 'View appointment detail', 'Tap on an appointment in schedule', 'Patient info, chief complaint, actions (check-in, start consultation)', 'P0 - Critical'),
        ('Schedule Mgmt', 'Mobile', 'Configure availability', 'Navigate to Schedule Management', 'Set working hours, break times, block slots', 'P1 - High'),
    ]),
    ('SCHEDULE TAB — CONSULTATIONS', [
        ('Consultation', 'Mobile', 'Start consultation', 'Tap "Start Consultation" on checked-in appointment', 'Consultation screen opens with patient data', 'P0 - Critical'),
        ('Consultation', 'Mobile', 'Add clinical notes', 'Enter chief complaint, examination, diagnosis', 'Notes saved to treatment record', 'P0 - Critical'),
        ('Consultation', 'Mobile', 'Record vital signs', 'Enter BP, HR, temp, SpO2', 'Vitals recorded on treatment record', 'P1 - High'),
        ('Consultation', 'Mobile', 'Complete consultation', 'Tap "Complete" → confirm', 'Treatment record completed, appointment status→completed', 'P0 - Critical'),
    ]),
    ('SCHEDULE TAB — PRESCRIPTIONS', [
        ('Prescription', 'Mobile', 'Create prescription', 'During consultation → tap "Prescribe"', 'Prescription form with medicine selector, dosage, frequency', 'P0 - Critical'),
        ('Prescription', 'Mobile', 'Submit prescription', 'Fill prescription → submit', 'Prescription created and linked to consultation', 'P0 - Critical'),
        ('Prescription List', 'Mobile', 'View prescriptions list', 'Navigate to prescription list', 'All issued prescriptions with patient, date, status', 'P1 - High'),
        ('Prescription Detail', 'Mobile', 'View prescription detail', 'Tap on a prescription', 'Full details: medicines, dosage, refill tracking', 'P1 - High'),
    ]),
    ('SCHEDULE TAB — FOLLOW-UPS & DENTAL', [
        ('Follow-ups', 'Mobile', 'View follow-up list', 'Navigate to follow-up list', 'Pending follow-ups with dates, patient info', 'P1 - High'),
        ('Dental Review', 'Mobile', 'View pending scan reviews', 'Navigate to dental scan review list', 'AI-analyzed scans awaiting doctor review', 'P1 - High'),
        ('Dental Review', 'Mobile', 'Review dental scan', 'Tap scan → view AI analysis → add notes → submit', 'Review submitted with doctor findings', 'P1 - High'),
        ('Procedures', 'Mobile', 'View procedure list', 'Navigate to procedure list', 'Completed procedures with details', 'P2 - Medium'),
    ]),
    ('TELEMEDICINE TAB', [
        ('Teleconsults', 'Mobile', 'List scheduled teleconsults', 'Tap Telemedicine tab', 'Upcoming video calls with patient info, join buttons', 'P0 - Critical'),
        ('Teleconsults', 'Mobile', 'Join video call', 'Tap "Join" on a session', 'Video call screen opens with WebRTC', 'P0 - Critical'),
        ('Emergency Queue', 'Mobile', 'View emergency requests', 'Navigate to Emergency Queue', 'Pending emergency calls with triage info, priority', 'P0 - Critical'),
        ('Emergency Queue', 'Mobile', 'Accept emergency request', 'Tap "Accept" on an emergency', 'Session accepted, video session created, redirected to call', 'P0 - Critical'),
        ('Emergency Queue', 'Mobile', 'Decline emergency request', 'Tap "Decline" on an emergency', 'Request declined (still available for other doctors)', 'P1 - High'),
        ('Chat Inbox', 'Mobile', 'View chat inbox', 'Navigate to chat inbox', 'Patient chat threads with unread counts', 'P1 - High'),
        ('Chat Inbox', 'Mobile', 'Send chat message', 'Tap thread → type message → send', 'Message delivered to patient', 'P1 - High'),
    ]),
    ('INVENTORY TAB (CONDITIONAL)', [
        ('Inventory', 'Mobile', 'View inventory list', 'Tap Inventory tab (if visible)', 'Medical supplies with stock levels', 'P2 - Medium'),
        ('Inventory', 'Mobile', 'View item detail', 'Tap on inventory item', 'Quantity, expiry, reorder info', 'P2 - Medium'),
        ('Inventory', 'Mobile', 'Request restock', 'Tap "Restock" → fill form → submit', 'Restock request created', 'P2 - Medium'),
    ]),
    ('PATIENTS TAB', [
        ('Patients', 'Mobile', 'View patient list', 'Tap Patients tab', 'Assigned patients with recent visits', 'P1 - High'),
        ('Patients', 'Mobile', 'View patient record', 'Tap on a patient', 'Complete medical record, allergies, medications', 'P1 - High'),
        ('Patients', 'Mobile', 'View patient compliance', 'Tap compliance tab on patient', 'Care adherence metrics, medication compliance', 'P2 - Medium'),
    ]),
    ('PROFILE TAB', [
        ('Profile', 'Mobile', 'View doctor profile', 'Tap Profile tab', 'Avatar, name, specialization, license, bio', 'P1 - High'),
        ('Profile', 'Mobile', 'Edit profile', 'Tap "Edit" → update fields → save', 'Profile updated', 'P2 - Medium'),
        ('Settings', 'Mobile', 'App settings', 'Navigate to Settings', 'Notification prefs, language, theme, logout', 'P2 - Medium'),
    ]),
])


# ══════════════════════════════════════════════════════════════
# SHEET: Auth & Discovery
# ══════════════════════════════════════════════════════════════
create_uat_sheet('Auth & Discovery', 'DAA520', [
    ('WEBSITE — MARKETING / PUBLIC', [
        ('Home', 'Web', 'Landing page loads', 'Navigate to /', 'Hero section, features, CTA', 'P1 - High'),
        ('Browse', 'Web', 'Browse clinics page', 'Navigate to /browse', 'Clinic cards with search by location/specialty', 'P1 - High'),
        ('Clinic Profile', 'Web', 'Public clinic profile', 'Navigate to /clinics/:slug', 'Clinic info, departments, doctors, reviews', 'P1 - High'),
        ('Doctor Profile', 'Web', 'Public doctor profile', 'Navigate to /clinics/:slug/doctors/:id', 'Qualifications, reviews, book appointment CTA', 'P1 - High'),
        ('Features', 'Web', 'Features page', 'Navigate to /features', 'Product features overview', 'P3 - Low'),
        ('Pricing', 'Web', 'Pricing page', 'Navigate to /pricing', 'Subscription plans for clinics', 'P2 - Medium'),
    ]),
    ('WEBSITE — CLINIC REGISTRATION', [
        ('Register', 'Web', 'Clinic registration wizard', 'Navigate to /register', 'Multi-step form: clinic details, plan selection, payment', 'P0 - Critical'),
        ('Register', 'Web', 'Slug availability check', 'Enter clinic name → check slug', 'Slug validated via /public/check-slug/:slug', 'P1 - High'),
        ('Register', 'Web', 'Paid plan registration with Razorpay', 'Select paid plan → complete payment', 'Razorpay order created, payment verified, clinic provisioned', 'P0 - Critical'),
        ('Register', 'Web', 'Provisioning status polling', 'After registration → watch progress', 'Provisioning steps visible: creating_db→seeding→creating_admin→completed', 'P1 - High'),
    ]),
    ('WEBSITE — STAFF LOGIN', [
        ('Login', 'Web', 'Staff login page loads', 'Navigate to /clinic/login', 'Email and password fields', 'P0 - Critical'),
        ('Login', 'Web', 'Valid staff login', 'Enter staff credentials → submit', 'Redirected to role-specific dashboard', 'P0 - Critical'),
        ('Login', 'Web', 'Invalid credentials', 'Enter wrong password → submit', 'Error message, no login', 'P0 - Critical'),
    ]),
    ('WEBSITE — PATIENT LOGIN', [
        ('Login', 'Web', 'Patient login page loads', 'Navigate to /patient/login', 'Email, password, clinic code entry', 'P0 - Critical'),
        ('Login', 'Web', 'Valid patient login', 'Enter patient credentials → submit', 'Redirected to patient dashboard', 'P0 - Critical'),
    ]),
    ('MOBILE — WELCOME & ONBOARDING', [
        ('Welcome', 'Mobile', 'Welcome screen shows', 'Open app (first time)', 'Intro screen with "Get Started" button', 'P1 - High'),
        ('Onboarding', 'Mobile', 'Onboarding slides', 'Tap "Get Started"', 'Feature highlight slides, skip/next buttons', 'P2 - Medium'),
    ]),
    ('MOBILE — CLINIC DISCOVERY', [
        ('Browse', 'Mobile', 'Browse clinics & doctors', 'Tap "Browse" from welcome', 'Featured doctors, specializations, geo-search, clinic cards', 'P1 - High'),
        ('Clinic Detail', 'Mobile', 'View clinic detail', 'Tap on a clinic', 'Clinic info, departments, doctors, location, reviews', 'P1 - High'),
        ('Doctor Detail', 'Mobile', 'View doctor detail', 'Tap on a doctor', 'Specializations, qualifications, reviews, booking CTA', 'P1 - High'),
        ('Join Clinic', 'Mobile', 'Join clinic flow', 'Tap "Join Clinic"', 'Search clinics or enter clinic code', 'P1 - High'),
        ('Clinic Code', 'Mobile', 'Enter clinic code', 'Tap "Enter Clinic Code" → type JATHR4521', 'Clinic resolved, proceed to login/register', 'P0 - Critical'),
    ]),
    ('MOBILE — UNIFIED LOGIN', [
        ('Login', 'Mobile', 'Email lookup step', 'Enter email in UnifiedLogin', 'Step 1: Email validated, clinics resolved via /public/lookup-email', 'P0 - Critical'),
        ('Login', 'Mobile', 'Clinic picker (multi-clinic users)', 'After email → if multiple clinics found', 'Step 2: List of clinics to choose from', 'P0 - Critical'),
        ('Login', 'Mobile', 'Password entry', 'Select clinic → enter password', 'Step 3: Login via /public/login with clinicId', 'P0 - Critical'),
        ('Login', 'Mobile', 'Successful login → navigate to role tab', 'Complete login flow', 'Patient → PatientTabNavigator, Doctor → DoctorTabNavigator', 'P0 - Critical'),
        ('Login', 'Mobile', 'Invalid email shows error', 'Enter non-existent email', 'Appropriate error message shown', 'P1 - High'),
        ('Login', 'Mobile', 'Wrong password shows error', 'Enter wrong password', 'Error message, login not successful', 'P0 - Critical'),
    ]),
    ('MOBILE — REGISTRATION', [
        ('Register', 'Mobile', 'Registration screen', 'Tap "Register" from login', 'Form: name, email, password, clinic code, terms', 'P0 - Critical'),
        ('Register', 'Mobile', 'Submit registration', 'Fill form → submit', 'Account created, auto-logged in or verify email', 'P0 - Critical'),
    ]),
    ('MOBILE — PASSWORD RESET', [
        ('Forgot', 'Mobile', 'Forgot password flow', 'Tap "Forgot Password" → enter email', 'Reset email sent via /public/forgot-password', 'P1 - High'),
    ]),
    ('MOBILE — DENTAL SCAN CHATBOT (PRE-AUTH)', [
        ('Chatbot', 'Mobile', 'Pre-auth dental scan chatbot', 'Access DentalScanChatbot from auth stack', 'Guided scan experience without login', 'P2 - Medium'),
    ]),
])


# ══════════════════════════════════════════════════════════════
# SHEET: Platform Admin
# ══════════════════════════════════════════════════════════════
create_uat_sheet('Platform Admin', '800080', [
    ('PLATFORM LOGIN', [
        ('Login', 'Web', 'Platform admin login', 'Navigate to /platform/login', 'Email/password login for platform admins', 'P0 - Critical'),
    ]),
    ('PLATFORM DASHBOARD', [
        ('Dashboard', 'Web', 'Dashboard loads', 'Login as platform admin → /platform', 'Total tenants, revenue, trials, monthly chart, expiring trials', 'P0 - Critical'),
        ('Dashboard', 'Web', 'Extend trial button', 'Click "Extend Trial" on an expiring tenant', 'Trial extended, new expiry date set', 'P1 - High'),
    ]),
    ('TENANT MANAGEMENT', [
        ('Tenants', 'Web', 'List all tenants', 'Navigate to /platform/tenants', 'Paginated list with status (active, trial, suspended, cancelled)', 'P0 - Critical'),
        ('Tenants', 'Web', 'Search tenants', 'Type in search box', 'Filtered by clinic name', 'P1 - High'),
        ('Tenants', 'Web', 'Filter by status', 'Select status filter', 'Only matching tenants shown', 'P1 - High'),
        ('Tenants', 'Web', 'Toggle tenant activation', 'Click activate/suspend on a tenant', 'Tenant status toggled, Redis cache invalidated', 'P0 - Critical'),
        ('Tenant Detail', 'Web', 'View tenant details', 'Click on a tenant', 'Clinic info, subscription, staff, usage metrics', 'P0 - Critical'),
        ('Tenant Detail', 'Web', 'Assign super admin', 'Click "Assign Super Admin" → select user', 'Super admin assigned to tenant', 'P1 - High'),
        ('Tenant Detail', 'Web', 'View audit log', 'Check audit log section', 'All tenant admin actions logged', 'P2 - Medium'),
    ]),
    ('PLAN MANAGEMENT', [
        ('Plans', 'Web', 'List subscription plans', 'Navigate to /platform/plans', 'All plans with pricing, features, status', 'P0 - Critical'),
        ('Plans', 'Web', 'Create new plan', 'Click "Create Plan" → fill form → submit', 'Plan created with features and pricing', 'P1 - High'),
        ('Plans', 'Web', 'Edit plan', 'Click on plan → edit → save', 'Plan updated', 'P1 - High'),
        ('Custom Plan', 'Web', 'Custom plan builder', 'Navigate to /platform/custom-plan-builder', 'Design bespoke plan for specific tenant', 'P2 - Medium'),
    ]),
    ('SUBSCRIPTIONS', [
        ('Subscriptions', 'Web', 'List all subscriptions', 'Navigate to /platform/subscriptions', 'All subscriptions with status, billing dates', 'P1 - High'),
        ('Subscriptions', 'Web', 'Change tenant plan', 'Select subscription → change plan', 'Plan changed with proration', 'P1 - High'),
        ('Subscriptions', 'Web', 'Cancel subscription', 'Click cancel on subscription', 'Subscription cancelled, tenant suspended after grace period', 'P1 - High'),
    ]),
    ('PROMOTIONS & REBATES', [
        ('Promotions', 'Web', 'List promotions', 'Navigate to /platform/promotions', 'All promo codes with usage, expiry', 'P1 - High'),
        ('Promotions', 'Web', 'Create promotion', 'Click "Create" → fill code, discount, limits → submit', 'Promotion created', 'P2 - Medium'),
        ('Rebates', 'Web', 'List rebates', 'Navigate to /platform/rebates', 'All rebate programs', 'P2 - Medium'),
    ]),
    ('ANALYTICS', [
        ('Revenue', 'Web', 'Platform revenue analytics', 'Navigate to /platform/revenue', 'Revenue by clinic, monthly trends, growth', 'P1 - High'),
        ('Subscriptions', 'Web', 'Subscription analytics', 'Navigate to /platform/subscription-analytics', 'Active count, churn rate, MRR, retention', 'P1 - High'),
        ('Platform', 'Web', 'Platform analytics', 'Navigate to /platform/analytics', 'User growth, feature adoption', 'P2 - Medium'),
        ('Dental Scans', 'Web', 'Dental scan analytics', 'Navigate to /platform/dental-scan-analytics', 'Scans by clinic, accuracy, adoption rate', 'P2 - Medium'),
    ]),
    ('FEATURE FLAGS', [
        ('Feature Flags', 'Web', 'List feature flags', 'Navigate to /platform/feature-flags', 'All flags with status, rollout %', 'P1 - High'),
        ('Feature Flags', 'Web', 'Create feature flag', 'Click "Create" → name, key, default → submit', 'Flag created', 'P2 - Medium'),
        ('Feature Flags', 'Web', 'Set tenant override', 'Select flag → add tenant override', 'Override applied for specific tenant', 'P2 - Medium'),
    ]),
    ('PLATFORM USERS', [
        ('Users', 'Web', 'List platform admins', 'Navigate to /platform/users', 'All platform admin accounts', 'P1 - High'),
        ('Users', 'Web', 'Create platform user', 'Click "Create" → fill form → submit', 'New platform admin created', 'P2 - Medium'),
    ]),
    ('INTEGRATION & MONITORING', [
        ('Integrations', 'Web', 'Tenant integrations settings', 'Navigate to /platform/tenants/:slug/integrations', 'Per-tenant API keys, webhooks, test connectivity', 'P2 - Medium'),
        ('Monitoring', 'Web', 'System monitoring', 'Navigate to /platform/monitoring', 'Health checks, uptime, error dashboard', 'P2 - Medium'),
    ]),
])


# ══════════════════════════════════════════════════════════════
# SHEET: Push & Real-Time
# ══════════════════════════════════════════════════════════════
create_uat_sheet('Push & Real-Time', 'DC143C', [
    ('FCM PUSH NOTIFICATIONS', [
        ('FCM Setup', 'Mobile', 'Device token registration', 'Login on mobile → check device token saved', 'POST /auth/register-device succeeds, token in User.fcmTokens[]', 'P0 - Critical'),
        ('FCM Setup', 'Mobile', 'Token auto-cleanup on invalid', 'Send push to old token', 'Invalid token removed from User.fcmTokens[]', 'P2 - Medium'),
    ]),
    ('APPOINTMENT REMINDERS (FCM)', [
        ('Appt Reminder', 'Mobile', 'Appointment reminder push received', 'Wait for scheduled reminder (15 min scanner)', 'FCM push notification with appointment details', 'P0 - Critical'),
        ('Appt Reminder', 'Mobile', 'Yes/No action buttons on notification', 'Receive appointment reminder → check notification', 'Notification shows "Confirm" and "Decline" action buttons', 'P0 - Critical'),
        ('Appt Reminder', 'Mobile', 'Tap "Confirm" action', 'Tap "Confirm" on notification', 'Calls portalApi.confirmAttendance(), attendance confirmed', 'P0 - Critical'),
        ('Appt Reminder', 'Mobile', 'Tap "Decline" action', 'Tap "Decline" on notification', 'Attendance declined, clinic notified', 'P1 - High'),
        ('Appt Reminder', 'Mobile', 'Tap notification body → navigate to appointment', 'Tap notification body (not action button)', 'App opens and navigates to appointment detail screen', 'P1 - High'),
    ]),
    ('CARE REMINDERS (FCM)', [
        ('Care Reminder', 'Mobile', 'Care reminder push received', 'Wait for scheduled care reminder', 'FCM push with medication/task details', 'P0 - Critical'),
        ('Care Reminder', 'Mobile', 'Done/Skip action buttons', 'Receive care reminder notification', '"Done" and "Skip" action buttons visible', 'P1 - High'),
        ('Care Reminder', 'Mobile', 'Tap "Done" action', 'Tap "Done" on care reminder', 'Calls portalApi.respondToReminder(), task marked done', 'P1 - High'),
        ('Care Reminder', 'Mobile', 'Tap "Skip" action', 'Tap "Skip" on care reminder', 'Task skipped for this occurrence', 'P2 - Medium'),
    ]),
    ('NOTIFICATION CHANNELS (ANDROID)', [
        ('Channels', 'Mobile', 'Default channel exists', 'Check Android notification settings for app', 'Default channel created on app startup', 'P2 - Medium'),
        ('Channels', 'Mobile', 'Incoming calls channel (ringtone)', 'Receive incoming call push', 'Plays ringtone sound, full-screen intent', 'P0 - Critical'),
        ('Channels', 'Mobile', 'Emergency alerts channel', 'Receive emergency push', 'High-priority notification with alert sound', 'P0 - Critical'),
        ('Channels', 'Mobile', 'Chat messages channel', 'Receive chat message push', 'Standard notification with quick-reply action', 'P1 - High'),
    ]),
    ('BACKGROUND / KILLED STATE', [
        ('Background', 'Mobile', 'Notification received while app in background', 'Put app in background → trigger push', 'Notification appears in system tray', 'P0 - Critical'),
        ('Background', 'Mobile', 'Notification received while app killed', 'Kill app completely → trigger push', 'Notification appears in system tray', 'P0 - Critical'),
        ('Background', 'Mobile', 'Tap notification opens correct screen', 'Tap notification after app was killed', 'App launches and navigates to relevant screen', 'P1 - High'),
    ]),
    ('SOCKET.IO REAL-TIME', [
        ('Socket', 'Both', 'Socket connects on login', 'Login on mobile or web → check socket', 'Socket.io connection established with auth token', 'P0 - Critical'),
        ('Socket', 'Both', 'Auto-join rooms', 'Login → verify room membership', 'Joined: user:{userId}, tenant:{slug}, tenant:{slug}:{role}s', 'P1 - High'),
        ('Socket', 'Both', 'Emergency request event', 'Patient sends emergency → check doctor receives', 'Real-time emergency:new event received by doctors', 'P0 - Critical'),
        ('Socket', 'Both', 'Presence update event', 'Doctor toggles presence → check receptionist sees update', 'presence:update event propagated to tenant room', 'P1 - High'),
        ('Socket', 'Both', 'Chat message event', 'Send message in telemedicine chat', 'chat:message event received by peer in real-time', 'P1 - High'),
        ('Socket', 'Both', 'Socket reconnects after disconnect', 'Simulate network drop → restore', 'Socket auto-reconnects and rejoins rooms', 'P2 - Medium'),
    ]),
    ('TELEMEDICINE / VIDEO CALLS', [
        ('Video', 'Both', 'Initiate video call', 'Doctor joins telemedicine session', 'WebRTC peer connection established', 'P0 - Critical'),
        ('Video', 'Both', 'Patient receives incoming call notification', 'Doctor joins → patient gets FCM push', 'Full-screen incoming call modal on mobile', 'P0 - Critical'),
        ('Video', 'Both', 'Two-way video stream', 'Both parties in call', 'Both see each other\'s video, hear audio', 'P0 - Critical'),
        ('Video', 'Both', 'Mute/unmute audio', 'Toggle mute during call', 'Audio muted/unmuted for remote peer', 'P1 - High'),
        ('Video', 'Both', 'End call', 'Tap "End Call"', 'Call terminated for both parties, session status updated', 'P0 - Critical'),
        ('Video', 'Both', 'Session chat during video call', 'Open chat overlay during call → send message', 'Message visible to other participant', 'P1 - High'),
        ('Video', 'Both', 'File sharing during session', 'Upload file during telemedicine session', 'File uploaded and accessible by both parties', 'P2 - Medium'),
        ('Video', 'Both', 'Recording consent prompt', 'When recording is initiated → consent requested', 'Both parties must consent before recording starts', 'P2 - Medium'),
    ]),
    ('EMAIL NOTIFICATIONS', [
        ('Email', 'Backend', 'Verification email sent on registration', 'Register new account', 'Email sent to user (if domain whitelisted)', 'P1 - High'),
        ('Email', 'Backend', 'Password reset email', 'Use forgot password flow', 'Reset link email sent', 'P1 - High'),
        ('Email', 'Backend', 'Staff invite email', 'Admin invites new staff member', 'Invite email with clinic code sent', 'P1 - High'),
        ('Email', 'Backend', 'Invoice overdue email', 'Invoice becomes overdue', 'Overdue notice sent to patient', 'P2 - Medium'),
        ('Email', 'Backend', 'Dental scan report email', 'Request email of scan results', 'Report emailed (domain whitelist checked)', 'P2 - Medium'),
        ('Email', 'Backend', 'ALLOWED_DOMAINS blocks non-whitelisted', 'Try sending email to non-whitelisted domain', 'Email blocked and logged, no delivery', 'P0 - Critical'),
    ]),
])


# ══════════════════════════════════════════════════════════════
# SHEET: Backend & APIs
# ══════════════════════════════════════════════════════════════
create_uat_sheet('Backend & APIs', '4B0082', [
    ('AUTHENTICATION & AUTHORIZATION', [
        ('Auth', 'Backend', 'JWT access token generation', 'POST /auth/login with valid credentials', 'Returns accessToken + refreshToken', 'P0 - Critical'),
        ('Auth', 'Backend', 'Token refresh flow', 'POST /auth/refresh with refreshToken', 'New accessToken returned', 'P0 - Critical'),
        ('Auth', 'Backend', 'Expired token rejected', 'Send request with expired accessToken', '401 Unauthorized returned', 'P0 - Critical'),
        ('Auth', 'Backend', 'Logout blacklists token', 'POST /auth/logout', 'Token blacklisted, subsequent requests rejected', 'P0 - Critical'),
        ('Auth', 'Backend', 'RBAC permission check (authorize)', 'Access endpoint requiring APPOINTMENT_CREATE as patient', '403 Forbidden returned', 'P0 - Critical'),
        ('Auth', 'Backend', 'RBAC permission check (authorizeAny)', 'Access endpoint requiring APPOINTMENT_READ or APPOINTMENT_READ_OWN', 'Allowed if user has EITHER permission', 'P1 - High'),
        ('Auth', 'Backend', 'Rate limiting on login', 'Send 16 login attempts in 15 minutes', '429 Too Many Requests on 16th attempt', 'P1 - High'),
    ]),
    ('MULTI-TENANT ISOLATION', [
        ('Tenant', 'Backend', 'Tenant resolver extracts slug from header', 'Send request with x-tenant-id header', 'Correct tenant database used', 'P0 - Critical'),
        ('Tenant', 'Backend', 'Missing x-tenant-id header', 'Send authenticated request without header', 'Error: tenant header required', 'P0 - Critical'),
        ('Tenant', 'Backend', 'Cross-tenant data isolation', 'Login to clinic A → try to access clinic B data', 'Data from clinic B NOT accessible', 'P0 - Critical'),
    ]),
    ('SUBSCRIPTION ENFORCEMENT', [
        ('Subscription', 'Backend', 'Active subscription allows access', 'Login to active tenant → make API call', 'Request succeeds', 'P0 - Critical'),
        ('Subscription', 'Backend', 'Suspended tenant blocked', 'Login to suspended tenant → make API call', '403 with { code: "SUBSCRIPTION_BLOCKED", subscriptionStatus, reason }', 'P0 - Critical'),
        ('Subscription', 'Backend', 'Subscription bypass routes (/auth, /public)', 'Access /auth/login on suspended tenant', 'Request succeeds (not blocked)', 'P0 - Critical'),
        ('Subscription', 'Backend', 'Redis cache invalidation after status change', 'Suspend tenant → immediately try access', 'Cache invalidated, new status effective', 'P1 - High'),
    ]),
    ('FEATURE GATING', [
        ('Features', 'Backend', 'Feature guard blocks disabled feature', 'Access telehealth endpoint on non-telehealth plan', '403: Feature not available', 'P1 - High'),
        ('Features', 'Backend', 'Feature flag 3-tier resolution', 'Set global flag ON, plan OFF, tenant override ON → check', 'Tenant override wins', 'P1 - High'),
    ]),
    ('SOFT DELETE PATTERN', [
        ('Soft Delete', 'Backend', 'Deleted records excluded from queries', 'Soft-delete a patient → query patients list', 'Deleted patient NOT in results', 'P0 - Critical'),
        ('Soft Delete', 'Backend', 'countDocuments includes deletedAt filter', 'Soft-delete patient → check pagination total', 'Total count excludes soft-deleted records', 'P1 - High'),
    ]),
    ('PAGINATION & SORTING', [
        ('Pagination', 'Backend', 'Default pagination', 'GET /patients (no page/limit params)', 'Returns page 1, default limit (20), total count', 'P1 - High'),
        ('Pagination', 'Backend', 'MAX_LIMIT enforcement (100)', 'GET /patients?limit=500', 'Returns max 100 items, not 500', 'P1 - High'),
        ('Pagination', 'Backend', 'Sort parameter', 'GET /patients?sort=-createdAt', 'Results sorted newest first', 'P2 - Medium'),
    ]),
    ('KEY API ENDPOINTS', [
        ('Appointments API', 'Backend', 'GET /appointments with date range', 'GET /appointments?from=2026-04-01&to=2026-04-30', 'Returns appointments within date range', 'P0 - Critical'),
        ('Appointments API', 'Backend', 'POST /appointments validation', 'POST /appointments with past date for scheduledAt', 'Validation error: "Appointment must be in the future"', 'P1 - High'),
        ('Patient Portal API', 'Backend', 'GET /portal/dashboard/:patientId', 'Request patient dashboard data', 'Returns upcoming appointments, care tasks, financial summary', 'P0 - Critical'),
        ('Doctor API', 'Backend', 'GET /doctor/stats', 'Request doctor dashboard stats', 'Returns appointment count, revenue, patients, weekTotal', 'P1 - High'),
        ('Billing API', 'Backend', 'GET /billing/analytics/revenue?from=X&to=Y', 'Request billing analytics with date range', 'Returns { byBranch, monthlyTrend, totals }', 'P1 - High'),
        ('Public API', 'Backend', 'POST /public/lookup-email', 'Send { email } to lookup', 'Returns list of clinics user belongs to', 'P0 - Critical'),
        ('Public API', 'Backend', 'POST /public/login', 'Send { clinicId, email, password }', 'Returns tokens and user data', 'P0 - Critical'),
        ('Dental Scan API', 'Backend', 'POST /dental-scans/:id/analyze', 'Submit scan for AI analysis', 'Returns analysis results with findings', 'P1 - High'),
    ]),
    ('BACKGROUND JOBS (BullMQ)', [
        ('Jobs', 'Backend', 'Appointment reminder scanner runs', 'Wait for 15-min scan cycle', 'Due appointment reminders queued for FCM push', 'P1 - High'),
        ('Jobs', 'Backend', 'Care reminder scanner runs', 'Wait for care reminder scan cycle', 'Due care reminders queued for FCM push', 'P1 - High'),
        ('Jobs', 'Backend', 'Dental scan analysis worker processes', 'Submit dental scan → check worker', 'AI analysis completed, result saved', 'P1 - High'),
        ('Jobs', 'Backend', 'Email worker sends emails', 'Trigger email action → check delivery', 'Email sent via SMTP (whitelisted domains only)', 'P1 - High'),
        ('Jobs', 'Backend', 'Invoice overdue scanner', 'Create overdue invoice → wait for scan', 'Overdue notification sent', 'P2 - Medium'),
        ('Jobs', 'Backend', 'Provisioning worker (multi-step)', 'Register new clinic', 'Steps: create_db→generate_code→seed→create_admin→apply_plan→complete', 'P0 - Critical'),
        ('Jobs', 'Backend', 'Subscription lifecycle worker', 'Trial expires → check worker', 'Auto-transitions: trial→grace_period→suspended', 'P1 - High'),
        ('Jobs', 'Backend', 'Inventory alert worker', 'Stock falls below reorder point', 'Low stock notification sent to admin', 'P2 - Medium'),
    ]),
    ('ACCESS LOGGING', [
        ('Access Log', 'Backend', 'Staff view patient profile → logged', 'Doctor views patient profile via GET /patients/:id', 'AccessLog entry: accessType=view, resource=profile', 'P1 - High'),
        ('Access Log', 'Backend', 'Staff create appointment → logged', 'Staff creates appointment via POST /appointments', 'AccessLog entry: accessType=create, resource=appointment', 'P1 - High'),
        ('Access Log', 'Backend', 'Doctor start consultation → logged', 'Doctor starts consultation', 'AccessLog entry: accessType=create, resource=treatment', 'P1 - High'),
        ('Access Log', 'Backend', 'Self-view excluded from log', 'Patient views own profile', 'NO AccessLog entry (self-view skip logic)', 'P1 - High'),
    ]),
    ('ERROR HANDLING', [
        ('Errors', 'Backend', 'Validation error format', 'Send invalid data to any endpoint', 'Returns { success: false, errors: [...] } with field-level details', 'P1 - High'),
        ('Errors', 'Backend', 'ApiError with structured data', 'Trigger subscription block', 'Returns { code, subscriptionStatus, reason } in error data', 'P2 - Medium'),
        ('Errors', 'Backend', '404 for non-existent resource', 'GET /patients/nonexistent_id', 'Returns 404 Not Found', 'P2 - Medium'),
    ]),
])


# ═══════════════════════════════════════════════════════════
# Final: Save the workbook
# ═══════════════════════════════════════════════════════════
output_path = os.path.join(os.path.dirname(__file__), '..', 'BestoClinic_UAT_Template.xlsx')
output_path = os.path.abspath(output_path)
wb.save(output_path)
print(f'UAT template saved to: {output_path}')
print(f'Sheets: {wb.sheetnames}')
print(f'Total sheets: {len(wb.sheetnames)}')
