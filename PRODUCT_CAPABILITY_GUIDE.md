# BestoClinic — Product Capability Guide

**A multi-tenant practice management platform for outpatient clinics.**

Every module described here is built and running in the codebase. This guide
documents what exists, not a roadmap.

| | |
|---|---|
| Modules | **48** |
| API endpoints | **392** |
| Tenant data models | **53** |
| Staff roles | **12** |
| Named permissions | **140+** |

---

## 1. Is this only for dental clinics?

**No. Forty-seven of the forty-eight modules are specialty-agnostic.** Dentistry is
one optional layer on top of a general outpatient platform — not the foundation it
is built on.

Measured directly from the codebase:

| Measure | Dental-specific | Total |
|---|---|---|
| Modules containing dental logic | **1** (`dentalScan`) | 48 |
| Tenant data models | **2** (both belong to that module) | 53 |
| Fields on the clinical record | **1** — an optional tooth chart | — |

Appointments, patient records, prescriptions, billing, insurance, payroll,
inventory, queueing, telemedicine, consent and analytics carry **no notion of teeth
anywhere in their logic**. A dermatology, ophthalmology, physiotherapy, paediatric
or general practice clinic would use the same code paths a dental clinic uses today.

### What a non-dental clinic gives up

The dental scan module, its two imaging integrations, and the tooth chart on the
consultation form. **That is the entire list.** Nothing else is withheld, and
nothing else needs rewriting.

### The honest counterpoint

Naming and presentation, not architecture:

- The product is called **BestoClinic**
- The public patient-facing marketplace is written around **finding a dentist**
- Both shipped imaging connectors (**Romexis**, **RioView**) are dental systems

These are copy and configuration. But a non-dental prospect will meet them before
they meet the platform underneath, so consider re-skinning the marketplace before
selling outside dentistry.

---

## 2. What it is, and what it is not

| Setting | Fit | Why |
|---|---|---|
| Single-site clinic | **Strong fit** | Full front office, clinical, billing and staff management out of the box |
| Multi-branch clinic group | **Strong fit** | Branches and departments are first-class; staff, schedules, stock and revenue are all branch-aware |
| Polyclinic / day-care centre | **Strong fit** | Departments, queueing, multi-doctor scheduling and consultation templates cover mixed-specialty outpatient work |
| Outpatient dept. of a hospital | **Workable** | Handles OPD flow well, but plugs in alongside a hospital system rather than replacing it |
| Full hospital with inpatients | **Not covered** | No admissions, beds, wards, discharge, operation theatre, pharmacy dispensing, radiology or laboratory ordering |

This is an **outpatient platform**, described that way deliberately: the inpatient
concepts a hospital would look for are genuinely absent from the codebase. Selling
into a hospital means selling to the outpatient department, and saying so plainly.

---

## 3. The complete module catalogue

All 48 modules, grouped by the part of a clinic they serve.

### Front office and scheduling — 9 modules

| Module | What it does | Benefit to the clinic |
|---|---|---|
| `appointment` | Booking, rescheduling, cancellation, check-in, no-show marking, full visit lifecycle | One source of truth for the day's schedule, replacing paper diaries and phone logs |
| `schedule` | Per-doctor working hours, leave requests and approvals, day-level overrides | Booking knows who is actually available, so reception stops double-booking absent doctors |
| `conflictResolution` | Detects appointments colliding with newly approved leave or schedule changes | Affected patients are identified immediately instead of discovered on the day |
| `queue` | Live waiting-room queue with priority, reordering, swapping, calling, completion | Walk-ins and delays managed in real time; patients called in a defensible order |
| `bookingPolicy` | Clinic-level rules governing how and when appointments may be booked | The clinic's rules are enforced by the system rather than remembered by staff |
| `holiday` | Clinic closure calendar feeding availability and slot generation | No bookings land on days the clinic is shut |
| `calendarFeed` | Subscribable feeds so schedules appear in external calendar apps | Doctors see their clinic day in the calendar they already use |
| `branch` | Multi-location management with per-branch overview and configuration | A growing group runs several sites from one account |
| `department` | Departmental structure used across staffing, scheduling and reporting | Mixed-specialty clinics organise doctors and reporting by discipline |

### Clinical care — 9 modules

