# BestoClinic - Complete Features Listing

## Tech Stack
- **Backend:** Node.js / Express (v18+), MongoDB (multi-tenant)
- **Frontend:** React 19 + Vite, Tailwind CSS, Recharts
- **Mobile:** React Native (iOS & Android) with TypeScript
- **Real-time:** Socket.io (WebSocket)
- **Authentication:** JWT with Role-Based Access Control (RBAC)
- **Payment Gateway:** Razorpay
- **Queue System:** BullMQ (background jobs)
- **Caching/Sessions:** Redis
- **Logging:** Winston with daily rotation

---

## Roles (12+)

| # | Role | Description |
|---|------|-------------|
| 1 | Product Owner | Platform-level admin, tenant management, feature flags |
| 2 | Super Admin | Full clinic-level access, system configuration |
| 3 | Admin | Clinic administration, user management |
| 4 | Manager | Clinic operations oversight, reporting |
| 5 | Department Manager | Department-level operations, staff oversight |
| 6 | Doctor | Patient consultations, treatment records, prescriptions |
| 7 | Receptionist | Patient check-in, appointment scheduling, queue |
| 8 | Support Staff | Patient assistance, front-desk operations |
| 9 | Billing Officer | Invoice creation, payment processing |
| 10 | Accountant | Financial reporting, reconciliation |
| 11 | HR/Payroll Manager | Salary management, payslip generation |
| 12 | IT Support | System maintenance, technical support |
| 13 | Patient | Self-service portal, appointments, payments |
| 14 | Guardian | Manage multiple linked patients |

---

## Features by Module

### 1. Authentication & Authorization
- Multi-tenant JWT authentication
- Login / Logout / Registration
- Role-based access control (RBAC) with 12+ roles
- Permission-based endpoint authorization
- Feature guards based on subscription tier
- Token expiry and refresh handling

### 2. Patient Management
- Patient registration with demographics (name, DOB, gender, contact)
- Medical history tracking (allergies, medications, conditions)
- Blood group and insurance information storage
- Emergency contact and guardian linking
- Patient search by name, phone, or ID
- Soft delete with historical data preservation
- External data sync (RioView, RomExis integration)
- Patient-doctor relationship management

### 3. Appointments & Scheduling
- Appointment booking (consultation, follow-up, procedure, emergency, teleconsult)
- Full lifecycle: requested > confirmed > checked-in > in-progress > completed
- Cancellation with reason tracking
- No-show marking and tracking
- Rescheduling support
- Duration and time slot management
- Filtering by date, doctor, status, and type
- Reminder system integration
- Invoice linking to appointments

### 4. Billing & Invoicing
- Invoice creation with line items (treatment, medicine, equipment, lab, consultation)
- GST/Tax management (CGST, SGST, IGST, cess)
- Promotion codes and discount application
- Invoice lifecycle: draft > sent > paid > partially paid > overdue > cancelled > refunded
- Sequential invoice numbering per tenant
- Service item management with configurable pricing
- Invoice PDF generation and download

### 5. Financial Management
- Revenue trends and analytics
- Doctor-wise revenue breakdown
- Outstanding balance tracking
- Patient ledger with full financial history
- Advance payment recording
- Ledger adjustments with audit trail
- Multi-currency support (default INR)
- Financial audit logging

### 6. Payments & Payment Gateway
- Direct payment recording (cash, card, etc.)
- Razorpay integration (order creation, checkout, verification)
- Payment webhooks for real-time status updates
- Full and partial refund processing
- Payment status tracking
- Invoice-specific payment history
- Patient-initiated payment support

### 7. Cash Register Management
- Cash register open/close operations
- Opening and closing balance tracking
- Transaction recording and reconciliation
- Daily reconciliation reports
- Variance calculation and flagging
- Multiple register support across branches

### 8. Credit Note Management
- Credit note creation with reason
- Application of credit notes to patient invoices
- Refund tracking via credit notes
- Patient-wise credit note listing and viewing

