# BestoClinic - Comprehensive Test Cases

## Table of Contents
1. [Authentication & Authorization](#1-authentication--authorization)
2. [Patient Management](#2-patient-management)
3. [Appointments & Scheduling](#3-appointments--scheduling)
4. [Billing & Invoicing](#4-billing--invoicing)
5. [Payments & Payment Gateway](#5-payments--payment-gateway)
6. [Cash Register](#6-cash-register)
7. [Credit Notes](#7-credit-notes)
8. [Telemedicine](#8-telemedicine)
9. [Prescriptions](#9-prescriptions)
10. [Doctor Management](#10-doctor-management)
11. [Staff Management](#11-staff-management)
12. [Clinic Settings & Configuration](#12-clinic-settings--configuration)
13. [Branches](#13-branches)
14. [Departments](#14-departments)
15. [Insurance Management](#15-insurance-management)
16. [Payroll & HR](#16-payroll--hr)
17. [Queue Management](#17-queue-management)
18. [Emergency Management](#18-emergency-management)
19. [Patient Portal](#19-patient-portal)
20. [Integrations](#20-integrations)
21. [Notifications](#21-notifications)
22. [Analytics & Dashboard](#22-analytics--dashboard)
23. [Consent Management](#23-consent-management)
24. [Treatment Records](#24-treatment-records)
25. [Legacy Data Upload](#25-legacy-data-upload)
26. [Subscription Management](#26-subscription-management)
27. [Platform Management](#27-platform-management)
28. [Public Routes](#28-public-routes)
29. [Mobile App](#29-mobile-app)

---

## 1. Authentication & Authorization

### 1.1 Login
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| AUTH-001 | Login with valid credentials | 1. Enter valid email/password 2. Click login | User is authenticated, JWT token returned, redirected to dashboard | |
| AUTH-002 | Login with invalid password | 1. Enter valid email 2. Enter wrong password 3. Click login | Error message "Invalid credentials", no token issued | |
| AUTH-003 | Login with non-existent email | 1. Enter unregistered email 2. Enter any password | Error message, login denied | |
| AUTH-004 | Login with empty fields | 1. Leave email/password empty 2. Click login | Validation error for required fields | |
| AUTH-005 | Login with invalid email format | 1. Enter "notanemail" 2. Enter password | Validation error for email format | |
| AUTH-006 | JWT token expiry | 1. Login successfully 2. Wait for token to expire 3. Make API request | 401 Unauthorized response | |
| AUTH-007 | Access protected route without token | 1. Call any protected API without Authorization header | 401 Unauthorized response | |
| AUTH-008 | Access protected route with malformed token | 1. Send request with "Bearer invalidtoken123" | 401 Unauthorized response | |

### 1.2 Registration
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| AUTH-009 | Register new patient | 1. Fill all required fields 2. Submit | Patient account created, confirmation returned | |
| AUTH-010 | Register with existing email | 1. Use already registered email 2. Submit | Error: "Email already in use" | |
| AUTH-011 | Register with missing required fields | 1. Leave name/email empty 2. Submit | Validation errors returned | |
| AUTH-012 | Register with invalid phone number | 1. Enter invalid phone format 2. Submit | Validation error for phone | |

### 1.3 Role-Based Access Control
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| AUTH-013 | Admin accesses admin-only route | 1. Login as Admin 2. Access admin route | Access granted | |
| AUTH-014 | Patient accesses admin-only route | 1. Login as Patient 2. Access admin route | 403 Forbidden | |
| AUTH-015 | Doctor accesses doctor routes | 1. Login as Doctor 2. Access doctor dashboard | Access granted | |
| AUTH-016 | Receptionist accesses billing routes | 1. Login as Receptionist 2. Try billing operations | Access based on assigned permissions | |
| AUTH-017 | Billing Officer accesses payroll | 1. Login as Billing Officer 2. Access payroll routes | 403 Forbidden (unless permitted) | |
| AUTH-018 | HR Manager accesses payroll | 1. Login as HR/Payroll Manager 2. Access payroll | Access granted | |
| AUTH-019 | Feature guard - subscription check | 1. Login to clinic on Free plan 2. Access Pro feature | 403 with feature not available message | |

---

## 2. Patient Management

### 2.1 Patient CRUD
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| PAT-001 | Create new patient | 1. Fill patient form (name, DOB, gender, contact) 2. Submit | Patient created with unique ID | |
| PAT-002 | Create patient with all fields | 1. Fill all fields including allergies, medications, insurance, emergency contact 2. Submit | Patient created with complete profile | |
| PAT-003 | Create patient with duplicate phone | 1. Use existing patient's phone number | Error or handled per business rules | |
| PAT-004 | View patient list | 1. Navigate to patient list | Paginated list of patients displayed | |
| PAT-005 | Search patient by name | 1. Enter patient name in search | Matching patients returned | |
| PAT-006 | Search patient by phone | 1. Enter phone in search | Matching patient returned | |
| PAT-007 | View patient profile | 1. Click on patient from list | Full patient details displayed | |
| PAT-008 | Update patient information | 1. Edit patient name/contact 2. Save | Patient info updated | |
| PAT-009 | Update patient medical history | 1. Add allergy 2. Add medication 3. Save | Medical history updated | |
| PAT-010 | Soft delete patient | 1. Delete patient | Patient marked as deleted, not permanently removed | |
| PAT-011 | View deleted patient data | 1. Query for soft-deleted patient | Historical data preserved and accessible to admin | |

### 2.2 Patient Medical History
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| PAT-012 | Add allergies | 1. Open patient profile 2. Add allergy entry 3. Save | Allergy recorded | |
| PAT-013 | Add current medications | 1. Add medication with dosage 2. Save | Medication recorded | |
| PAT-014 | Add medical conditions | 1. Add condition 2. Save | Condition recorded | |
| PAT-015 | Record blood group | 1. Select blood group 2. Save | Blood group saved | |
| PAT-016 | Add emergency contact | 1. Enter emergency contact details 2. Save | Emergency contact saved | |
| PAT-017 | Add guardian information | 1. Link guardian to patient 2. Save | Guardian linked | |

---

## 3. Appointments & Scheduling

### 3.1 Appointment Booking
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| APT-001 | Book consultation appointment | 1. Select patient 2. Select doctor 3. Choose date/time 4. Type: consultation 5. Submit | Appointment created with "requested" status | |
| APT-002 | Book follow-up appointment | 1. Select existing patient 2. Type: follow-up 3. Submit | Follow-up appointment created | |
| APT-003 | Book emergency appointment | 1. Select patient 2. Type: emergency 3. Submit | Emergency appointment created with priority | |
| APT-004 | Book teleconsult appointment | 1. Select patient 2. Type: teleconsult 3. Submit | Teleconsult appointment created | |
| APT-005 | Book procedure appointment | 1. Select patient 2. Type: procedure 3. Submit | Procedure appointment created | |
| APT-006 | Book with overlapping time | 1. Book appointment at time already taken for same doctor | Error: time slot unavailable | |
| APT-007 | Book without required fields | 1. Submit appointment form with missing patient/doctor | Validation error | |

### 3.2 Appointment Lifecycle
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| APT-008 | Confirm appointment | 1. Select requested appointment 2. Confirm | Status changes to "confirmed" | |
| APT-009 | Check-in patient | 1. Select confirmed appointment 2. Check in | Status: "checked-in", timestamp recorded | |
| APT-010 | Start appointment | 1. Select checked-in appointment 2. Start | Status: "in-progress" | |
| APT-011 | Complete appointment | 1. Select in-progress appointment 2. Complete | Status: "completed", completion time recorded | |
| APT-012 | Cancel appointment | 1. Select appointment 2. Cancel with reason | Status: "cancelled", reason recorded | |
| APT-013 | Mark as no-show | 1. Select confirmed appointment past time 2. Mark no-show | Status: "no-show" | |
| APT-014 | Reschedule appointment | 1. Select appointment 2. Change date/time 3. Save | Appointment rescheduled | |

### 3.3 Appointment Filtering
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| APT-015 | Filter by date range | 1. Set start/end date 2. Search | Appointments within range returned | |
| APT-016 | Filter by doctor | 1. Select doctor from filter 2. Search | Only that doctor's appointments shown | |
| APT-017 | Filter by status | 1. Select status filter 2. Search | Appointments with matching status | |
| APT-018 | Filter by appointment type | 1. Select type filter | Matching type appointments shown | |

---

## 4. Billing & Invoicing

### 4.1 Invoice Creation
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| INV-001 | Create invoice with single item | 1. Select patient 2. Add one service item 3. Save | Invoice created with correct total | |
| INV-002 | Create invoice with multiple items | 1. Add treatment + medicine + lab items 2. Save | Invoice with all items, correct subtotal | |
| INV-003 | Create invoice with GST | 1. Add items 2. Apply GST (CGST + SGST) 3. Save | Tax calculated correctly | |
| INV-004 | Create invoice with IGST | 1. Add items 2. Apply IGST for inter-state 3. Save | IGST calculated correctly | |
| INV-005 | Apply promotion code | 1. Create invoice 2. Apply valid promo code | Discount applied, total reduced | |
| INV-006 | Apply invalid promo code | 1. Enter non-existent promo code | Error: invalid promo code | |
| INV-007 | Create invoice with zero items | 1. Try to save invoice with no items | Validation error | |
| INV-008 | Sequential invoice numbering | 1. Create invoice A 2. Create invoice B | Invoice B number = A + 1 | |

### 4.2 Invoice Lifecycle
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| INV-009 | Draft to Sent | 1. Create draft invoice 2. Send to patient | Status: "sent" | |
| INV-010 | Mark as Paid | 1. Record full payment 2. Update invoice | Status: "paid" | |
| INV-011 | Partial payment | 1. Record partial payment | Status: "partially paid" | |
| INV-012 | Mark as Overdue | 1. Invoice past due date with no payment | Status: "overdue" | |
| INV-013 | Cancel invoice | 1. Cancel an unpaid invoice | Status: "cancelled" | |
| INV-014 | Refund invoice | 1. Process refund on paid invoice | Status: "refunded" | |
| INV-015 | Download invoice PDF | 1. Click download on invoice | PDF generated and downloaded | |

### 4.3 Service Items
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| INV-016 | Create service item | 1. Add name, price, type 2. Save | Service item created | |
| INV-017 | Update service item price | 1. Edit price 2. Save | Price updated, existing invoices unaffected | |
| INV-018 | List service items | 1. View service items | All items listed with prices | |

---

## 5. Payments & Payment Gateway

### 5.1 Direct Payments
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| PAY-001 | Record cash payment | 1. Select invoice 2. Record cash payment 3. Enter amount | Payment recorded, invoice updated | |
| PAY-002 | Record card payment | 1. Select invoice 2. Record card payment | Payment recorded | |
| PAY-003 | Record partial payment | 1. Pay less than invoice total | Partial payment recorded, balance remaining | |
| PAY-004 | Record overpayment | 1. Pay more than invoice total | Handle per business rules (error or credit) | |

### 5.2 Razorpay Integration
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| PAY-005 | Create Razorpay order | 1. Initiate online payment 2. Create order | Razorpay order ID returned | |
| PAY-006 | Verify Razorpay payment | 1. Complete Razorpay checkout 2. Verify signature | Payment verified and recorded | |
| PAY-007 | Razorpay payment failure | 1. Initiate payment 2. Cancel on Razorpay | Payment marked as failed | |
| PAY-008 | Razorpay webhook - payment captured | 1. Receive webhook event | Payment status updated automatically | |
| PAY-009 | Razorpay webhook - invalid signature | 1. Send webhook with wrong signature | Webhook rejected | |

### 5.3 Refunds
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| PAY-010 | Process full refund | 1. Select paid invoice 2. Initiate full refund | Refund processed, invoice updated | |
| PAY-011 | Process partial refund | 1. Select paid invoice 2. Refund partial amount | Partial refund recorded | |
| PAY-012 | View payment history | 1. Open invoice 2. View payments | All payments for invoice listed | |

---

## 6. Cash Register

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| CR-001 | Open cash register | 1. Enter opening balance 2. Open register | Register opened with timestamp | |
| CR-002 | Record transaction | 1. Process payment through register | Transaction recorded | |
| CR-003 | Close cash register | 1. Enter closing balance 2. Close register | Register closed, variance calculated | |
| CR-004 | View transaction history | 1. Select register 2. View transactions | All transactions listed | |
| CR-005 | Daily reconciliation report | 1. Select date 2. Generate report | Report with opening, closing, transactions | |
| CR-006 | Close register with variance | 1. Close with different balance than expected | Variance flagged in report | |
| CR-007 | Open already-opened register | 1. Try to open register that's already open | Error or handled gracefully | |

---

## 7. Credit Notes

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| CN-001 | Create credit note | 1. Select patient 2. Enter amount and reason 3. Save | Credit note created | |
| CN-002 | Apply credit note to invoice | 1. Select invoice 2. Apply credit note | Invoice balance reduced | |
| CN-003 | View patient credit notes | 1. Open patient profile 2. View credit notes | All credit notes listed | |
| CN-004 | Create credit note exceeding original | 1. Try to create credit exceeding invoice | Validation error | |

---

## 8. Telemedicine

### 8.1 Video Sessions
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| TM-001 | Create video session | 1. Select appointment 2. Create session | Session created, room token generated | |
| TM-002 | Doctor accepts session | 1. Doctor clicks accept | Session status: active | |
| TM-003 | Patient joins session | 1. Patient clicks join link | Patient enters video room | |
| TM-004 | Doctor joins session | 1. Doctor joins session | Doctor enters video room | |
| TM-005 | End video session | 1. Doctor ends session | Session ended, duration recorded | |
| TM-006 | Cancel video session | 1. Cancel before start | Session cancelled | |

### 8.2 In-Session Features
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| TM-007 | Send chat message | 1. Type message in chat 2. Send | Message delivered in real-time | |
| TM-008 | Share file during session | 1. Upload file 2. Share | File shared with other participant | |
| TM-009 | Recording consent | 1. Request recording consent | Consent prompt shown to patient | |
| TM-010 | Connection event logging | 1. Join/leave session | Events logged with timestamps | |

---

## 9. Prescriptions

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| RX-001 | Create prescription | 1. Select patient 2. Add medications 3. Save | Prescription created | |
| RX-002 | Issue prescription | 1. Create and issue | Prescription status: issued | |
| RX-003 | Update prescription | 1. Edit medication details 2. Save | Prescription updated | |
| RX-004 | Cancel prescription | 1. Select prescription 2. Cancel | Prescription cancelled | |
| RX-005 | View patient prescriptions | 1. Open patient 2. View prescriptions | All prescriptions listed | |
| RX-006 | Doctor views issued prescriptions | 1. Doctor views their prescriptions | Only their prescriptions shown | |

---

## 10. Doctor Management

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| DOC-001 | Create doctor profile | 1. Fill doctor details (specialty, dept) 2. Save | Doctor created | |
| DOC-002 | Update doctor profile | 1. Edit specialization 2. Save | Profile updated | |
| DOC-003 | Assign doctor to department | 1. Select department 2. Save | Doctor assigned | |
| DOC-004 | View doctor's patient list | 1. Open doctor profile 2. View patients | Linked patients listed | |
| DOC-005 | Doctor dashboard statistics | 1. Login as doctor 2. View dashboard | Appointments, patients, revenue shown | |
| DOC-006 | Doctor performance analytics | 1. View doctor analytics | Metrics: appointments, revenue, ratings | |
| DOC-007 | Doctor schedule management | 1. Set availability 2. Save | Schedule updated | |
| DOC-008 | Doctor self-profile update | 1. Doctor edits own profile | Profile updated (limited fields) | |

---

## 11. Staff Management

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| STF-001 | Create staff member | 1. Fill details, assign role 2. Save | Staff created with role | |
| STF-002 | Assign staff to department | 1. Select department 2. Save | Staff assigned | |
| STF-003 | Update staff role | 1. Change role 2. Save | Role updated, permissions changed | |
| STF-004 | Deactivate staff | 1. Deactivate staff member | Access revoked | |
| STF-005 | List staff by role | 1. Filter by role | Matching staff shown | |
| STF-006 | List staff by department | 1. Filter by department | Matching staff shown | |

---

## 12. Clinic Settings & Configuration

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| CLN-001 | Update clinic info | 1. Edit clinic name, address, phone 2. Save | Clinic info updated | |
| CLN-002 | Upload clinic logo | 1. Upload logo image 2. Save | Logo updated (if subscription allows) | |
| CLN-003 | Configure clinic settings | 1. Update configuration 2. Save | Settings saved | |
| CLN-004 | View clinic details | 1. Open clinic settings | All clinic info displayed | |

---

## 13. Branches

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| BR-001 | Create new branch | 1. Enter branch name, address 2. Save | Branch created | |
| BR-002 | Update branch info | 1. Edit branch details 2. Save | Branch updated | |
| BR-003 | List all branches | 1. View branches page | All branches listed | |
| BR-004 | Assign staff to branch | 1. Select branch for staff member | Staff assigned to branch | |
| BR-005 | Delete branch | 1. Delete branch with no active appointments | Branch removed | |
| BR-006 | Delete branch with active data | 1. Try to delete branch with appointments | Error: branch has active data | |

---

## 14. Departments

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| DEP-001 | Create department | 1. Enter department name 2. Save | Department created | |
| DEP-002 | Update department | 1. Edit name/description 2. Save | Department updated | |
| DEP-003 | Assign doctors to department | 1. Add doctors 2. Save | Doctors assigned | |
| DEP-004 | View department analytics | 1. Open department stats | Revenue, appointments, doctors shown | |
| DEP-005 | Delete empty department | 1. Delete department with no staff | Department removed | |

---

## 15. Insurance Management

### 15.1 Insurance Providers
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| INS-001 | Add insurance provider | 1. Enter provider details 2. Save | Provider added | |
| INS-002 | Update provider info | 1. Edit provider 2. Save | Provider updated | |
| INS-003 | List providers | 1. View providers | All providers listed | |

### 15.2 Insurance Claims
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| INS-004 | Create insurance claim | 1. Select patient/invoice 2. Enter claim details 3. Submit | Claim created with "pending" status | |
| INS-005 | Approve claim | 1. Update claim status to approved | Status: "approved" | |
| INS-006 | Reject claim | 1. Update claim status to rejected with reason | Status: "rejected", reason recorded | |
| INS-007 | Mark claim as paid | 1. Record settlement 2. Update status | Status: "paid" | |
| INS-008 | Calculate co-pay | 1. Enter insurance coverage % 2. Calculate | Correct co-pay amount shown | |
| INS-009 | Pre-authorization | 1. Record pre-auth number and details | Pre-auth saved | |
| INS-010 | Insurance claim analytics | 1. View analytics | Claim trends, approval rates shown | |

---

## 16. Payroll & HR

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| PAY-013 | Create salary structure | 1. Enter base salary, allowances 2. Save | Structure created | |
| PAY-014 | Generate payslip | 1. Select staff 2. Select month 3. Generate | Payslip created with calculations | |
| PAY-015 | Approve payslip | 1. Review payslip 2. Approve | Status: approved | |
| PAY-016 | Mark payslip as paid | 1. Record payment 2. Mark paid | Status: paid | |
| PAY-017 | View payroll analytics | 1. Open payroll analytics | Total salary, department-wise breakdown | |
| PAY-018 | View staff salary history | 1. Select staff 2. View history | All payslips listed | |
| PAY-019 | Update salary structure | 1. Edit salary 2. Save | New structure effective, old preserved | |

---

## 17. Queue Management

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| QUE-001 | Add patient to queue | 1. Select checked-in patient 2. Add to queue | Queue entry created | |
| QUE-002 | Call patient from queue | 1. Click call on next patient | Status: "called", patient notified | |
| QUE-003 | Complete queue entry | 1. Mark patient as done | Status: "completed" | |
| QUE-004 | Cancel queue entry | 1. Remove patient from queue | Status: "cancelled" | |
| QUE-005 | View current queue | 1. Open queue view | Ordered list of waiting patients | |
| QUE-006 | No-show in queue | 1. Mark called patient as no-show | No-show recorded | |
| QUE-007 | Queue ordering | 1. Add multiple patients | Queue ordered by arrival/priority | |

---

## 18. Emergency Management

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| EMR-001 | Create emergency session | 1. Enter patient details 2. Create emergency | Emergency session created | |
| EMR-002 | Accept emergency | 1. Doctor accepts emergency | Emergency assigned to doctor | |
| EMR-003 | Start emergency video chat | 1. Initiate video for emergency | Video session started | |
| EMR-004 | Complete emergency | 1. Mark emergency as resolved | Status updated, records saved | |
| EMR-005 | Real-time emergency alert | 1. Create emergency | WebSocket alert sent to available doctors | |
| EMR-006 | Emergency status tracking | 1. View emergency list | All statuses visible and filterable | |

---

## 19. Patient Portal

### 19.1 Appointment Management
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| PP-001 | Patient books appointment | 1. Login as patient 2. Select doctor/date 3. Book | Appointment requested | |
| PP-002 | Patient reschedules appointment | 1. Select appointment 2. Choose new date 3. Save | Appointment rescheduled | |
| PP-003 | Patient cancels appointment | 1. Select appointment 2. Cancel | Appointment cancelled | |
| PP-004 | View upcoming appointments | 1. Open appointments tab | Upcoming appointments listed | |

### 19.2 Medical Records
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| PP-005 | View medical history | 1. Open medical history | Past records displayed | |
| PP-006 | View prescriptions | 1. Open prescriptions tab | All prescriptions listed | |
| PP-007 | Download invoice PDF | 1. Select invoice 2. Download | PDF downloaded | |

### 19.3 Patient Self-Service
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| PP-008 | Initiate payment | 1. Select unpaid invoice 2. Pay | Payment flow initiated | |
| PP-009 | View financial summary | 1. Open financial tab | Balance, payments, ledger shown | |
| PP-010 | Submit review | 1. Rate doctor 2. Write review 3. Submit | Review submitted | |
| PP-011 | Manage consent | 1. View consents 2. Approve/revoke | Consent updated | |
| PP-012 | Update profile | 1. Edit personal info 2. Save | Profile updated | |
| PP-013 | Browse doctors | 1. View doctors list | Doctors with specialties shown | |
| PP-014 | Browse departments | 1. View departments | Departments listed | |
| PP-015 | Share medical records | 1. Generate share token | Token created for sharing | |
| PP-016 | View access logs | 1. Open access log | Record of who accessed data | |
| PP-017 | View credit notes | 1. Open credit notes tab | Credit notes listed | |
| PP-018 | Guardian manages multiple patients | 1. Login as guardian 2. Switch between patients | Can manage linked patients | |

---

## 20. Integrations

### 20.1 Integration Management
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| INT-001 | Add integration credentials | 1. Select integration (RioView/RomExis) 2. Enter credentials 3. Save | Credentials stored (encrypted) | |
| INT-002 | Test connection | 1. Click test connection | Connection status returned | |
| INT-003 | Trigger manual sync | 1. Click sync now | Sync initiated, progress shown | |
| INT-004 | Disable integration | 1. Toggle integration off | Integration disabled | |
| INT-005 | View sync logs | 1. Open sync logs | Log entries with status/timestamps | |
| INT-006 | View synced patient data | 1. Open patient 2. View synced data | External data displayed | |
| INT-007 | Integration with invalid credentials | 1. Enter wrong credentials 2. Test | Connection failed error | |

---

## 21. Notifications

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| NTF-001 | Receive appointment notification | 1. Book/confirm appointment | Notification created for relevant users | |
| NTF-002 | Receive billing notification | 1. Create invoice for patient | Patient notified | |
| NTF-003 | View unread count | 1. Check notification bell | Correct unread count shown | |
| NTF-004 | Mark notification as read | 1. Click on notification | Marked as read, count decremented | |
| NTF-005 | Mark all as read | 1. Click "mark all read" | All notifications marked read | |
| NTF-006 | Delete notification | 1. Delete a notification | Notification removed | |
| NTF-007 | Push notification (mobile) | 1. Trigger notification event | FCM push received on mobile | |
| NTF-008 | Real-time notification | 1. Trigger event | WebSocket delivers notification instantly | |

---

## 22. Analytics & Dashboard

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| ANL-001 | Dashboard summary | 1. Open dashboard | Key metrics: patients, appointments, revenue | |
| ANL-002 | Revenue trends | 1. Open revenue analytics 2. Select date range | Revenue chart displayed | |
| ANL-003 | Appointment trends | 1. View appointment analytics | Volume and pattern charts | |
| ANL-004 | Doctor performance | 1. View doctor analytics | Performance metrics per doctor | |
| ANL-005 | No-show analysis | 1. View no-show report | No-show rates and patterns | |
| ANL-006 | Insurance analytics | 1. View insurance report | Claim trends, approval rates | |
| ANL-007 | Telemedicine usage | 1. View telemedicine analytics | Session counts, duration, adoption | |
| ANL-008 | Patient growth | 1. View patient analytics | Growth trends over time | |
| ANL-009 | Integration usage | 1. View integration metrics | Sync frequency, success rates | |
| ANL-010 | Filter analytics by branch | 1. Select branch filter | Analytics scoped to branch | |
| ANL-011 | Filter analytics by date range | 1. Set custom date range | Data filtered accordingly | |

---

## 23. Consent Management

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| CON-001 | Create consent request | 1. Select patient 2. Select consent type 3. Create | Consent request created | |
| CON-002 | Patient approves consent | 1. Patient views consent 2. Approves | Status: approved, timestamp recorded | |
| CON-003 | Patient revokes consent | 1. Patient revokes previously approved consent | Status: revoked, audit logged | |
| CON-004 | View consent audit trail | 1. Open consent history | All changes with timestamps shown | |
| CON-005 | Medical procedure consent | 1. Create procedure-specific consent | Procedure consent recorded | |
| CON-006 | Data sharing consent | 1. Create data sharing consent | Data consent tracked | |

---

## 24. Treatment Records

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| TR-001 | Create treatment record | 1. Select patient 2. Enter treatment details 3. Save | Record created | |
| TR-002 | Add consultation notes | 1. Enter diagnosis and notes 2. Save | Notes saved | |
| TR-003 | Upload attachment | 1. Upload X-ray/image 2. Save | Attachment linked to record | |
| TR-004 | Create follow-up | 1. Mark treatment for follow-up 2. Set date | Follow-up scheduled | |
| TR-005 | View treatment history | 1. Open patient 2. View treatments | All treatments listed chronologically | |
| TR-006 | Update treatment record | 1. Edit existing record 2. Save | Record updated | |

---

## 25. Legacy Data Upload

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| LDU-001 | Upload patient CSV | 1. Prepare CSV 2. Upload | Data imported, count shown | |
| LDU-002 | Upload with validation errors | 1. Upload CSV with invalid data | Errors listed, valid rows imported | |
| LDU-003 | Upload duplicate records | 1. Upload CSV with existing patients | Duplicates handled per rules | |
| LDU-004 | View upload status | 1. Check upload history | Status: processing/completed/failed | |
| LDU-005 | Large file upload | 1. Upload file with 1000+ records | Processed via background job | |

---

## 26. Subscription Management

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| SUB-001 | View current plan | 1. Open subscription page | Current plan and features shown | |
| SUB-002 | Upgrade plan | 1. Select higher plan 2. Confirm | Plan upgraded, new features unlocked | |
| SUB-003 | Downgrade plan | 1. Select lower plan 2. Confirm | Plan downgraded, features restricted | |
| SUB-004 | Trial to active | 1. Complete trial period 2. Subscribe | Status: active | |
| SUB-005 | Subscription expired | 1. Let subscription lapse | Status: grace period, then suspended | |
| SUB-006 | Feature access by plan | 1. Access feature not in current plan | Feature blocked with upgrade prompt | |
| SUB-007 | Add-on purchase | 1. Purchase SMS/telehealth add-on | Add-on activated | |

---

## 27. Platform Management (Product Owner)

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| PLT-001 | View all tenants | 1. Login as Product Owner 2. List clinics | All tenants listed | |
| PLT-002 | Provision new tenant | 1. Create new clinic 2. Configure | Tenant database created | |
| PLT-003 | Manage feature flags | 1. Toggle feature flag 2. Save | Feature enabled/disabled globally | |
| PLT-004 | View tenant audit logs | 1. Select tenant 2. View logs | Audit trail shown | |
| PLT-005 | Platform user management | 1. Create/edit platform users | Platform users managed | |
| PLT-006 | Health check | 1. Call /health endpoint | System status returned | |

---

## 28. Public Routes

| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| PUB-001 | View clinic listing | 1. Access public clinic list (no auth) | Clinics listed | |
| PUB-002 | View plan information | 1. Access public plans page | Plans with features shown | |
| PUB-003 | Browse doctors publicly | 1. View public doctor list | Doctor names, specialties shown | |
| PUB-004 | View department info | 1. Access public departments | Department info displayed | |
| PUB-005 | Public registration | 1. Register through public page | Account created | |

---

## 29. Mobile App

### 29.1 Core Mobile Features
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| MOB-001 | Login on mobile | 1. Enter credentials 2. Login | Authenticated, token stored | |
| MOB-002 | Biometric login | 1. Enable fingerprint/face ID 2. Login with biometric | Authenticated via biometric | |
| MOB-003 | Book appointment (mobile) | 1. Select doctor/date 2. Book | Appointment created | |
| MOB-004 | View appointments (mobile) | 1. Open appointments tab | List of appointments shown | |
| MOB-005 | View prescriptions (mobile) | 1. Open prescriptions | Prescriptions displayed | |
| MOB-006 | Make payment (mobile) | 1. Select invoice 2. Pay via Razorpay | Payment processed | |
| MOB-007 | Receive push notification | 1. Trigger notification event | Push notification received | |
| MOB-008 | Join video consultation (mobile) | 1. Accept teleconsult 2. Join | WebRTC video session started | |
| MOB-009 | Real-time updates (mobile) | 1. Trigger status change | Socket.io delivers update | |
| MOB-010 | Offline data access | 1. Open app offline | Cached data shown (MMKV storage) | |

### 29.2 Mobile-Specific
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| MOB-011 | iOS build and launch | 1. Build iOS app 2. Launch | App runs correctly on iOS | |
| MOB-012 | Android build and launch | 1. Build Android app 2. Launch | App runs correctly on Android | |
| MOB-013 | Deep linking | 1. Open app via deep link | Correct screen opened | |
| MOB-014 | App background/foreground | 1. Minimize app 2. Reopen | State preserved, socket reconnected | |
| MOB-015 | Session expiry on mobile | 1. Let token expire 2. Use app | Redirect to login | |

---

## Cross-Cutting / Non-Functional Test Cases

### Security
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| SEC-001 | SQL/NoSQL injection | 1. Enter malicious input in fields | Input sanitized, no injection | |
| SEC-002 | XSS prevention | 1. Enter script tags in text fields | Scripts escaped, not executed | |
| SEC-003 | CSRF protection | 1. Attempt cross-site request | Request blocked | |
| SEC-004 | Rate limiting | 1. Send 100+ requests rapidly | Rate limit triggered (429) | |
| SEC-005 | Tenant data isolation | 1. Login to Clinic A 2. Try to access Clinic B data | Access denied, data isolated | |
| SEC-006 | Password hashing | 1. Check database | Passwords stored hashed, not plaintext | |
| SEC-007 | Helmet security headers | 1. Check response headers | Security headers present | |

### Performance
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| PERF-001 | Page load time | 1. Navigate to dashboard | Loads within acceptable time | |
| PERF-002 | Large patient list | 1. Load clinic with 10,000+ patients | Pagination works, no timeout | |
| PERF-003 | Concurrent WebSocket connections | 1. Connect 50+ users simultaneously | All connections maintained | |
| PERF-004 | Background job processing | 1. Trigger bulk operation | BullMQ processes without blocking | |

### Multi-Tenancy
| TC# | Test Case | Steps | Expected Result | Status |
|-----|-----------|-------|-----------------|--------|
| MT-001 | Tenant resolution | 1. Login to specific clinic | Correct tenant DB connected | |
| MT-002 | Cross-tenant data leak | 1. Manipulate tenant ID in request | Access denied | |
| MT-003 | Concurrent tenant operations | 1. Two clinics operate simultaneously | No data mixing | |

---

## Summary

| Module | Test Cases |
|--------|-----------|
| Authentication & Authorization | 19 |
| Patient Management | 17 |
| Appointments & Scheduling | 18 |
| Billing & Invoicing | 18 |
| Payments & Payment Gateway | 12 |
| Cash Register | 7 |
| Credit Notes | 4 |
| Telemedicine | 10 |
| Prescriptions | 6 |
| Doctor Management | 8 |
| Staff Management | 6 |
| Clinic Settings | 4 |
| Branches | 6 |
| Departments | 5 |
| Insurance Management | 10 |
| Payroll & HR | 7 |
| Queue Management | 7 |
| Emergency Management | 6 |
| Patient Portal | 18 |
| Integrations | 7 |
| Notifications | 8 |
| Analytics & Dashboard | 11 |
| Consent Management | 6 |
| Treatment Records | 6 |
| Legacy Data Upload | 5 |
| Subscription Management | 7 |
| Platform Management | 6 |
| Public Routes | 5 |
| Mobile App | 15 |
| Security | 7 |
| Performance | 4 |
| Multi-Tenancy | 3 |
| **TOTAL** | **~262** |