| Module | What it does | Benefit to the clinic |
|---|---|---|
| `patient` | Demographics, contact details, medical history, blood group, emergency contact, primary doctor | The clinical spine — every other module hangs off it |
| `prescription` | Prescription issuing and history, linked to the visit that produced it | Legible, retrievable prescribing history instead of carbon copies |
| `consent` | Consent capture, versioning and revocation, including guardian consent for minors | A defensible record of who agreed to what and when |
| `consultationTemplate` | Reusable consultation forms for consistent recording | Structured notes that can be reported on, rather than free text |
| `careReminder` | Post-treatment care plans as scheduled tasks, with compliance tracking and a patient-level summary | Aftercare is followed up systematically; non-adherence is visible early |
| `emergency` | Emergency session handling — accept, decline, end, cancel | Urgent contact is routed and logged rather than handled ad hoc |
| `dentalScan` **(dental only)** | Guided multi-angle intraoral capture, per-frame quality validation, AI-assisted analysis | The one genuinely dental capability — a differentiator for dental clinics |
| `integration` **(dental only)** | Connectors to external imaging systems with credential storage, testing and sync | Existing imaging hardware keeps working |
| `integrationViewer` | Read-only view of data pulled from connected systems | Clinicians see imported study data without leaving the patient record |

### Billing and revenue — 7 modules

| Module | What it does | Benefit to the clinic |
|---|---|---|
| `billing` | Service catalogue, charge capture, revenue reporting | Consistent pricing and a clear view of what the clinic actually earned |
| `invoice` | Invoice generation, retrieval, PDF export; void as a soft-delete cascading to pending payments | Patients get a proper document; the clinic gets an auditable trail |
| `payment` | Payment recording and online collection via gateway, with signature-verified webhooks | Patients pay online; reconciliation stops depending on memory |
| `creditNote` | Credit note issue, apply, per-patient history | Refunds and adjustments handled correctly instead of by editing invoices |
| `cashRegister` | Shift open/close, reconciliation, per-session transaction list | Cash accounted for per shift, so discrepancies surface the same day |
| `insurance` | Provider directory plus full claim lifecycle — pre-auth, submission, status, co-pay, reconciliation | Claims tracked to settlement rather than lost between clinic and insurer |
| `payroll` | Salary structures, payslip generation, approval, payment marking | Staff pay runs inside the same system that holds roles and attendance |

### Stock and procurement — 2 modules

| Module | What it does | Benefit to the clinic |
|---|---|---|
| `inventory` | Item catalogue, stock movements, low-stock alerts, expiry tracking | Consumables do not run out mid-list; expired stock caught before use |
| `purchaseOrder` | Vendor records and purchase orders through status to delivery or cancellation | Ordering is traceable; spend per vendor becomes visible |

### People and access control — 5 modules

| Module | What it does | Benefit to the clinic |
|---|---|---|
| `auth` | Sign-in by clinic code or email, token refresh, password reset, device registration, logout | Staff and patients reach the right clinic without handling an internal identifier |
| `role` | 12 staff roles over 140+ named permissions, editable per clinic | A receptionist sees the queue, not payroll — access matches the job |
| `staff` | Non-clinical staff records, role assignment, lifecycle | Onboarding and offboarding are controlled actions, not a shared password |
| `doctor` | Doctor profiles, specialisations, availability, leave | The clinical roster that scheduling, booking and public listings read from |
| `user` | Underlying account records shared by every role in the tenant | One identity per person, whichever portal they use |

### Patient-facing — 4 modules

| Module | What it does | Benefit to the clinic |
|---|---|---|
| `patientPortal` | The largest module: appointments, prescriptions, medical history, payments and invoices, consents, care tasks, reviews, record sharing, access logs — and dependants, so a guardian manages a family from one login | Routine questions stop arriving by phone; families self-serve. Every request is ownership-checked, so one patient can never read another's record |
| `telemedicine` | Video consultations with in-session chat, file sharing, session lifecycle | Follow-ups happen remotely, adding capacity without adding chairs |
| `public` | Unauthenticated surface: clinic and doctor discovery, plan listings, registration, guest scan entry | The acquisition front door — patients find the clinic and book without an account |
| `featuredDoctor` | Promoted doctor placements in public discovery | A lever for the platform operator to sell visibility to clinics |

### Recruitment — 1 module

| Module | What it does | Benefit to the clinic |
|---|---|---|
| `jobPortal` | Job postings, public careers board, applications with resume upload, applicant management — metered by a credit balance | Clinics hire without a third-party job board; the platform earns per posting |

### Insight and oversight — 6 modules