### 9. Telemedicine
- Video consultation sessions via WebRTC
- Session lifecycle: create > accept > join > end > cancel
- Real-time in-session chat messaging
- File sharing during consultations
- Recording consent management
- Connection event logging with timestamps
- Room token generation for video rooms
- Patient-doctor interaction tracking

### 10. Prescription Management
- Create and issue prescriptions with medications
- Prescription status tracking (active, issued, cancelled)
- Update and cancel prescriptions
- Patient prescription history
- Doctor-issued prescription listing

### 11. Doctor Management
- Doctor profile creation (name, specialty, qualifications)
- Department and branch assignment
- Schedule / availability management
- Patient list per doctor
- Doctor performance analytics and metrics
- Doctor-specific revenue tracking
- Doctor self-service dashboard with statistics
- Consultation lifecycle management

### 12. Staff Management
- Staff creation with role assignment
- Department and branch assignment
- User profile management and editing
- Staff listing with filtering by role/department
- Staff activation/deactivation
- Permission management based on role

### 13. Clinic Settings & Configuration
- Clinic information management (name, address, phone, email)
- Clinic branding and logo (subscription-dependent)
- Clinic-level configuration and customization
- Clinic detail viewing

### 14. Branch Management
- Multi-branch clinic support
- Branch creation with name and address
- Branch-level configurations
- Branch-specific appointments and invoices
- Staff assignment to branches
- Branch deletion (with data safety checks)

### 15. Department Management
- Department creation and editing
- Doctor assignment to departments
- Department-specific analytics (revenue, appointments)
- Department hierarchy and listing

### 16. Insurance Management
- Insurance provider database management
- Insurance claim creation and submission
- Claim status tracking: pending > approved > rejected > paid
- Co-pay calculation based on coverage percentage
- Pre-authorization recording and tracking
- Settlement reconciliation
- Insurance claim analytics (trends, approval rates)

### 17. Payroll & HR
- Salary structure creation (base salary, allowances, deductions)
- Monthly/periodic payslip generation
- Payslip approval workflow
- Payment marking and tracking
- Payroll analytics and reporting
- Staff salary history viewing
- Salary structure versioning

### 18. Queue Management
- Smart patient queue system
- Queue entry creation for checked-in patients
- Patient call and completion tracking
- Queue statuses: waiting > called > completed > cancelled
- Current queue view with ordering
- No-show tracking in queue
- Real-time queue updates

### 19. Emergency & Crisis Management
- Emergency session creation with patient details
- Emergency acceptance and doctor assignment
- Emergency video chat initiation
- Emergency status tracking and resolution
- Real-time WebSocket alerts to available doctors
- Emergency session listing and filtering

### 20. Patient Portal (Self-Service)
- Patient dashboard with overview
- Appointment booking, rescheduling, and cancellation
- Medical history and treatment record viewing
- Prescription access and viewing
- Payment initiation and financial summary
- Patient ledger viewing
- Insurance information upload
- Doctor and department browsing
- Review and rating submission for doctors
- Consent management (approve/revoke)
- Credit note viewing
- Invoice PDF download
- Share tokens for medical record sharing
- Access log viewing (who accessed your data)
- Profile management (patient and guardian)
- Guardian multi-patient support

### 21. Integrations
- External system integration framework
- RioView integration (dental management)
- RomExis integration (dental management)
- Credential storage with encryption
- Manual sync triggering
- Integration status monitoring
- Test connection validation
- Integration enable/disable toggle
- Sync log tracking and history

### 22. Integration Data Viewer
- Sync log history with details
- Integration status summary
- Patient-synced data viewing
- Data reconciliation tracking
- Audit trail for all integration operations

### 23. Notifications
- In-app notification system
- Notification types: appointment, billing, system alerts
- Unread notification count badge
- Mark as read (individual and bulk)
- Notification deletion
- Push notifications via Firebase Cloud Messaging (FCM)
- Real-time delivery via WebSocket

### 24. Analytics & Dashboard
- Dashboard summary with key metrics
- Revenue trends (time-based charts)
- Appointment trends (volume and patterns)
- Doctor performance metrics
- No-show analysis and rate tracking
- Insurance analytics (claim trends, success rates)
- Telemedicine usage metrics
- Patient growth trends
- Integration performance metrics
- Filtering by branch and date range

### 25. Consent Management
- Consent creation for medical procedures
- Data sharing consent tracking
- Consent approval and revocation by patients
- Full audit trail for consent changes
- Consent status tracking with timestamps

### 26. Treatment Records
- Treatment documentation and notes
- Doctor consultation notes entry
- Follow-up creation and scheduling
- Attachment uploads (X-rays, images, documents)
- Treatment history per patient (chronological)
- Treatment record editing and updating

### 27. Legacy Data Upload
- Bulk patient data import via CSV
- Historical data migration support
- Data validation during import
- Upload status tracking (processing/completed/failed)
- Import error handling and reporting
- Background processing for large files (via BullMQ)

### 28. Roles & Permissions Viewer
- Read-only role listing
- Permission listing per role
- Dynamic permission assignment view

### 29. Subscription Management (SaaS)
- Multi-plan support: Free, Starter, Professional, Enterprise
- Plan-based feature allocation and toggles
- Subscription status lifecycle: trial > active > grace period > cancelled > suspended
- Feature access control based on subscription tier
- Add-on pricing (SMS, telehealth, API access, advanced reports)
- Plan upgrade and downgrade support

### 30. Platform Management (Product Owner)
- Tenant (clinic) provisioning and onboarding
- Provisioning status tracking
- Platform user management
- Feature flag management (global enable/disable)
- Tenant audit logging
- Clinic listing and monitoring
- Health check endpoint

### 31. Public Routes (No Authentication)
- Public clinic listing and browsing
- Plan information and comparison
- Public doctor browsing (name, specialty)
- Public department information
- Patient/clinic registration endpoints

### 32. Real-time Communication (WebSocket)
- Real-time notification delivery
- Emergency alerts broadcast to doctors
- Telemedicine in-session chat
- Queue status updates
- Connection management and reconnection

### 33. Mobile App (React Native)
- iOS and Android native builds
- Patient appointment booking and management
- Prescription viewing
- Payment processing via Razorpay
- Push notifications via FCM
- Biometric authentication (fingerprint / Face ID)
- Local storage with MMKV
- WebRTC video consultations
- Socket.io real-time updates
- Offline data access (cached data)
- Deep linking support

---

## Database Models (40+ Collections)

### Tenant-Level Models
| # | Model | Purpose |
|---|-------|---------|
| 1 | Patient | Patient profiles and demographics |
| 2 | Appointment | Appointment scheduling and tracking |
| 3 | Invoice | Billing and invoicing |
| 4 | Payment | Payment records |
| 5 | User | Staff and user accounts |
| 6 | TreatmentRecord | Treatment documentation |
| 7 | ServiceItem | Billable services and pricing |
| 8 | Branch | Clinic branches |
| 9 | Department | Clinic departments |
| 10 | Prescription | Medication prescriptions |
| 11 | Consent | Patient consent records |
| 12 | InsuranceProvider | Insurance provider database |
| 13 | InsuranceClaim | Insurance claim tracking |
| 14 | Notification | In-app notifications |
| 15 | Payslip | Salary payslips |
| 16 | SalaryStructure | Staff salary configurations |
| 17 | CashRegister | Cash register operations |
| 18 | QueueEntry | Patient queue entries |
| 19 | ChatMessage | Telemedicine chat messages |
| 20 | EmergencySession | Emergency session records |
| 21 | VideoSession | Telemedicine video sessions |
| 22 | CreditNote | Credit note records |
| 23 | Review | Patient reviews and ratings |
| 24 | ShareToken | Medical record sharing tokens |
| 25 | AccessLog | Data access audit logs |
| 26 | PatientLedger | Patient financial ledger |
| 27 | LegacyUpload | Bulk data import records |
| 28 | IntegrationCredential | Encrypted integration credentials |
| 29 | SyncLog | Integration sync history |
| 30 | FinancialAuditLog | Financial audit trail |