| Module | What it does | Benefit to the clinic |
|---|---|---|
| `analytics` | Revenue, appointment, patient-growth, doctor-performance, no-show, insurance and telemedicine trends, plus compliance | The owner sees which doctors, services and hours actually make money |
| `dashboard` | Headline operational figures for the clinic day | The morning glance that says whether today is under control |
| `doctorDashboard` | A doctor's own schedule, patients, care tasks, leave, overrides, profile | Clinicians manage their own day without going through reception |
| `globalSearch` | One search across patients, doctors, staff, appointments, invoices, prescriptions, branches, departments and stock — filtered by the searcher's permissions | Staff find records in seconds, and search cannot become a back door to data they may not see |
| `notification` | In-app notification centre with unread counts and read state | The clinic is told what changed without anyone having to check |
| `monitoring` | Health and readiness probes plus a live report of unconfigured dependencies | A feature that cannot work says so, instead of failing silently in front of a customer |

### Platform operator tools — 5 modules

| Module | What it does | Benefit to the operator |
|---|---|---|
| `productOwner` | Tenant provisioning, suspend/reactivate, feature overrides, plan management, custom pricing, promotions, rebates, feature flags, platform users, and revenue/MRR/churn/adoption analytics | What makes it a sellable SaaS rather than software installed per clinic |
| `subscription` | Plans, usage against limits, quoting, self-service upgrade, scheduled downgrade, billing lifecycle | Clinics upgrade themselves; plan limits enforced by the platform, not by trust |
| `credit` | Credit wallet, packs, purchase, transaction history | A second revenue line for metered extras alongside the subscription |
| `clinic` | Clinic profile, branding, settings | The clinic's own identity on documents and patient-facing screens |
| `legacyUpload` | Bulk import of existing records with a staged processing step | Removes the biggest sales objection: "we already have years of data" |

---

## 4. Why the architecture matters commercially

- **A database per clinic.** Each tenant's records live in their own database, not
  in shared tables separated by a filter. One clinic cannot see another's data even
  if a query is written wrongly — a claim worth making directly to a cautious
  prospect, and one that holds up: there are zero code paths reaching tenant data
  outside a tenant connection.
- **Permissions resolved per clinic.** The 12 roles ship with sensible defaults, and
  each clinic can adjust what its own roles may do.
- **Four separate portals, one platform.** Staff, doctors, patients and the platform
  operator each get a purpose-built interface, with separate credentials and a
  separate token audience for the operator console.
- **Audit trails where they matter.** Tenant lifecycle actions, financial actions and
  patient-record access are all logged.
- **Suspension actually suspends.** A clinic that stops paying is locked out
  immediately, including sessions already signed in — so subscription enforcement is
  real rather than nominal.

---

## 5. What needs configuring before go-live

The platform declares its own unconfigured dependencies at boot, on the monitoring
endpoint, and on the clinic settings screen (`src/config/stubs.js`). Each of these
is a setup task, not a gap in the product.

| Capability | Status | What it needs |
|---|---|---|
| SMS notifications | **Needs provider** | No SMS provider is wired. Reminders, queue calls and OTP go undelivered until one is connected — the system reports this rather than pretending to send |
| File storage | **Needs volume** | Uploads write to local disk, so a persistent volume must be mounted. Object storage is not implemented |
| Video calling at scale | **Needs TURN** | Without a TURN server, calls fail for participants behind restrictive firewalls |
| AI scan analysis | **Needs API key** | Requires a Gemini key. Dental clinics only |
| Email | **Working** | Sends today, but the recipient domain allowlist must be opened before onboarding clinics outside it |
| Online payments | **Working** | Razorpay, priced in INR |

**Market note.** Payments run through Razorpay in Indian rupees, and there is no
multi-language support in the interface. The product is built for the Indian market
as it stands; another region needs a gateway change and translation.

---

## 6. How to position it

| Audience | The line that lands |
|---|---|
| Dental clinic | Complete practice management, plus guided intraoral scanning and imaging integration no general product offers |
| Non-dental outpatient clinic | Everything except the scanning module — which is 47 of 48 modules, and nothing they would have used anyway |
| Multi-branch group | Run every site from one account, with branch-level scheduling, stock, staffing and revenue |
| Hospital | Sell to the outpatient department. Be direct that inpatient workflows are not covered |
| Clinic worried about data | Their records sit in a database of their own, not a shared table — and access is logged |

The strongest honest pitch is that this is **a general outpatient platform with a
dental speciality built on top** — not a dental product being stretched to fit other
clinics. The naming and the patient-facing marketplace are the only things that
suggest otherwise, and both are changeable.

---

*Compiled from the codebase: 48 modules, 392 endpoints, 53 tenant data models,
12 staff roles, 140+ permissions.*

*Companion documents: `REMEDIATION_PLAN.md` (engineering defect status),
`BUGFIX_HANDOFF.md` (historical bug fixes).*