### Platform-Level Models
| # | Model | Purpose |
|---|-------|---------|
| 1 | Clinic | Tenant/clinic registration |
| 2 | Subscription | Subscription plans and status |
| 3 | PlatformUser | Platform admin accounts |
| 4 | ProvisioningStatus | Tenant setup tracking |
| 5 | Plan | Available subscription plans |
| 6 | Integration | Integration definitions |
| 7 | Rebate | Rebate/discount records |
| 8 | FeatureFlag | Global feature toggles |
| 9 | TenantAuditLog | Tenant-level audit trail |

---

## API Endpoints (34 Route Modules)

| # | Route | Module |
|---|-------|--------|
| 1 | `/api/v1/auth` | Authentication |
| 2 | `/api/v1/patients` | Patient Management |
| 3 | `/api/v1/appointments` | Appointments |
| 4 | `/api/v1/invoices` | Invoicing |
| 5 | `/api/v1/payments` | Payments |
| 6 | `/api/v1/billing` | Billing |
| 7 | `/api/v1/cash-register` | Cash Register |
| 8 | `/api/v1/credit-notes` | Credit Notes |
| 9 | `/api/v1/doctors` | Doctor Management |
| 10 | `/api/v1/staff` | Staff Management |
| 11 | `/api/v1/insurance` | Insurance |
| 12 | `/api/v1/payroll` | Payroll |
| 13 | `/api/v1/prescriptions` | Prescriptions |
| 14 | `/api/v1/consent` | Consent Management |
| 15 | `/api/v1/telemedicine` | Video Consultations |
| 16 | `/api/v1/queue` | Queue Management |
| 17 | `/api/v1/emergency` | Emergency Management |
| 18 | `/api/v1/notifications` | Notifications |
| 19 | `/api/v1/clinic` | Clinic Settings |
| 20 | `/api/v1/branches` | Branch Management |
| 21 | `/api/v1/departments` | Department Management |
| 22 | `/api/v1/users` | User Management |
| 23 | `/api/v1/dashboard` | Dashboard Analytics |
| 24 | `/api/v1/analytics` | Advanced Analytics |
| 25 | `/api/v1/integrations` | Integration Management |
| 26 | `/api/v1/integration-data` | Integration Data Viewer |
| 27 | `/api/v1/portal` | Patient Portal |
| 28 | `/api/v1/doctor` | Doctor Dashboard |
| 29 | `/api/v1/subscriptions` | Subscription Management |
| 30 | `/api/v1/legacy-uploads` | Legacy Data Import |
| 31 | `/api/v1/roles` | Role Viewer |
| 32 | `/api/v1/public` | Public Endpoints |
| 33 | `/api/v1/platform` | Platform/Product Owner |
| 34 | `/health` | Health Check |

---

## Architecture Highlights

- **Multi-Tenancy:** Complete data isolation per clinic with shared platform database
- **Real-time:** WebSocket for instant notifications, emergency alerts, and telemedicine chat
- **Background Jobs:** BullMQ workers for async operations (email, reports, data sync)
- **Feature Flags:** Subscription-based feature toggles per tenant
- **Audit Logging:** Financial audit trail, tenant audit logs, access logs
- **Data Validation:** Joi schema validation on all API endpoints
- **Security:** JWT auth, RBAC, Helmet security headers, rate limiting
- **Soft Deletes:** Historical data preservation across models
- **Tax Engine:** GST/HST calculations with CGST, SGST, IGST, cess support

---

## File Structure

```
/src
  /modules         - 33 feature modules (controller, service, validator, routes)
  /models          - 40+ MongoDB schemas
  /middleware      - Auth, authorization, tenant resolution, validation, feature guards
  /services        - Business logic, integration adapters
  /config          - Constants, permissions, environment, Redis config
  /db              - Platform & tenant DB connection management
  /utils           - Logger, API response helpers, error handling, async handlers
  /jobs            - Background workers (BullMQ)
  /websocket       - Real-time handlers and middleware
  /routes          - Main route registry

/website           - React marketing/landing page
/BestoClinicMobile - React Native mobile app (iOS + Android)
```
