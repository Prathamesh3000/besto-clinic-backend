

**DENTAL CLINIC MANAGEMENT**

   
**Providing precision dental care through innovative technology and a seamless, patient-first digital experience.**

| Project Name | DCM |
| :---- | :---- |
| Version | 1.0  |
| Document Type | Technical Project Report |
| Prepared By | Development Team |
| Date | February 24, 2025 |

 

# 

# 

# 

# 

# 

# 

# 

# 

# 

# 

# 

# 

# 

# 

# **Table of Contents**

## **Part I: Overview**

1\.   	\[Executive Summary\]

2\.   	\[Product Introduction\]

3\.   	\[Business Model\]

4\.   	\[Technology Stack\]

 

## **Part II: Architecture & Design**

5\.   	\[System Architecture\]

6\.   	\[High-Level Design\]

7\.   	\[Low-Level Design\]

8\.   	\[Database Schema Architecture\]

 

## **Part III: Features & Modules**

9\.      \[Core Modules\]

10\.     \[Feature Specifications\]

11\.     \[User Workflows\]

 

## **Part IV: Technical Implementation**

12\.    \[API Architecture\]

13\.    \[Multi-Tenancy Implementation\]

14\.    \[Security & Authentication\]

15\.    \[Integration Points\]

 

## 

## 

## 

## **Part V: Deployment & Maintenance**

16\.    \[Deployment Architecture\]

17\.    \[System Monitoring\]

18\.    \[Scalability Considerations\]

 

## **Part VI: Future Roadmap**

19\.    \[Planned Enhancements\]

20\.    \[Technical Debt & Recommendations\]

# 

# 

# 

# 

# 

# 

# 

# 

# 

# 

#  **Part I: Overview**

 

**1\.** **Executive Summary** 

The objective of this project **Dental Clinic Management** is to develop a comprehensive dental management application that empowers clinics of all sizes to operate efficiently.   
It supports dentists in managing consultations, treatment planning, billing, and patient records, while enabling clinic owners with multiple doctors and branches to track performance, revenue, and overall operations through centralized dashboards.

Beyond simple management, the platform aims to drive business growth by automating patient engagement, streamlining appointments and digital payments, and providing real-time analytics for better decision-making. Built on a secure, multi-tenant architecture with strict clinic and doctor-level data isolation, the system ensures reliability, scalability, and data protection.

**1.2 Problem Identification**

* **Scheduling Inefficiency:** High rates of "no-shows" or late arrivals waste valuable clinical hours.  
* **Manual Communication:** Doctors must personally call patients to confirm appointments or send reminders.  
* **Data Fragmentation:** Difficulty in sharing X-rays and medical histories directly with patients.  
* **Receptionist Turnover:** High cost and effort associated with training new front-desk staff.  
* **Limited Growth:** Clinics struggle to scale from a local presence to attracting global "medical tourism" patients

### 

### 

### **1.3 Solution**

### **1.3.1 Core System Solutions**

* **One Platform, Multiple Clinics & Branches:** The system allows multiple dental clinics to operate on the same SaaS platform with complete data isolation. Each clinic can manage multiple branches independently under a single subscription.  
* **Tenant & Branch-Level Data Isolation:** Each clinic has a dedicated database ensuring strict separation from other clinics. Within a clinic, branch-level filtering ensures operational separation while maintaining centralized control  
* **Role-Based & Branch-Scoped Access:** Access is controlled through hierarchical roles \-SuperAdmin, Clinic Admin, Branch Admin (optional), Doctor, and Receptionist. Users can only access data permitted by their role and assigned branch.

### **1.3.2 Automation & Workflow Solutions**

* **Receptionist-Free Check-in:** Patients scan a **QR Code** when they arrive and fill out their own info on their phone. This means the clinic doesn't need a full-time receptionist just to handle paperwork.  
* **AI Chatbot Assistant:** Before the doctor sees the patient, an AI chatbot asks simple questions about their pain and symptoms. It then gives the doctor a quick summary (a "Triage Report") so they are ready to help immediately.  
* **Interactive Tooth Map:** Doctors can click on a digital map of the patient's teeth to record exactly what's wrong and what treatment is needed.

### **1.3.3 Communication & Engagement Solutions**

* **Automatic Reminders:** The system automatically sends messages to patients about their appointments,helps stop people from forgetting and wasting time.  
* **Paperless Prescriptions:** Digital prescriptions and receipts are sent directly to the patient's phone via **WhatsApp or SMS**, making it easy for them to keep track.  
* **Care Follow-ups:** The system automatically checks in on the patient 24 hours after their visit to ask how they are feeling, which helps build trust.

**1.3.4 Business & Growth Solutions**

* **Branded for Your Clinic:** Even though it's one system, it looks like your own app. It shows your clinic's logo and name to your patients.  
* **Global-Ready Tools:** Features are built specifically to help clinics attract and manage international patients (medical tourism).  
* **Fast & Reliable Tech:** We use modern tools (like **React** ) to ensure the app is fast on phones and never loses important medical data.

####       **1.3.5 Data Continuity & Internal History**

* **Persistent Longitudinal Records:** The system maintains a permanent, internal digital archive of every patient’s clinical journey. This includes chronological dental maps, X-ray attachments, and previous AI-generated triage summaries for long-term tracking.  
* **Encrypted Referral Module:** For inter-disciplinary care, the system includes a “**Referral Export Module”**. Doctors can generate password-protected, clinical summaries (PDF/JSON) of the internal patient history to securely refer patients to external specialists or hospitals.  
* **Historical Baseline Retrieval:** Data is archived in a non-volatile environment, allowing doctors to retrieve historical baseline data such as previous allergies or treatment reaction even after years of patient absence.

### **1.4 Business Model**

### **B2B SaaS structure**

**Dental Clinic operates on Business to Business Software-as-a-service model:**

**Tenant Isolation Logic:** 

* The system uses a "Software as a Service" (SaaS) model where each clinic (Tenant) is logically separated at the database level.

**Solo Clinic Instance:** 

* A single-node configuration where one `Clinic_ID` is mapped to one `Doctor_ID`. All automated workflows (QR-onboarding, Triage) feed into a single dashboard.

**Multi-Doctor Clinic Instance:** 

* A hierarchical configuration where a `Clinic_Owner` (Admin) manages a cluster of `Doctor_IDs`. The system aggregates business metrics (revenue, patient volume) across all linked IDs while maintaining clinical data privacy between individual doctors

#### **1.4.1 User Role & Access Control (RBAC)**

The system implements a four-tier access model to ensure data security and operational flow:

* **Super Admin:** Global system monitoring, tenant provisioning, and platform-wide analytics

### **Platform Owner (SuperAdmin)**

        ↓  
Onboards & Serves  
        ↓  
Dental Clinics / Dental Chains (Admins)  
        ↓  
Serve & Manage  
        ↓  
Patients (End Users)

**1.5 Revenue Streams**

## **Clinic Subscriptions (Primary Revenue – B2B)**

*  Platform owner charges dental clinics for system access

  **Tiered pricing based on:**

* Number of doctors  
* Monthly patient volume  
* Storage usage (X-ray data)  
* Feature access (AI triage, analytics, integrations)  
* Recurring monthly / annual revenue  
*  Add-on modules available

## **1.5.1 Storage-Based Revenue (B2B Add-on)**

**Clinics pay based on:**

* Medical storage consumption  
* Backup & archival needs  
* Separate Storage per Clinic  
* Long-term record retention

## **1.5.2 Premium Feature Modules (B2B Upsell)**

* AI-based preliminary diagnosis  
* Advanced analytics dashboard  
* Automation & reminders  
* Multi-branch management

**1.5.3 Optional Patient-Facing Revenue (Extended Model – Future B2B2C Layer)**

* Online tele-consultation fees  
* Digital report access subscription  
* Treatment package pre-booking

## **1.5.4 Advanced Module Add-Ons (Optional Upsell)**

* AI-assisted severity scoring  
*  Advanced analytics dashboard   
* WhatsApp / SMS automation  
* Multi-branch management  
*  Insurance integration  
* Tele-consultation module

# **1.5.5 Market Positioning**

### **Primary Market:** Indian dental clinics, solo practitioners,small & mid-sized clinics, Multi-branch dental chains.

### **Target Segment:**

 **Clinics with:**

* 1–10 dentists (Phase 1\) and 10–50 dentists (Scaling phase)

**Clinics Struggling with :**

* Manual patient intake ,receptionist dependency ,unstructured triage,disorganized records

**1.5.6 Unique Value Proposition**

* QR-based digital pre-consultation intake, interactive SVG dental mapping,  automated severity-based queue  
* Multi-tenant SaaS architecture.  
* Designed specifically for small clinics where the dentist handles multiple roles

**1.6 Core Value Proposition**

**1.6.1 For Platform Owner (Super-admin (SaaS Provider))**

 • Scalable healthcare-focused SaaS model  
 • Recurring subscription-based revenue  
 • Multi-tenant architecture with strong data isolation  
 • Infrastructure provider without patient data ownership liability  
 • Low operational overhead per clinic  
 • Expandable to multi-city & enterprise-level deployment

## **1.6.2 For Dental Clinics (Admins / Owners)**

 • Ready-to-deploy digital system without IT setup burden  
 • Full ownership of patient data  
 • Secure, encrypted infrastructure managed professionally  
 • QR-based digital pre-consultation reducing reception workload  
 • Smart severity-based patient prioritization  
 • Centralized treatment & Storage management  
 • Role-based access for multi-doctor teams  
 • Scalable from single clinic to multi-branch chain  
 • Compliance-ready system aligned with healthcare data regulations

## **1.6.3 For Dentists(Doctors)**

 • Structured pre-consultation data before patient visit  
 • Clear visualization of selected teeth & symptoms  
 • Reduced paperwork and manual documentation  
 • More focus on clinical care, less on administration

## **1.6.4 For Patients(Users)**

 • Simple QR-based registration  
 • Interactive dental map for accurate symptom marking  
 • Reduced waiting time via smart queue  
 • Transparent prioritization for urgent cases  
 • Improved clinic experience without complex digital steps

**2.Product Introduction**

**2.1 Platform Components**

**The Dental Smart Clinic Platform consists of four primary applications :**

## **2.1.1 SuperAdmin Portal (Web Application – React)**

**Purpose:**  
Platform governance, clinic onboarding, and infrastructure management

**Target Users:**  
Platform Owner / SaaS Administrators

### **Key Capabilities:**

###  • Review and approve clinic registrations  • Verify clinic credentials and compliance documents  • Activate/suspend clinic accounts  • Manage subscription plans and billing tiers  • System-wide analytics dashboard  • Monitor infrastructure health and usage metrics  • Manage storage allocation per doctor  • Configure platform-level security policies  • Impersonate clinic admin accounts for technical support  • Audit log monitoring across tenants  • Configure feature flags and module access

**Access Level:** Highest – Full system access across all tenants

## **2.1.2 Clinic Admin Panel (Web Application – React)**

**Purpose:**  
 Clinic management dashboard for dental clinics

**Target Users:**  
 Clinic Owner / Primary Admin / Authorized Staff

 **Modules:**

**a) Dashboard**

 • Daily patient queue overview  
 • Severity-prioritized consultation list  
 • Appointment metrics  
 • Revenue summary (if enabled)  
 • Storage usage indicator  
 • Quick actions panel (Add patient, View queue, Upload X-ray)

### **b) Patient Management**

 • Patient directory with search and filters  
 • QR-based pre-consultation records  
 • Consultation history tracking  
 • Treatment history tracking  
 • Patient demographics management  
 • Status tracking (Active / Archived)  
 • Export patient records (data portability)

### **c) Consultation & Dental Chart Module**

 • Interactive SVG dental map integration  
 • View selected teeth & gums (FDI numbering)  
 • Symptom breakdown per consultation  
 • Severity scoring overview  
 • Update consultation status (Waiting / In Treatment / Completed)  
 • Add diagnosis and treatment notes

### **d) Doctor Management**

 • Add multiple doctors  
 • Assign role-based permissions  
 • View doctor workload distribution  
 • Manage availability schedules  
 • Activity log tracking

### **e) File Management**

 • Secure upload of X-rays and reports  
 • Encrypted storage per clinic  
 • File tagging and categorization  
 • Version control for updated reports  
 • Controlled access to sensitive files

### **f) Sub-Admin & Role Management**    

• Create custom roles with granular permissions  
• Invite staff via email  
• Assign module-level permissions  
• Restrict access to financial or patient-sensitive data  
• Audit log tracking for accountability

### **g) Analytics & Reports**

• Patient trend analysis  
• Common symptom patterns  
• Treatment frequency insights  
• Revenue reports (optional)  
• Export functionality for offline use

### **h) Notification Center**

 • Send appointment reminders (SMS / WhatsApp integration)  
 • Broadcast clinic announcements  
 • Notify patients about follow-ups  
 • Track message delivery status

            **Access Control:** Role-based with customizable permissions

##  **2.1.3 Patient Web Application (QR-Based Progressive Web App)**

  **Purpose:** Digital pre-consultation and patient intake interface

 **Target Users:** Patients visiting the clinic

### **a) Home / Entry Screen**

 • Clinic branding (white-label support)  
 • Simple language interface  
 • Multi-language support (future-ready)

### **b) Dental Selection Module**

 • Interactive SVG dental chart  
 • Multi-tooth selection  
 • Gum region selection  
 • Responsive design for mobile devices  
 • JSON-based tooth mapping (FDI system)

### **c) Symptom Reporting**

 • Multi-select symptom checklist  
 • Pain scale selection  
 • Swelling / bleeding indicators  
 • Free-text description box

### **d) Submission & Queue**

 • Auto-generated token number  
 • Severity-based prioritization  
 • Estimated wait indicator  
 • Confirmation screen

            **e)** **Future Enhancements**

     • Access digital prescription  
                • Download reports  
                • View appointment history

**Platform:** Mobile-first web application (No download required)

### **2.2.Backend Server (Python \+ FastAPI)**

**Purpose:** Core API services, business logic, security, and data isolation

**Responsibilities:**

 • RESTful API endpoints  
 • Multi-tenant data isolation (clinic\_id based or DB-per-clinic)  
 • Authentication & authorization (JWT \+ RBAC)  
 • Smart queue management logic  
 • Secure file storage integration  
 • Background job processing (notifications, backups)  
 • Encryption & compliance enforcement  
 • Audit logging  
 • Data export and deletion workflows

 **Database & Infrastructure**

              • PostgreSQL (clinic-scoped data)  
 • Redis (caching & queue management)  
 • Encrypted object storage (X-rays & reports)

**2.2.1 User Hierarchy**

**Three-Tier Architecture** 

### 

### 

## **2.2.1 SuperAdmin Layer**

**Role:** SaaS Platform Owner

### **Capabilities:**

 • Approve/reject clinic onboarding  
 • Monitor system-wide metrics  
 • Manage subscription tiers  
 • Control infrastructure allocation  
 • Impersonate clinic accounts for support  
 • Manage platform security policies  
 • Access global audit logs

**Count:** 1–5 users

## **2.2.2 Clinic Layer**

### **Admin (Clinic Owner)**

**Role:** Primary clinic administrator

### **Capabilities:**

 • Full access to clinic data  
 • Manage doctors & staff  
 • Access analytics & reports  
 • Configure clinic branding  
 • Manage subscription plan  
 • Export clinic data

**Count:** 1 per clinic (primary), optional additional admins

### **2.2.3 Sub-Admin (Clinic Staff)**

**Role:** Staff with restricted access

### **Capabilities:**

 • Module-specific permissions  
 • Cannot access system-wide data  
 • Cannot modify subscription (unless permitted)  
 • Actions logged in audit trail

### **Permissions Structure Example:**

Role Example: “Reception Staff”

 ├─ patients: \[create, read, update\]  
 ├─ consultations: \[read, update status\]  
 ├─ doctors: \[read\]  
 ├─ analytics: \[read limited\]  
 └─ financials: \[no access\]

## **2.2.4 Doctor Layer**

**Role:** Clinical Practitioner

### **Capabilities:** • View assigned consultations  • Add diagnosis & prescription  • Upload X-rays  • Update treatment status  • Access patient history (clinic-scoped only)

**Data Isolation:** Access restricted to their clinic

## **2.2.5 Patient Layer**

**Role:** End user clinic’s patient

### **Capabilities:**

###  • Submit pre-consultation digitally  • Select teeth using interactive dental map  • Enter symptom details  • Receive queue number  • (Future) Access digital reports

**Data Isolation:** Data belongs exclusively to that clinic

**Count:** 50–10,000+ per clinic

**3\. Business Model**

**3.1 Revenue Model Details**

### **Platform Subscription Tiers**

| Tier | Features | Doctor Capacity | Storage | Pricing |
| ----- | ----- | :---: | :---: | ----- |
| **Starter** | Basic QR intake, patient management, limited analytics | 1 Doctor | 5GB | ₹/month |
| **Standard** | All core features, smart queue, X-ray upload, role management | Up to 5 Doctors | 20GB | ₹/month |
| **Premium** | Advanced analytics, priority support, multi-branch support | Up to 15 Doctors | 100GB | ₹/month |
| **Enterprise** | Custom features, dedicated database, SLA support | Unlimited | Custom | Custom Pricing |

### **3.2 Storage & Infrastructure Add-On Pricing**

Clinics can extend storage as needed:

| Storage Add-On | Pricing |  |
| ----- | ----- | ----- |
| Additional 10GB | ₹/month |  |
| Additional 50GB | ₹/month |  |
| Long-term archival storage | Custom pricing |  |

### 

### 

### **3.3 Optional Add-On Modules**

| Module | Description | Pricing Model |
| ----- | ----- | ----- |
| AI Severity Engine | Advanced triage scoring & predictive alerts | Add-on monthly fee |
| WhatsApp Automation | Automated reminders & prescription notifications | Per message / monthly pack |
| Tele-Consultation | Video consultation support | Per doctor license |
| Insurance Integration | Claim documentation workflow | Enterprise tier |
| Multi-Branch Management | Central dashboard for clinic chains | Premium+ |

### **3.4 Enterprise Deployment Model**

**For large dental chains:**

 • Dedicated infrastructure (separate database)  
 • Custom integrations  
 • SLA-backed uptime guarantee  
 • Priority technical support  
 • White-label branding

Pricing: Custom annual contract

### **3.5  Competitive Advantages**

1) ### **Multi-Tenant Architecture**

   • Strong data isolation between clinics  
   • Scalable to thousands of clinics  
   • Cost-efficient shared infrastructure  
   • Optional dedicated database for enterprise tier  
   • Clinics retain full ownership of patient data

2) ### **QR-Based Digital Intake System**

    • Eliminates paper-based patient forms  
    • Reduces receptionist workload  
    • Speeds up patient onboarding  
    • Structured symptom capture using interactive dental map  
    • Improves pre-consultation clarity for doctors

3) ### **Smart Severity & Queue Optimization**

    • Automated triage scoring  
    • Priority handling of urgent cases  
    • Real-time queue visibility  
    • Reduces patient waiting confusion  
    • Optimizes doctor workload distribution

4) ### **Secure Medical Record Management**

              • Encrypted X-ray and report storage  
             • Controlled access via role-based permissions  
             • Audit logging for all data changes  
             • Data export & portability support  
             • Compliance-aligned architecture

5) ### **Role-Based Workflow Management**

    • Separate access for Admin, Sub-Admin, and Doctor  
    • Granular permission configuration  
    • Audit-tracked actions for accountability  
    • Suitable for both single-doctor and multi-doctor clinics

   ### 

 


**4\. Technology Stack** 

## **4.1 Backend Technologies**

### **Runtime & Framework**

 • **Python (3.11+)**: High-performance, scalable backend runtime  
 • **FastAPI**: Modern asynchronous web framework for building high-speed  APIs      
 • **Uvicorn / Gunicorn**: ASGI server for production deployment

### **4.1.1 Database**

• **PostgreSQL (v14+)**: Relational database for structured medical data

**Key Advantages:**  
 • ACID-compliant (critical for healthcare data integrity)  
 • Strong relational modeling for patients, consultations, treatments  
 • JSONB support for storing dental map selections  
 • Advanced indexing & query optimization  
 • High reliability & transactional safety

 • **SQLAlchemy (ORM)**: Object Relational Mapping  
 • Schema modeling  
 • Relationship mapping  
 • Migration support (Alembic)

### **4.1.2 Caching & Queue**

• **Redis**: In-memory data store

**Used for:**  
 • Session caching  
 • Rate limiting  
 • Queue state management  
 • Temporary token storage  
 • Real-time dashboard updates

• **Celery / Background Workers**: Asynchronous task processing  
 • Appointment reminders  
 • Follow-up notifications  
 • Audit log archiving  
 • Storage lifecycle jobs

### **4.1.3 Real-Time Communication**

• **FastAPI WebSockets**

Used for:  
 • Live patient queue updates  
 • Doctor notification when QR triage completes  
 • Real-time consultation status changes  
 • Multi-doctor dashboard synchronization

## **4.2 Frontend Technologies**

### **4.2.1 Clinic Admin Panel & SuperAdmin Portal**

 • **React (v18+)**: Component-based UI library  
 • **TypeScript (optional but recommended)**: Type safety and maintainability  
 • **Redux Toolkit / Context API**: State management  
 • **Tailwind CSS**: Utility-first styling framework  
 • **Axios**: HTTP client for API communication  
 • **React Router**: Client-side routing  
 • **React Hook Form**: Form handling & validation  
 • **Recharts / Chart.js**: Analytics visualization

### **4.2.2 Patient Web Application (QR-Based PWA)**

 • **React (Mobile-first design)**  
 • **Responsive SVG Integration**: Interactive dental map  
 • **Progressive Web App (PWA)**: No app installation required  
 • **Local Storage / IndexedDB**: Temporary session handling

**4.3 Integration Services**

### **4.3.1 Payment Gateway**

    **Razorpay**

* **Supports:** Credit/Debit Cards, UPI, Net Banking, Wallets  
* **Used for:** Clinic subscription billing, consultation fee processing, treatment payments(optional)

### **4.3.2 Communication Services**

**SMS:** Twilio I, appointment reminders, prescription notifications, follow-up alerts

**Email Service:**  
 • FastAPI-Mail / SMTP (SendGrid / Gmail SMTP)  
 • Consultation summaries, subscription invoices, data export notifications

### **4.3.3 Authentication**

• OAuth2 \+ JWT: Stateless token-based authentication  
• bcrypt / Argon2: Secure password hashing  
• Role-Based Access Control (RBAC)  
• Clinic-scoped tenant isolation

## **4.4 DevOps & Infrastructure**

### **4.4.1 Version Control**		

• **Git**: Source code management  
• **GitHub / GitLab**: Repository hosting

### **4.4.2 Deployment**

• **Docker**: Containerization  
• **Docker Compose**: Local multi-service orchestration  
• **Nginx**: Reverse proxy & load balancer  
• **Uvicorn/Gunicorn**: ASGI production server

### **4.4.3 Hosting (Recommended Architecture)**

• **Backend**: DigitalOcean / Azure VM  
• **Database**: (PostgreSQL)  
• **Redis**: ElastiCache  
• **Frontend**: Vercel / Netlify (for Admin & Patient PWA)  
• **Domain & SSL**: \+ TLS encryption

### **4.4.4 Monitoring**

 • **Prometheus \+ Grafana**: Metrics monitoring  
 • **Sentry**: Error trackin  
 • Health check endpoints for uptime validation

**4.5 Development Tools**

### **4.5.1 Code Quality**

 • **Black**: Python code formatter  
 • **Flake8**: Linting  
 • **Pre-commit hooks**  
 • **Pytest**: Unit testing  
 • **Coverage tools**

### **4.5.2 API Development**

 **•** Postman: API testing  
 • Swagger / OpenAPI (Auto-generated via FastAPI)  
 • cURL & HTTPie for manual API testing

**4.6 Technology Architecture Layers**

## 

**5\. Architecture & Design**   
**5.1 System Architecture**

**5.1.1  Overall Architecture:**  
The Dental Smart Clinic Platform follows a **multi-tenant client-server architecture with layered design**:

**Presentation Tier:**  
 • Patient Web App (QR-based PWA – React)  
 • Clinic Admin Panel (React Web App)  
 • SuperAdmin Portal (React Web App)

**Application Tier:**  
 • FastAPI Backend Server  
 • WebSocket Engine for real-time updates  
 • Background Workers (Celery \+ Redis)

**Data Tier:**  
 • PostgreSQL (Primary medical data storage)  
 • Redis (Caching & Queue)

## 

## 

## **5.2 Request Flow**

**5.2.1 Standard API Request (Patient Intake Example)**

### **5.2.2 Flow Description**

### 

 • Patient scans QR and submits form  
 • Request hits Nginx → forwarded to FastAPI  
 • Middleware validates security & scope  
 • Controller processes input  
 • Service saves patient \+ consultation  
 • Smart Severity Engine calculates priority  
 • Queue updated  
 • Response returned with token number

**5.2.3 Real-Time Queue Update (WebSocket Flow)**

![][image1]

### **Flow Description**

 • Patient scans QR and submits form  
 • Request hits Nginx → forwarded to FastAPI  
 • Middleware validates security & scope  
 • Controller processes input  
 • Service saves patient \+ consultation  
 • Smart Severity Engine calculates priority  
 • Queue updated  
 • Response returned with token number

## **5.3 Component Architecture**

**5.3.1 Backend Components**

**backend/**

├── **config/**  
 │ ├── database.py \# PostgreSQL connection  
 │ ├── redis.py \# Redis connection  
 │ ├── email.py \# Email configuration  
 │ └── payments.py \# Razorpay configuration  
 │  
 ├── **models/**  
 │ ├── Patient.py  
 │ ├── Doctor.py  
 │ ├── Consultation.py  
 │ ├── Treatment.py  
 │ ├── Payment.py  
 │ └── AuditLog.py  
 │  
 ├── **controllers/**  
 │ ├── auth\_controller.py  
 │ ├── patient\_controller.py  
 │ ├── consultation\_controller.py  
 │ └── admin\_controller.py  
 │  
 ├── **routes/**  
 │ ├── superadmin\_routes.py  
 │ ├── clinic\_routes.py  
 │ ├── doctor\_routes.py  
 │ └── auth\_routes.py  
 │  
 ├── **middleware/**  
 │ ├── authenticate.py  
 │ ├── authorize.py  
 │ ├── clinic\_scope.py  
 │ └── rate\_limiter.py  
 │  
 ├── **services/**  
 │ ├── severity\_service.py  
 │ ├── notification\_service.py  
 │ ├── payment\_service.py  
 │ ├── file\_service.py  
 │ └── analytics\_service.py  
 │  
 ├── **workers/**  
 │ ├── reminder\_worker.py  
 │ └── audit\_worker.py  
 │  
 └── **sockets/**  
 └── websocket\_handler.py

**5.3.2 Frontend Components (Clinic Admin Panel)**

**admin/**

├── **src/**  
 │ ├── store/  
 │ ├── modules/  
 │ │ ├── dashboard/  
 │ │ ├── patients/  
 │ │ ├── consultations/  
 │ │ ├── doctors/  
 │ │ ├── reports/  
 │ │ ├── analytics/  
 │ │ ├── roles/  
 │ │ └── settings/  
 │ │  
 │ ├── **components/**  
 │ │ ├── Navbar.jsx  
 │ │ ├── Sidebar.jsx  
 │ │ ├── DentalChartViewer.jsx  
 │ │ └── Modal.jsx  
 │ │  
 │ └── **services/**  
 │ ├── api.js  
 │ └── authService.js

**5.3.3 Patient Web App Components (QR Intake)**

**patient/**

├── **src/**  
 │ ├── screens/  
 │ │ ├── verification/  
 │ │ ├── patient-info/  
 │ │ ├── dental-map/  
 │ │ ├── symptom-selection/  
 │ │ └── confirmation/  
 │ │  
 │ ├── **components/**  
 │ │ ├── DentalSVG.jsx  
 │ │ ├── PainScale.jsx  
 │ │ └── FormInput.jsx  
 │ │  
 │ └── services/  
 │ └── api.js

**5.4 Data Flow Examples**

**5.4.1 Patient QR Intake Submission**

**5.4.2 Doctor Updates Treatment**

**5.4.3 X-Ray Upload**

# 

# 

# 

# 

# 

# 

# **5.5 Architecture Summary**

The system is designed to be:

 • Multi-tenant & clinic-isolated  
 • Real-time enabled  
 • Asynchronous & scalable  
 • Secure & compliance-aligned

**6.High Level Design** 

**6.1 Authentication Flow**

**6.1.1 Login Request Flow**

### 

### 

### **6.1.2 Subsequent Requests**

### **6.1.3 Login Process Summary**

 • User submits email and password  
 • Server verifies credentials  
 • JWT token generated with clinic scope  
 • Token returned to client  
 • Client stores token securely  
 • All future requests include token

**6.2 Authorization & Permission System**

**6.2.1 Role-Based Access Control (RBAC)**

**Hierarchy**:

SuperAdmin (Platform Owner – Full System Access)  
 ↓  
 Clinic Admin (Full Access within Clinic)  
 ↓  
 SubAdmin (Role-based Custom Permissions)  
 ↓  
 Doctor (Clinical Access Only)

**6.2.2 Permission Check Flow**

**Middleware Chain**:  
authenticate → authorize(roles) → checkPermission(module, action) → controller  
@router.post("/clinic/consultations")  
@authenticate  
@authorize(\["admin", "subadmin", "doctor"\])  
@check\_permission("consultations", "create")  
async def create\_consultation():  
    ...

**6.2.3 Multi-Tenancy Architecture**

### **Data Isolation Strategy**

Shared Database, Shared Schema approach with automatic filtering:

 • Every table contains `clinic_id` field  
 • JWT contains user’s clinic\_id  
 • Middleware injects request.clinic\_id  
 • All queries filtered by clinic\_id

Example Query:

**Before Multi-Tenancy**: await Patient.all()

**After Multi-Tenancy:** await Patient.filter(clinic\_id=request.clinic\_id)

### **Benefits**

 • Complete data isolation between clinics  
 • Single codebase for all tenants  
 • Lower infrastructure cost  
 • Easy onboarding of new clinics

### **Security Measures**

 • Clinic ID embedded in JWT  
 • Backend enforces clinic-level filtering  
 

 •  No client-side filtering allowed  
 •  WebSocket rooms are clinic-specific  
 •  Audit logs scoped per clinic

**6.2.4 Scalability Architecture**

**Horizontal Scaling**

Load Balancer distributes traffic across multiple app instances:

**Components:**

 • Load Balancer (Nginx)  
 • FastAPI App Servers (Stateless containers)  
 • PostgreSQL (Managed RDS with replicas)  
 • Redis (Managed cluster for caching & queues)  
 • S3 Storage (Scalable object storage)

**Database Optimization**

• Indexes on clinic\_id

• Indexes on patient phone number

• Read replicas for heavy analytics queries

### **Caching Strategy**

Redis used for:

 • Session tokens  
 • Frequently accessed consultation queues

**Future Enhancements:**

 • CDN for static assets  
 • Read-heavy caching layer  
 • Database sharding for enterprise scale

**7\. Low-Level Design**

**7.1 Database Design** 

**7.1.1 Schema Overview**  
The Dental Smart Clinic Platform uses relational PostgreSQL tables organized into logical groups:

### **Platform Management**

 • Super Admin  
 • Clinic  
 • Clinic Subscription  
 • Plan  
 • Clinic Audit Log

### **Branch Management**

###   • Branch

### **User & Access Management**

 • User (Admin / SubAdmin / Doctor)  
 • Role  
 • RolePermission  
 • UserRoleMapping

**Patient Management**

 • Patient  
 • Medical History  
 • Emergency Contact  
 • Patient Consent

### **Consultation & Treatment**

 • Consultation  
 • Consultation Tooth Selection  
 • Symptom  
 • Consultation Symptom Mapping  
 • Severity Score  
 • Treatment  
 • Prescription

### **File & Diagnostics**

 • Medical File  
 • File Metadata  
 • XRay Record

### **Billing & Payments**

 • Invoice  
 • Payment  
 • PaymentTransaction

### **Notification System**

 • Notification  
 • User Notification  
 • Notification Log

### **System & Logging**

###  • Audit Log  • Activity Log  • ErrorLog

**Multi-Branch Support Enhancement:**

All operational tables (patients, consultations, invoices, medical\_files, inventory, payments) include a branch\_id column to enable branch-level data isolation within a clinic. This allows a single clinic to operate multiple physical branches while maintaining strict logical separation of records.

**7.1.2 Entity Relationship Overview**

**7.1.3 Key Database Indexes**

All tenant-scoped tables use compound indexes with clinic\_id and branch\_id for proper tenant and branch-level isolation.

**User Table:**

CREATE INDEX idx\_user\_clinic\_email ON users(clinic\_id, email);

CREATE INDEX idx\_user\_clinic\_role ON users(clinic\_id, role\_id);

CREATE INDEX idx\_user\_active ON users(clinic\_id, is\_active);

**Patient Table**:

CREATE INDEX idx\_patient\_clinic\_branch\_phone 

ON patients(clinic\_id, branch\_id, phone);

CREATE INDEX idx\_patient\_clinic\_name ON patients(clinic\_id, full\_name);

**Consultation Table**:

CREATE INDEX idx\_consultation\_clinic\_branch\_status 

ON consultations(clinic\_id, branch\_id, status);

CREATE INDEX idx\_consultation\_clinic\_doctor 

ON consultations(clinic\_id, doctor\_id);

CREATE INDEX idx\_consultation\_clinic\_created 

ON consultations(clinic\_id, created\_at DESC);

**Medical File Table**:

CREATE INDEX idx\_file\_clinic\_patient 

ON medical\_files(clinic\_id, patient\_id);

**Audit Log Table:**

CREATE INDEX idx\_audit\_clinic\_user 

ON audit\_logs(clinic\_id, user\_id);

CREATE INDEX idx\_audit\_entity 

**Index Strategy**

 • First column always `clinic_id` for tenant isolation  
 • Secondary columns optimized for common query patterns  
 • Unique constraints scoped per clinic  
 • Frequently filtered fields indexed

**7.2.1 Algorithm**

**Input: Consultation ID**

1. Fetch symptoms \+ pain level

2. severity \= 0

3. For each symptom:  
    severity \+= weight\[symptom\]

4. If chronic condition exists → severity \+= modifier

5. Determine category

6. Save severity\_score

7. Update queue order

8. Return classification

**7.2.3 Smart Queue Prioritization**

**Algorithm**

1.Fetch all waiting consultations

2.Order by severity\_score DESC

3.Secondary order by submission time

4.Return top for dashboard

**7.2.4 Documents Secure Upload Flow**

**Algorithm**

1.Input: File metadata  
2.Authenticate doctor  
3.Validate clinic scope  
4.Generate pre-signed URL  
5.Return URL  
6.After upload callback → save metadata  
7.Log audit entry

**7.2.5 Role-Based Permission Evaluation**

**Algorithm**

1.Input: user\_id, module, action  
2.Fetch user role  
3.If role \== superadmin → return True  
4.Fetch role permissions  
5.Check if permission exists  
6.Return True/False

**7.3. File Storage Structure**

**S3 Bucket Structure:**  
/clinic-{clinic\_id}/  
     /branch-{branch\_id}/ (optional)  
  /patients/{patient\_id}/  
    /consultations/{consultation\_id}/  
      xray\_1.jpg  
      report\_1.pdf

**Benefits:**

• Logical isolation  
• Easy export  
• Secure access  
• Scalable storage

**7.4 Audit Logging Flow**

**User performs action**

### **8.Database Schema Architecture**

**8.1 Core Schema Definitions**

**8.1.1 User Schema (Admin / SubAdmin / Doctor)**  
**Table: `users`**

**Purpose: Represents clinic-level system users (SuperAdmin, Clinic Admin, SubAdmin, Doctor)**  
**Key Fields:**  
{  
  // Identity  
  id: UUID (PK),  
  fullName: String,  
  email: String (unique per clinic),  
  phone: String,  
  passwordHash: String,  
  profileImage: String,

  // Role & Access  
  roleId: UUID → roles (FK),  
  clinicId: UUID → clinics (required, indexed),  
  isActive: Boolean,  
  isSuperAdmin: Boolean (default false),

  // Account Control  
  accountStatus: Enum \['active', 'suspended', 'disabled'\],  
  suspendedUntil: Date,  
  lastLogin: Date,  
  loginCount: Number,

  // Audit  
  createdAt: Timestamp,  
  updatedAt: Timestamp  
}

**Indexes:**

  `clinic_id, email }` (unique)  
• `{ clinic_id, role_id }`  
• `{ clinic_id, is_active }`

**8.1.2 Patient Schema**

**Table: patients**

**Purpose: Represents patients registered under a clinic**

**Key Fields:**

{

  id: UUID (PK),

  // Basic Information

  fullName: String,

  phone: String,

  email: String,

  gender: Enum \['male', 'female', 'other'\],

  dateOfBirth: Date,

  // Medical Details

  bloodGroup: String,

  diabetic: Boolean,

  hypertension: Boolean,

  allergies: Text,

  currentMedications: Text,

  // Association

  clinicId: UUID → clinics (required, indexed),

  // Tracking

  createdAt: Timestamp,

  updatedAt: Timestamp

}

**Indexes:**

• `{ clinic_id, phone }`  
 • `{ clinic_id, full_name }`

**8.1.3 Consultation Schema**

**Table: consultations**

**Purpose: Represents patient triage and consultation sessions**

**Key Fields:**

{

  id: UUID (PK),

  patientId: UUID → patients,

  doctorId: UUID → users,

  clinicId: UUID → clinics (required, indexed),

  // Triage

  selectedTeeth: JSONB,

  selectedGums: JSONB,

  symptoms: JSONB,

  painScale: Number,

  severityScore: Number,

  priorityLevel: Enum \['low', 'medium', 'high'\],

  status: Enum \['waiting', 'in\_treatment', 'completed', 'cancelled'\],

  notes: Text,

  createdAt: Timestamp,

  updatedAt: Timestamp

}

**Indexes:**

• { clinic\_id, status }  
• { clinic\_id, doctor\_id }  
• { clinic\_id, created\_at DESC }

**8.1.4 Treatment Schema**

**Table: treatments**

**Purpose: Represents diagnosis and prescribed treatment**

**Key Fields:**

{

  id: UUID (PK),

  consultationId: UUID → consultations,

  diagnosis: Text,

  prescription: Text,

  followUpDate: Date,

  clinicId: UUID → clinics (indexed),

  createdAt: Timestamp

}

**8.1.5 Medical File Schema**

 **Table: medical\_files**  
 **Purpose: Stores X-rays and reports metadata**

**Key Fields:**

{

  id: UUID (PK),

  patientId: UUID → patients,

  consultationId: UUID → consultations,

  clinicId: UUID → clinics (indexed),

  fileUrl: String,

  fileType: Enum \['xray', 'report', 'prescription'\],

  uploadedBy: UUID → users,

  fileSize: Number,

  createdAt: Timestamp

}

**Indexes:**

• { clinic\_id, patient\_id }  
• { clinic\_id, consultation\_id }

**8.1.6 Clinic Schema**

 **Table: clinics**  
 **Purpose: Represents tenant clinics**

**Key Fields:**

{

  id: UUID (PK),

  clinicName: String,

  ownerName: String,

  email: String,

  phone: String,

  subscriptionPlanId: UUID → plans,

  subscriptionStatus: Enum \['active', 'expired', 'trial'\],

  storageLimitGB: Number,

  createdAt: Timestamp

}

**8.1.7 Role Schema**

 **Table: roles**  
 **Purpose: Dynamic role-based permissions per clinic**

**Key Fields:**

{

  id: UUID (PK),

  name: String,

  description: String,

  permissions: JSONB,

  clinicId: UUID → clinics (indexed),

  isSystemRole: Boolean,

  createdAt: Timestamp

}

**Permissions Structure Example:**

\[

  {

    "module": "consultations",

    "actions": \["create", "read", "update"\]

  },

  {

    "module": "patients",

    "actions": \["read", "update"\]

  }

\]

**8.1.8 Payment Schema**

 **Table: `payments`**  
 **Purpose: Tracks consultation and subscription payments**

**Key Fields:**

{

  id: UUID (PK),

  clinicId: UUID → clinics,

  patientId: UUID → patients,

  consultationId: UUID → consultations,

  amount: Number,

  currency: String (default 'INR'),

  status: Enum \['pending', 'success', 'failed', 'refunded'\],

  razorpayOrderId: String (indexed),

  razorpayPaymentId: String (indexed),

  paymentMethod: String,

  initiatedAt: Timestamp,

  completedAt: Timestamp

}

**8.1.9 Notification Schema**

 **Table: notifications**  
 **Purpose: Appointment reminders and clinic announcements**

**Key Fields:**

{

  id: UUID (PK),

  clinicId: UUID → clinics,

  title: String,

  body: String,

  type: Enum \['appointment', 'followup', 'announcement'\],

  targetUserId: UUID → users,

  targetPatientId: UUID → patients,

  status: Enum \['scheduled', 'sent', 'failed'\],

  scheduledFor: Timestamp,

  sentAt: Timestamp

}

**8.1.10 Audit Log Schema**

 **Table: audit\_logs**  
 **Purpose: Immutable tracking of system actions**

**Key Fields:**

{

  id: UUID (PK),

  clinicId: UUID → clinics,

  userId: UUID → users,

  entityType: String,

  entityId: UUID,

  action: Enum \['create', 'update', 'delete'\],

  oldValue: JSONB,

  newValue: JSONB,

  ipAddress: String,

  userAgent: String,

   timestamp: Timestamp

}

**Indexes:**

• { clinic\_id, user\_id }  
• { clinic\_id, entity\_type }

### **8.2 Schema Relationships Summary**

![][image2]

# **Relationship Types**

**One-to-Many:**  
 • Clinic → Users  
 • Clinic → Patients  
 • Clinic → Consultations  
 • Patient → Consultations

**One-to-One:**  
 • Consultation → Treatment

**Many-to-One:**  
 • User → Role  
 • Consultation → Patient  
 • Consultation → Doctor

**Part III: Features & Modules**

**9\. Core Modules**

**9.1 Clinic Management Module**

### **Purpose**

Enable multiple dental clinics to operate independently on a shared SaaS platform with complete data isolation and secure workflow management.

**9.1.1 Clinic Registration & Onboarding Workflow**

### **Process:**

 • Clinic owner fills registration form  
 • Provides clinic details, license info, contact details  
 • Application status: Pending  
 • SuperAdmin reviews application  
 • SuperAdmin approves → Creates Clinic \+ Admin account  
 • Admin receives onboarding email  
 • Admin logs in and configures clinic profile  
 • Subscription plan activated

 **Schema Used:**  
 Clinic, User (Admin), Plan, ClinicSubscription

**9.1.2 Doctor & Staff Management**

### **Role Creation:**

 • Admin creates custom roles  
 • Assigns module-level permissions

Example:

Role: “Reception Manager”

* patients: \[create, read\]

* consultations: \[read, update\_status\]

* billing: \[read\]

### **Staff Invitation:**

 • Admin invites staff via email  
 • Assigns role  
 • Staff sets password  
 • Access granted based on permissions

### **Permission Enforcement:**

 • Middleware checks permissions on every API request  
 • Role-based access control (RBAC)  
 • All actions logged in AuditLog

Schema Used:  
 User, Role, AuditLog

**9.2 Patient Management Module**

### **Purpose**

Digitize patient intake, medical history tracking, and long-term record management.

**9.2.1 QR-Based Patient Onboarding**

### **Process:**

 • Patient scans QR  
 • Mobile verification (OTP optional)  
 • Enter personal details  
 • Enter medical history  
 • Consent confirmation  
 • Submit pre-consultation

 **Schema Used:**  
 Patient, MedicalHistory, PatientConsent

**9.2.2 Patient Record Management**

**Features:**

 • View patient profile  
 • Update medical history  
 • Track previous consultations  
 • Search by phone/name  
 • Export patient record

 **Schema Used:**  
 Patient, Consultation, Treatment

**9.3 Consultation & Smart Queue Module**

### **Purpose**

Automate triage, prioritize urgent cases, and streamline doctor workflow.

**9.3.1 Digital Dental Map**

**Features:**

• Interactive SVG tooth selection  
• Multiple tooth/gum selection  
• Symptom tagging  
• Pain scale input  
• JSON-based tooth mapping

## **9.3.2 Severity Engine**

• Automated severity scoring  
• Chronic condition modifiers  
• Risk-based classification  
• Priority levels: Low / Medium / High

## **9.3.3 Smart Queue**

 • Real-time queue update  
 • Sort by severity DESC  
 • Secondary sort by timestamp  
 • Doctor-specific filtering  
 • Live dashboard refresh (WebSocket)

**Schema Used:**  
 Consultation, SeverityScore

### **9.4 Treatment & Prescription Module**

### **Purpose**

Digitize diagnosis and treatment documentation.

**9.4.1 Diagnosis Entry**

• Add diagnosis notes

• Add treatment plan

• Attach follow-up date

• Update consultation status

**9.4.2 Digital Prescription**

 • Add medication list  
 • Dosage instructions  
 • Generate PDF  
 • Send via SMS/Email

  **Schema Used:**  
 Treatment, Prescription

### **9.5 Medical File & X-Ray Module**

### **Purpose**

Secure storage and retrieval of diagnostic files.

**9.5.1 File Upload Flow**

**![][image3]**

### **9.6 Billing & Payment Module**

### **Purpose**

Manage consultation payments and clinic subscription billing.

**9.6.1 Consultation Payment Flow**

**![][image4]**

  **Features:**

 • Payment verification (HMAC SHA256)  
 • Status tracking  
 • Refund support  
 • Invoice generation

 **Schema Used:**  
 Payment, Invoice

**9.6.2 Clinic Subscription Management**

           • Monthly/annual plans  
           • Storage-based pricing  
           • Expiry tracking  
           • Plan upgrade/downgrade

        **Schema Used:**  
             Clinic Subscription, Plan

###        **9.7 Notification Module**

###            ** Purpose**

###           Real-time engagement and automated reminders.

**9.7.1 Notification Triggers**  
• Appointment reminders  
• Follow-up reminders  
• Payment confirmation  
• Subscription expiry  
• Clinic announcements

**9.7.2 Delivery System**

 • Queue-based processing (Redis)  
 • Scheduled notifications  
 • WhatsApp/SMS integration  
 • Email notifications  
 • User preference filtering

 **Schema Used:**  
 Notification, User Notification

**9.8 Audit & Compliance Module**

### **Purpose**

Ensure legal traceability and accountability.

**9.8.1 Action Logging**

Track:

 • Patient record access  
 • Consultation updates  
 • File uploads  
 • Role changes  
 • Payment updates

**9.8.2 Immutable Logging**

 • Append-only logs  
 • Clinic-scoped  
 • Timestamped  
 • Old/New value tracking

**Schema Used:**  
 AuditLog

### **9.9 Analytics Module**

### **Purpose**

Provide operational and branch-level insights for clinic owners and branch managers.

**9.9.1 Dashboard Metrics**

 • Total patients(clinic-wide and branch-wise)  
 • Active consultations(branch-filtered)  
 • High-priority cases(branch-specific queue)  
 • Revenue (monthly\-clinic-wide and branch-wise)  
 • Storage usage(clinic-wide)  
 • Doctor workload(branch-level)  
 • Branch performance comparison (if multiple branches)

### **9.9.1.1 Branch-Level Analytics**

• Patient count per branch  
• Revenue per branch  
• Consultation volume per branch  
• High-severity case distribution per branch  
• Doctor performance per branch  
• Branch growth trends (monthly)

## **9.9.2 Clinical Insights**

 • Most common symptoms(branch-wise analysis)  
 • Treatment frequency(per branch)  
 • Patient revisit rate(branch comparison)  
 • Average consultation time(doctor and branch level)

 **Schema Used:**  
 Consultation, Payment, Treatment

All analytics queries are scoped by clinic\_id and optionally filtered by branch\_id to ensure accurate branch-level reporting and data isolation.

### **9.10 Multi-Tenancy & Data Isolation Module**

### **Purpose**

Ensure complete separation of clinic data.

### **Features:**

 • All tables include clinic\_id  
 • JWT contains clinic\_id  
 • Middleware injects clinic scope  
 • Queries auto-filtered  
 • WebSocket rooms per clinic  
 • Optional database-per-clinic (Enterprise)

### **9.11 AI Dental Scan & Clinic Recommendation Module**

### **Purpose**

Enable patients to perform a guided dental self-assessment using their mobile device camera, receive a high-level visual overview of their dental condition, and get matched with appropriate dentists within the clinic network — driving engagement and conversions.

**9.11.1 Guided Dental Scan Flow**

 • Patient initiates scan from the mobile app chatbot interface
 • Chatbot instructs patient to capture multiple angles:

* Front view (teeth closed)
* Left side view
* Right side view
* Upper teeth (open mouth, top arch)
* Lower teeth (open mouth, bottom arch)

 • Images captured sequentially with on-screen guides
 • All images uploaded securely to clinic-scoped storage
 • AI model processes images for visual pattern recognition

**9.11.2 Visual Analysis Engine**

 • Identifies visual indicators:

* Plaque buildup
* Gum inflammation or redness
* Tooth discoloration or staining
* Visible misalignment or crowding
* Cavities or dark spots
* Gum recession

 • Generates a structured visual overview report
 • Report includes confidence indicators per observation
 • All outputs include mandatory disclaimer: *"This is a preliminary visual assessment only and not a professional diagnosis. Please consult a licensed dentist for accurate evaluation."*

**9.11.3 Dentist Recommendation Engine**

 • Maps detected observations to dental specializations
 • Queries registered doctors within the clinic network
 • Filters by:

* Relevant specialization (orthodontics, periodontics, endodontics, etc.)
* Availability within selected branch
* Patient rating and experience

 • Presents ranked list of recommended dentists
 • One-tap "Book Consultation" action from recommendation results

**9.11.4 Conversion Funnel**

 • Step 1: Patient curiosity → initiates dental scan
 • Step 2: Self-assessment → receives visual overview
 • Step 3: Concern identified → views matched dentists
 • Step 4: Trust established → books appointment
 • Analytics tracked: scan completion rate, recommendation click-through, booking conversion rate

 **Schema Used:**
 DentalScan, DentalScanResult, Consultation, User (Doctor)

**9.11.5 Ethical & Legal Boundaries**

 • System explicitly avoids medical diagnosis, treatment recommendation, or prescription
 • All analysis labeled as "observational" and "informational"
 • Persistent disclaimer on every scan result screen
 • No clinical decisions made by the AI — only visual pattern detection
 • Scan data retained under clinic data retention policy with patient consent

---

### **9.12 Prescription Follow-Up & Care Reminder Module**

### **Purpose**

Automate patient follow-up after treatment by converting prescription tasks into scheduled reminders, improving care compliance, recovery outcomes, and patient-clinic engagement.

**9.12.1 Prescription Task Extraction**

 • When a doctor creates a prescription or treatment plan, the system digitally records all care instructions
 • Tasks categorized by type:

* Medication (name, dosage, frequency, duration)
* Hygiene routines (brushing instructions, mouthwash usage)
* Post-treatment care (salt-water gargle, ice application, dietary restrictions)
* Follow-up visits (date, purpose)

 • Each task mapped to a reminder schedule based on prescribed frequency and duration

**9.12.2 Patient Opt-In Flow**

 • When prescription is delivered to patient (via app, SMS, or email):

* System displays prompt: *"Would you like to enable care reminders for this prescription?"*
* Patient selects: Enable / Skip

 • Reminder preferences configurable from patient account settings
 • Patient can enable/disable reminders at any time
 • Per-prescription granular control (enable reminders for specific tasks)

**9.12.3 Reminder Delivery System**

 • Reminders scheduled via Redis queue (BullMQ)
 • Delivery channels:

* App push notifications (primary)
* Automated voice calls (optional, configurable)
* SMS/WhatsApp notifications
* Email reminders

 • Reminder frequency follows prescription schedule:

* Example: "Take Amoxicillin 500mg — 3 times daily for 5 days" → generates 15 reminders over 5 days
* Example: "Salt-water gargle after every meal" → 3 daily reminders for prescribed duration

 • Smart timing: Reminders aligned to typical meal times or patient-preferred schedule

**9.12.4 Compliance Tracking**

 • Patient can mark each reminder as "Done" or "Skipped"
 • Compliance dashboard visible to:

* Patient (personal care tracker)
* Doctor (patient compliance overview during next visit)

 • Non-compliance alerts: If patient skips multiple reminders, escalation notification sent to clinic

 **Schema Used:**
 Prescription, PrescriptionTask, CareReminder, ReminderLog

---

### **9.13 Clinical Inventory & Procedure Readiness Module**

### **Purpose**

Provide clinic staff with centralized inventory management for dental equipment and materials, integrated with appointment scheduling to ensure procedure readiness before complex treatments are scheduled.

**9.13.1 Inventory Management**

 • Centralized catalog of all dental equipment and consumables:

* Braces kits (types, sizes)
* Dental implants (brands, specifications)
* Prosthetic teeth and crowns
* Surgical kits and instruments
* Consumables (anesthetics, bonding agents, impression materials, etc.)

 • Track per item:

* Current quantity
* Minimum threshold (reorder level)
* Reserved quantity (allocated to scheduled procedures)
* Available quantity (current minus reserved)
* Supplier information
* Expiry date (for consumables)

 • Branch-level inventory isolation with clinic-wide visibility for admins

**9.13.2 Procedure-Inventory Integration**

 • During consultation or diagnosis, if doctor determines complex procedure is required:

* System presents inventory check: "Verify Equipment Availability"
* Doctor or staff selects procedure type (e.g., "Implant Placement", "Braces Installation")
* System auto-checks required materials against current inventory

 • Availability outcomes:

* All materials available → Procedure can be scheduled immediately
* Partial availability → System shows missing items, blocks scheduling, allows "Plan for Later"
* Unavailable → Procedure marked as "Pending Equipment", staff notified to procure

**9.13.3 Material Reservation System**

 • When a procedure is scheduled and materials are available:

* Required items reserved against that patient/appointment
* Reserved stock deducted from available quantity
* Reservation auto-released if appointment is cancelled

 • Reservation confirmation notification sent to:

* Assigned doctor
* Clinic staff / inventory manager

**9.13.4 Alerts & Notifications**

 • Low stock alerts: Triggered when item quantity falls below minimum threshold
 • Expiry alerts: Notifications for items approaching expiry date
 • Restocking updates: When reserved/required materials are restocked, notify relevant doctor
 • Procedure readiness confirmation: Automated notification to doctor when all required materials for a scheduled procedure are confirmed available

**9.13.5 Reporting**

 • Inventory usage trends (monthly/quarterly)
 • Most consumed materials
 • Equipment utilization rate
 • Wastage tracking (expired items)
 • Cost analysis per procedure type
 • Branch-wise inventory comparison

 **Schema Used:**
 InventoryItem, InventoryTransaction, ProcedureTemplate, MaterialReservation

---

### **10\. Feature Specifications**

### **10.1 Patient Onboarding Workflows**

**Workflow 1: Patient Self-Onboarding (QR-Based)**

### **Steps:**

 • Patient scans clinic QR code  
 • Patient redirected to Patient Web App  
 • Patient enters mobile number  
 • OTP verification (optional but recommended)  
 • Patient fills personal details:

* Name

* Age / DOB

* Gender

* Email (optional)

 **Patient fills medical history:**

* Blood group

* Diabetic (Yes/No)

* Hypertension (Yes/No)

* Allergies

* Current medications

 • Patient selects affected teeth using interactive dental map  
 • Selects symptoms (multi-select)  
 • Selects pain scale (1–10)  
 • Accepts consent checkbox  
 • Clicks “Submit”

**Backend Actions:**

 • Validate clinic scope  
 • Check if patient already exists (by phone)  
 • Create/Update patient record  
 • Create consultation (status: ‘waiting’)  
 • Run severity engine  
 • Insert into smart queue  
 • Emit WebSocket event to doctor dashboard

**Result:**

 • Token number generated  
 • Patient sees confirmation screen  
 • Doctor dashboard updates in real time

**Workflow 2: Reception-Based Patient Entry (Manual)**

**Steps:**

 • Staff logs into Admin Panel  
 • Navigate to Patients → Add Patient  
 • Fill patient form manually  
 • Add medical history  
 • Create consultation  
 • Optionally assign doctor

**Backend:**

 • Save patient record  
 • Save consultation  
 • Insert into queue  
 • Audit log entry created

**10.2 Consultation & Smart Queue Workflow**

**Phase 1: Patient Submission**

*  Patient submits triage form  
* Selected Teeth  
* symptoms  
* Pain Scale  
* Medical Risk  
* Severity engine calculates score

**Phase 2: Queue Ordering**

**Backend sorts by:**

• severityScore DESC  
• createdAt ASC

**Doctor Dashboard:**

 • Live queue updates via WebSocket  
 • High priority cases highlighted  
 • Doctor can filter by:

* All patients  
* Assigned patients  
* Priority level

**Phase 3: Doctor Consultation**

 • Doctor clicks consultation  
 • Views:

* Patient medical history  
* Selected teeth visualization  
* Symptoms  
* Pain scale

 • Doctor updates status → ‘in\_treatment’  
 • Adds diagnosis  
 • Adds prescription  
 • Updates follow-up date  
 • Marks consultation → ‘completed’

Audit log created for each update.

### **10.3 X-Ray Upload Workflow**

![][image5]

**10.4 Notification Delivery Workflow**

## **Appointment Reminder (Auto)**

 **Trigger:**

 • Consultation marked completed  
 • Follow-up date exists

**System:**

 • Cron job runs daily  
 • Finds patients with follow-up tomorrow  
 • Creates notification record  
 • Adds job to Redis queue

**Worker:**

 • Fetch patient contact  
 • Check notification preferences  
 • Send SMS/WhatsApp  
 • Update status: ‘sent’  
 • Log delivery result

**Manual Clinic Announcement**

**Admin:**

POST /api/clinic/notifications  
 {title, body, targetAudience}

**Server:**

 • Validate request  
 • Inject clinic scope  
 • Save notification (status: scheduled or immediate)  
 • Add to queue

**Worker:**

 • Fetch target patients  
 • Filter active patients  
 • Send notifications  
 • Update delivery stats

### **10.5 Payment Workflow**

**Consultation Payment Flow**  
![][image6]

##          **   Clinic Subscription Payment (B2B)**

**Clinic Admin:**

 • Chooses plan  
 • Initiates payment  
 • Razorpay flow triggered

**Backend:**

 • Verify payment  
 • Update ClinicSubscription  
 • Update storage limits  
 • Activate plan

### **10.6 Role & Permission Workflow**

## **Role Creation**

**Admin:**

 • Navigate to Roles → Create Role  
 • Define:

* module  
* allowed actions

Example:

Module: consultations  
Actions: \[read, update\]

Save role.

### **Permission Enforcement**

API Request:

authenticate → authorize(role) → checkPermission(module, action) → controller

If permission missing:

• Return 403 Forbidden

All actions logged.

### **10.7 Audit Logging Workflow**

## **Action Tracking**

**User performs action:**

Example: Update consultation

System captures:

 • user\_id  
 • clinic\_id  
 • entity\_type  
 • entity\_id  
 • old\_value  
 • new\_value  
 • timestamp

Insert into audit\_logs table

Immutable record created.

### **10.8 Analytics Workflow**

**Dashboard Metrics**

Admin logs in

Backend calculates:

 • Total patients  
 • Active consultations  
 • High priority cases  
 • Monthly revenue  
 • Doctor workload

Queries optimized with clinic\_id filter.

**Clinical Insights**

System aggregates:

 • Most common symptoms  
 • Average severity score  
 • Treatment distribution  
 • Follow-up rate

Data returned to dashboard charts.

### **10.9 AI Dental Scan & Recommendation Workflow**

**Phase 1: Scan Initiation**

 • Patient opens chatbot from mobile app home screen
 • Selects "Dental Scan" option
 • Chatbot explains the process and expected image requirements
 • Patient grants camera permission

**Phase 2: Image Capture**

 • Chatbot guides patient through 5 capture steps:

Step 1: Front view (teeth together, lips apart)
Step 2: Left side view
Step 3: Right side view
Step 4: Upper arch (mouth open, camera facing up)
Step 5: Lower arch (mouth open, camera facing down)

 • Each step includes visual overlay guide for correct positioning
 • Patient can retake any image before proceeding
 • All images uploaded to secure clinic-scoped storage

**Phase 3: AI Analysis**

**Backend:**

 • Images submitted to AI analysis pipeline
 • Visual pattern detection identifies potential dental concerns
 • Structured report generated with observations and confidence scores
 • Report saved to DentalScan record linked to patient

**Result:**

 • Patient receives visual overview with identified areas of concern
 • Each observation includes:

* Affected area (mapped to dental chart if possible)
* Observation type (plaque, inflammation, discoloration, etc.)
* Confidence level (low/medium/high)

 • Disclaimer displayed prominently

**Phase 4: Dentist Recommendation**

 • System maps observations to dental specializations
 • Queries available dentists in clinic network
 • Presents sorted recommendations based on relevance, rating, and availability
 • Patient can tap "Book Consultation" directly from recommendation card

**Backend:**

 • Log scan-to-booking conversion event
 • Create consultation record if booking initiated
 • Insert into appointment queue

---

### **10.10 Prescription Follow-Up & Care Reminder Workflow**

**Phase 1: Prescription Creation**

 • Doctor completes consultation
 • Creates prescription with:

* Medications (name, dosage, frequency, duration)
* Care instructions (gargle, hygiene, dietary restrictions)
* Follow-up date

 • System extracts individual care tasks from prescription

**Phase 2: Patient Opt-In**

 • Prescription delivered to patient (app notification + SMS/Email)
 • System displays prompt: *"Enable care reminders for this prescription?"*
 • Patient accepts or skips

**Backend (if accepted):**

 • Parse prescription tasks into individual reminder entries
 • Calculate reminder schedule based on frequency and duration
 • Queue all reminders as delayed jobs in Redis (BullMQ)
 • Store reminder preferences in patient profile

**Phase 3: Reminder Delivery**

**Worker:**

 • Fetch due reminders from queue
 • Check patient notification preferences
 • Deliver via configured channels (push notification, SMS, call)
 • Log delivery status

**Patient interaction:**

 • Patient receives reminder with task description
 • Can mark task as "Done" or "Skipped" via app
 • Compliance status updated in real-time

**Phase 4: Compliance Review**

 • Doctor views patient compliance summary during next visit
 • System highlights:

* Completion rate per prescription
* Skipped tasks
* Overall adherence trend

 • Supports informed follow-up conversation between doctor and patient

---

### **10.11 Inventory & Procedure Readiness Workflow**

**Phase 1: Inventory Setup**

 • Clinic staff navigates to Inventory Management section
 • Adds dental equipment and materials:

* Item name, category, unit
* Current stock quantity
* Minimum threshold
* Supplier details
* Expiry date (if applicable)

 • Items tracked at branch level with clinic-wide aggregation

**Phase 2: Procedure Planning**

**During consultation:**

 • Doctor determines complex procedure is needed (e.g., implant, braces)
 • Doctor or staff triggers "Check Equipment Availability"
 • System queries inventory for required materials

**Availability Check:**

 • If all materials available:

* Green status: "Ready to Schedule"
* Proceed to schedule appointment

 • If materials insufficient:

* Red status: "Equipment Unavailable"
* System lists missing items with quantities needed
* Option to "Plan for Later" — procedure queued pending inventory

**Phase 3: Material Reservation**

 • When appointment scheduled with available materials:

* Required items reserved against appointment
* Available quantity decremented
* Reservation linked to patient + appointment record

 • If appointment cancelled:

* Reserved items auto-released back to available stock
* Cancellation logged in inventory transactions

**Phase 4: Restocking & Notifications**

**Staff updates inventory:**

 • New stock received → update quantity
 • System checks pending procedures waiting for materials
 • If pending procedure now satisfiable → notify doctor:

*"Materials for [Patient Name]'s [Procedure Type] are now available. Ready to schedule."*

**Automated alerts:**

 • Low stock: Item below minimum threshold
 • Expiry warning: Item expiring within 30 days
 • Procedure ready: All materials for planned procedure confirmed

---

###              **11\. User Workflows**

### **11.1 Patient Journey**

**11.1.1 Onboarding Journey**  
**Day 1: First Visit to Clinic**  
 • Patient arrives at clinic clinic branch  
 • Sees QR code specific to that branch  
 • Scans QR using mobile phone  
 • Redirected to secure patient intake page  
 • Branch automatically detected from QR code  
 • Patient registered under that branch  
 • Enters mobile number (OTP verification optional)

 • Fills personal details:

* Name

* Age / DOB

* Gender

* Email (optional)

**• Fills medical information:**

* Blood group

* Diabetic (Yes/No)

* Hypertension (Yes/No)

* Allergies

* Current medications

 • Selects affected teeth on interactive dental chart  
 • Selects symptoms  
 • Sets pain level (1–10)  
 • Accepts consent form  
 • Submits triage

**Result:**

 • Smart severity calculated  
 • Patient added to digital queue  
 • Token number generated  
 • Doctor notified in real time  
 • Notification sent only to doctors assigned to that branch

**During Consultation**

 • Doctor calls patient from smart queue  
 • Reviews digital intake form  
 • Examines selected teeth  
 • Adds diagnosis  
 • Prescribes treatment  
 • Sets follow-up date  
 • Marks consultation as completed

Patient receives:

 • Digital prescription (SMS/Email)  
 • Payment invoice  
 • Follow-up reminder notification

### **Post Visit (Follow-up Phase)**

Day 2–7:

• Receives reminder notification before follow-up  
 • Can revisit clinic with digital history available

Long-term:

• Medical records securely stored  
 • X-rays retrievable  
 • Faster re-consultation

**11.1.2 Typical Clinic Visit Routine (Patient Perspective)**

Morning (10:00 AM – Arrival)

 • Scan QR  
 • Fill triage  
 • View token number  
 • Wait in smart queue

**Consultation Time**

 • Doctor reviews case  
 • Treatment performed  
 • Prescription generated

**After Payment**

 • Pays consultation fee  
 • Receives payment confirmation  
 • Gets digital copy of prescription

**Follow-up Reminder Day**

 • SMS reminder received  
 • Visits clinic for follow-up

### **11.2 Doctor Journey**

## **11.2.1 First-Time Setup**

Day 1: Account Setup

 • Doctor receives login credentials from clinic admin  
 • Logs into Doctor Dashboard  
 • Sets password  
 • Completes profile (specialization, availability)  
 • Reviews dashboard tutorial

**11.2.2 Daily Clinic Routine**

Morning (Clinic Start)

 • Logs into dashboard  
 • If assigned to multiple branches, selects active branch  
 • Dashboard loads queue for selected branch only  
 • Views smart queue(branch-specific)  
 • Sees priority cases highlighted  
 • Reviews patient medical history before calling

**During Consultation**

 • Opens consultation record  
 • Views selected teeth visualization  
 • Adds diagnosis  
 • Uploads X-ray (if needed)  
 • Prescribes medication  
 • Sets follow-up  
 • Marks consultation completed

**Afternoon**

 • Reviews completed cases  
 • Checks pending high-priority patients  
 • Updates treatment notes

**End of Day**

 • Reviews daily consultation summary  
 • Checks revenue generated  
 • Verifies follow-up schedules

**11.3 Clinic Admin Journey**

**11.3.1 Initial Setup (Week 1\)**

**Day 1: Clinic Profile**

• Creates clinic branches (if multiple locations)

• Configures branch name, address, contact number

• Assigns doctors and staff to specific branches

 • Admin receives approval email  
 • Logs into Admin Panel  
 • Completes clinic profile  
 • Uploads clinic logo  
 • Configures working hours  
 • Chooses subscription plan

**Day 2: Staff Setup**

 • Creates roles (Doctor, Reception, Billing)  
 • Invites doctors  
 • Invites reception staff  
 • Assigns permissions

**Day 3: Payment Setup**

 • Configures Razorpay credentials  
 • Tests payment flow  
 • Configures invoice template

**Day 4: Notification Setup**

 • Sets reminder timings  
 • Configures SMS/Email templates  
 • Enables follow-up automation

**Day 5: System Review**

 • Reviews multi-tenancy isolation  
 • Verifies role permissions  
 • Tests smart queue

### **11.3.2 Regular Operations (Monthly)**

**Weekly Tasks:**

 • Monitor consultation counts  
 • Review high-severity case patterns  
 • Check doctor workload  
• Review branch-wise performance  
• Monitor branch-level revenue  
• Compare patient volume across branches  
 • Review pending payments  
 • Audit user actions

**Monthly Tasks:**

 • Review revenue reports  
 • Upgrade/downgrade subscription plan  
 • Export financial data  
 • Review patient retention metrics  
 • Monitor storage usage  
 • Review audit logs for compliance

### **11.4 SuperAdmin Journey (Platform Owner)**

**Platform Oversight**

**Daily:**

 • Monitor active clinics  
 • View branch count per clinic  
 • Monitor branch-level growth metrics  
 • View system-wide analytics  
 • Monitor server health

**Weekly:**

 • Approve new clinic registrations  
 • Review subscription renewals  
 • Monitor storage consumption

**Monthly:**

 • Revenue analytics  
 • Platform performance review  
 • Infrastructure scaling decisions

**Part IV: Technical Implementation** 

**12\. API Architecture**   
**12.1 Complete API List**

**12.1.1 SuperAdmin APIs**  
**Authentication**  
POST /api/superadmin/auth/login

**Dashboard & Platform Monitoring**  
GET /api/superadmin/dashboard  
GET /api/superadmin/analytics

**Clinic Management**  
GET /api/superadmin/pending-clinics  
GET /api/superadmin/pending-clinics/:id  
POST /api/superadmin/pending-clinics/:id/approve  
POST /api/superadmin/pending-clinics/:id/reject

GET /api/superadmin/clinics  
GET /api/superadmin/clinics/:id  
PUT /api/superadmin/clinics/:id  
DELETE /api/superadmin/clinics/:id

**Subscription & Plans**  
GET /api/superadmin/plans  
POST /api/superadmin/plans  
PUT /api/superadmin/plans/:id  
DELETE /api/superadmin/plans/:id

GET /api/superadmin/clinic-subscriptions  
PUT /api/superadmin/clinic-subscriptions/:id

**12.2.2 Authentication APIs**  
POST /api/auth/register-clinic  
POST /api/auth/login  
POST /api/auth/google  
POST /api/auth/forgot-password  
POST /api/auth/reset-password/:token  
POST /api/auth/verify-email/:token  
POST /api/auth/refresh-token  
POST /api/auth/logout

**12.2.3 Clinic Admin – User Management**  
**Doctors & Staff**  
GET /api/admin/users  
GET /api/admin/users/:id  
POST /api/admin/users  
PUT /api/admin/users/:id  
DELETE /api/admin/users/:id

**Role Management**  
GET /api/admin/roles  
POST /api/admin/roles  
PUT /api/admin/roles/:id  
DELETE /api/admin/roles/:id

**SubAdmin Invitations**  
POST /api/admin/subadmins  
POST /api/admin/subadmins/:id/resend-invitation  
DELETE /api/admin/subadmins/:id  
**12.2.4 Clinic Admin – Patient Management**  
GET /api/admin/patients  
GET /api/admin/patients/:id  
POST /api/admin/patients  
PUT /api/admin/patients/:id  
DELETE /api/admin/patients/:id

POST /api/admin/patients/import  
GET /api/admin/patients/export

**12.2.5 Clinic Admin – Consultation Management**  
GET /api/admin/consultations  
GET /api/admin/consultations/:id  
PUT /api/admin/consultations/:id/status  
DELETE /api/admin/consultations/:id

GET /api/admin/consultations/:id/history

**12.2.6 Clinic Admin – Treatment & Prescriptions**  
POST /api/admin/consultations/:id/treatment  
PUT /api/admin/treatments/:id  
GET /api/admin/treatments/:id

POST /api/admin/prescriptions  
GET /api/admin/prescriptions/:id

**12.2.7 Clinic Admin – Queue & Severity**  
GET /api/admin/queue  
GET /api/admin/queue/live  
PUT /api/admin/queue/:id/reorder

**12.2.7 Clinic Admin – Reports & Analytics**  
GET /api/admin/analytics/dashboard  
GET /api/admin/analytics/patients  
GET /api/admin/analytics/revenue  
GET /api/admin/analytics/consultations  
GET /api/admin/analytics/doctors

GET /api/admin/reports/daily  
GET /api/admin/reports/monthly  
GET /api/admin/reports/export

**12.2.8 Clinic Admin – Billing & Invoices**  
GET /api/admin/invoices  
GET /api/admin/invoices/:id  
POST /api/admin/invoices  
PUT /api/admin/invoices/:id  
DELETE /api/admin/invoices/:id

**12.2.9 Doctor APIs**  
**Profile**  
GET /api/doctor/profile  
PUT /api/doctor/profile

**Consultation Handling**  
GET /api/doctor/consultations  
GET /api/doctor/consultations/:id

POST /api/doctor/consultations/:id/start  
POST /api/doctor/consultations/:id/complete

POST /api/doctor/consultations/:id/diagnosis  
POST /api/doctor/consultations/:id/prescription

**Medical History Access**  
GET /api/doctor/patients/:id/history

**12.2 Patient APIs (QR-Based PWA)**  
**Patient Intake**  
GET /api/patient/clinic/:clinicId/details  
POST /api/patient/verify-phone  
POST /api/patient/intake

**Profile**  
GET /api/patient/profile  
PUT /api/patient/profile

**Consultation**  
GET /api/patient/consultations  
GET /api/patient/consultations/:id

**File & X-Ray Management**  
POST /api/files/upload-url  
POST /api/files/confirm-upload  
GET /api/files/:id  
DELETE /api/files/:id

**Payments (Razorpay Integration)**  
POST /api/payments/create-order  
POST /api/payments/verify  
POST /api/payments/webhook

GET /api/admin/payments  
GET /api/admin/payments/:id

**12.2.1 Notifications**  
**Admin**  
GET /api/admin/notifications  
POST /api/admin/notifications  
POST /api/admin/notifications/:id/send  
GET /api/admin/notifications/:id/stats

**Doctor / Patient**  
GET /api/user/notifications  
GET /api/user/notifications/unread-count  
PUT /api/user/notifications/:id/read  
PUT /api/user/notifications/mark-all-read

**12.2.2 Audit & Logs**  
GET /api/admin/audit-logs  
GET /api/admin/activity-logs  
GET /api/superadmin/platform-logs

**12.2.3 Clinic Admin – Branch Management**  
GET    /api/admin/branches  
GET    /api/admin/branches/:id  
POST   /api/admin/branches  
PUT    /api/admin/branches/:id  
DELETE /api/admin/branches/:id

**12.2.4 Clinic Admin – Patient Management**  
POST /api/admin/patients/import  
GET /api/admin/patients/export

All patient APIs are branch-scoped.  
branchId is mandatory and validated against the user’s assigned branches.

**12.2.5 Clinic Admin – Consultation Management**

GET /api/admin/consultations/:id/history

All consultation APIs require branchId filtering.  
Doctors can only access consultations within assigned branchIds.

**12.2.7 Clinic Admin – Reports & Analytics**

GET /api/admin/analytics/doctors

GET /api/admin/analytics/branches

GET /api/admin/analytics/branches/:branchId

**12.3 Request / Response Format Standard**  
All Dental Smart Clinic APIs follow a standardized JSON response structure to ensure consistency across SuperAdmin, Clinic Admin, Doctor, and Patient modules.

**Standard Success Response**  
HTTP Status: 200 OK / 201 Created

{  
  "success": true,  
  "data": {},  
  "message": "Operation successful",  
  "traceId": "req-9f83ab21"  
}  
**Example** – Create Patient  
{  
  "success": true,  
  "data": {  
    "patientId": "uuid",  
    "fullName": "Rahul Sharma",  
    "phone": "9876543210",  
    "clinicId": "uuid"  
  },  
  "message": "Patient created successfully",  
  "traceId": "req-92hf73jd"  
}

**Standard Error Response**  
{  
  "success": false,  
  "error": "Error message",  
  "errorCode": "ERROR\_CODE",  
  "details": {},  
  "traceId": "req-9f83ab21"  
}

**Example** – Invalid Login (401 Unauthorized)

{  
  "success": false,  
  "error": "Invalid email or password",  
  "errorCode": "AUTH\_INVALID\_CREDENTIALS",  
  "details": {  
    "field": "password"  
  },  
  "traceId": "req-19ab7d2"  
}

**Example** – Unauthorized Access (401)  
{  
  "success": false,  
  "error": "Unauthorized",  
  "errorCode": "AUTH\_INVALID\_TOKEN",  
  "details": {  
    "reason": "Invalid or expired token"  
  },  
  "traceId": "req-7gf92jd"  
}

### **Example –** Forbidden (403 Role Violation)

{  
  "success": false,  
  "error": "Insufficient permissions",  
  "errorCode": "AUTH\_ROLE\_FORBIDDEN",  
  "details": {  
    "requiredRole": "admin"  
  },  
  "traceId": "req-abc123"  
}

**Validation Error Format (422)**  
{  
  "success": false,  
  "error": "Validation failed",  
  "errorCode": "VALIDATION\_ERROR",  
  "details": {  
    "phone": "Invalid phone number format",  
    "age": "Age must be greater than 0"  
  },  
  "traceId": "req-882jsj2"  
}

 **Paginated Response**  
All list endpoints (patients, consultations, invoices, notifications,audit logs, etc.) return paginated responses.

{  
  "success": true,  
  "data": \[  
    { ... },  
    { ... }  
  \],  
  "pagination": {  
    "currentPage": 1,  
    "totalPages": 10,  
    "totalItems": 95,  
    "itemsPerPage": 10  
  },  
  "traceId": "req-92hda7"  
}

**Example** – Patient List  
{  
  "success": true,  
  "data": \[  
    {  
      "id": "uuid1",  
      "name": "Rahul Sharma",  
      "phone": "9876543210"  
    },  
    {  
      "id": "uuid2",  
      "name": "Anita Mehta",  
      "phone": "9988776655"  
    }  
  \],  
  "pagination": {  
    "currentPage": 1,  
    "totalPages": 5,  
    "totalItems": 42,  
    "itemsPerPage": 10  
  }  
}

**12.3 Authentication Header**  
All authenticated API requests must include a JWT access token in the header.

Authorization: Bearer \<access\_token\>  
JWT Payload Standard (Access Token )  
Example  
{  
  "sub": "uuid",               
  "role": "superadmin | admin | branch\_admin | subadmin | doctor",  
  "clinicId": "uuid",  
  "tokenType": "access",  
  "branchIds": \["branchId1", "branchId2"\],  
  "iat": 1712340000,  
  "exp": 1712345678  
}  
**Token Rules**

Access Token:

* Expiry: 15–30 minutes  
* Used for all API requests  
* Must validate:  
  * Signature  
  * Expiration  
  * Clinic scope  
  * Role permissions  
  * Branch scope (user must belong to requested branchId)

Refresh Token:

* Expiry: 7–30 days  
* Stored securely (HttpOnly cookie recommended)  
* Used only to generate new access token

**13\. Multi‑Tenancy Implementation (MongoDB – Hybrid Database Strategy)**

**13.1 Tenant Isolation Strategy**

**Tenant: Clinic(organization level)**

 • Each clinic operates independently  
 • A clinic may have multiple branches (locations)  
 • Doctors and staff belong to a clinic and are assigned to one or more branches  
 • Patients belong to a clinic and are registered under a specific branch  
 • No data shared across clinics

Doctors are **not tenants** — they are users inside a tenant.

 **Approach: Database Per Clinic**  
• One MongoDB database per clinic  
• No database per doctor   
• Logical isolation at database level  
• Physical isolation at backup level  
• Branch-level isolation handled logically using branchId inside clinic database

**13.2 Architecture Structure**  
**Example:**

**MongoDB Cluster**  
│  
├── clinic\_64fa9a3d  
│     ├── branches  
│     ├── users  
│     ├── patients(branchId)  
│     ├── consultations(branchId)  
│     ├── treatments(branchId)  
│     ├── prescriptions(branchId)  
│     ├── medical\_files(branchId)  
│     ├── invoices(branchId)  
│     ├── payments(branchId)  
│     ├── notifications  
│     ├── audit\_logs  
│  
├── clinic\_88bd21f1  
│     ├── users  
│     ├── patients  
│     ├── consultations  
│     ├── treatments  
│     ├── prescriptions  
│     ├── medical\_files  
│     ├── invoices  
│     ├── payments  
│     ├── notifications  
│     ├── audit\_logs

**Characteristics**  
**Each Clinic Database Contains:**  
• Patient master records  
• Medical history  
• Appointments  
• Consultations  
• Diagnosis & prescriptions  
• Treatment notes  
• X-ray metadata  
• Billing & invoices  
• Payment transactions  
• Staff accounts (Admin, Doctor, Reception)  
• Branch definitions (locations)  
• Branch-level patient records  
• Branch-level consultations  
• Branch-wise billing and revenue tracking  
• Branch-specific inventory  
• Role definitions  
• Audit logs  
• Clinic analytics  
• Inventory

**13.3 Implementation**

**13.3.1 .Database Connection Strategy**  
Dynamic MongoDB connection manager:

// dbManager.js  
const mongoose \= require('mongoose');  
const connections \= {};  
async function getClinicConnection(clinicId) {  
  const dbName \= \`clinic\_${clinicId}\`;

  if (\!connections\[dbName\]) {  
    connections\[dbName\] \= await mongoose.createConnection(  
      process.env.MONGO\_URI \+ dbName,  
      {  
        maxPoolSize: 10,  
        serverSelectionTimeoutMS: 5000  
      }  
    );  
  }  
  return connections\[dbName\];  
}

module.exports \= { getClinicConnection };

**13.3.2 JWT-Based Tenant Context Injection**  
**Middleware:**  
async function injectTenantScope(req, res, next) {  
const { clinicId, role, sub } \= req.user;

  if (\!clinicId) {  
    return res.status(403).json({  
      success: false,  
      error: "Tenant scope missing"  
    });  
  }  
req.clinicId \= clinicId;  
  req.userId \= sub;  
  req.role \= role;  
 next();  
}

**JWT Payload:**  
{  
  "sub": "user-uuid",  
  "role": "admin | doctor | receptionist",  
  "clinicId": "clinic-uuid",  
  "tokenType": "access",  
  "iat": 1712340000,  
  "exp": 1712345678  
}

**13.3.3 Controller Level Enforcement**  
Access Clinic Database  
const clinicConn \= await getClinicConnection(req.clinicId);

const Patient \= clinicConn.model("Patient", patientSchema);

const patient \= await Patient.findById(req.params.id);

if (\!patient) {  
  return res.status(404).json({ success: false });  
}

Doctor cannot access another clinic because:

 • clinicId comes only from verified JWT  
 • DB name is server-generated  
 • No user-provided DB names

**13.3.4 Role-Based Access Within Tenant**

  **Role	                        Matrix**

| SuperAdmin | All clinics |
| :---- | :---- |
| Clinic Admin | All branches within own clinic |
| Branch Admin | Assigned branch only |
| Doctor | Assigned branch(es) within clinic |
| Receptionist | Assigned branch only |

**13.5 Cross-Tenant Prevention**

**Strict Controls:**

1. Database name generated only server-side   
2. clinicId extracted from verified JWT  
3. No client-controlled DB selection  
4. No cross-database queries  
5. All operational queries must include branchId filtering.  
6. Branch access validated based on user assignment.  
7. SuperAdmin must explicitly switch tenant

**13.5.1 Performance Optimization**

## **Connection Pooling**

 • max Pool Size: 5–10 per clinic DB  
 • Idle timeout configured  
 • Connection reuse

**Indexing Strategy**

All branch-scoped collections must use compound index:  
{ clinicId: 1, branchId: 1 }

**Benefits:**  
• Fast filtering  
• Prevent cross-branch leakage  
• Efficient analytics

**Patients**: {clinicId: 1, branchId: 1, phone: 1 }, {clinicId: 1, branchId: 1, createdAt: \-1 }

**Consultations:** { clinicId: 1, branchId: 1, doctorId: 1, status: 1 }, { clinicId: 1,branchId: 1, severityScore: \-1 }

**Invoices:** { clinicId: 1,branchId: 1, createdAt: \-1 }, {clinicId: 1, branchId: 1, status: 1 }

### **13.5.2 Scalability Model**

• MongoDB Atlas Cluster  
• Horizontal scaling  
• Auto-scaling cluster tier  
• Optional future sharding  
• Load balancer in front of API servers

**Supports:**

* 100+ clinics easily  
* 1,000+ clinics with scaling  
*  Large file storage via S3

### **13.5.3 Backup & Disaster Recovery**

• Daily snapshot per clinic DB  
• Encrypted backups  
• Ability to restore single clinic  
• Export clinic DB on demand  
• Doctor leaving does NOT require DB migration  
**13.6 Performance Optimization**  
The Dental Smart Clinic platform is optimized for real-time clinical operations, secure medical record access, and scalable multi-clinic SaaS deployment.

## **13.6.1 Database Optimization**

• Database-per-clinic architecture reduces cross-tenant load  
• Optimized indexes for high-frequency queries (patients, consultations, billing)  
• Lean queries (`.lean()`) for read-heavy operations  
• Field projection to reduce response size  
• Pagination on all list APIs

**Result:**  
 Fast patient lookup, quick medical history retrieval, and responsive dashboards.

## **13.6.2 Connection Management**

 • Lazy-loaded MongoDB connections per clinic  
 • Connection pooling (maxPoolSize 5–10 per clinic DB)  
 • Connection reuse via caching  
 • Server-side DB name generation (no runtime overhead from user input)

**Result:** Supports hundreds of clinics without connection explosion.

## **13.6.3 Redis Caching Layer**

**Used for:**

 • Live queue updates  
 • Doctor availability status  
 • OTP verification  
 • Rate limiting  
 • Frequently accessed dashboard metrics  
 • JWT blacklist (logout support)

**Result:** Reduced database load and improved real-time responsiveness.

## **13.6.4 Asynchronous Processing**

Background jobs handled via Redis queue:

 • Appointment reminders  
 • Follow-up notifications  
 • Payment verification retries  
 • AI X-ray analysis processing  
 • PDF generation (clinical summaries)  
 • Bulk notification delivery

**Result:** Non-blocking APIs and smooth user experience.

## **13.6.5 File Storage Optimization**

 • X-rays and reports stored in database  
 • Only metadata stored in MongoDB  
 • Pre-signed URL uploads  
 • Optional CDN for faster delivery

**Result:** Scalable and secure medical file handling without database bloat.

## **13.6.6 API Optimization**

 • Standardized JSON response format  
 • Compression enabled (gzip)  
 • Rate limiting on sensitive endpoints  
 • Input validation at middleware level  
 • Minimal payload responses

**Result:** Reduced bandwidth usage and faster mobile performance (important for QR-based PWA).

## **13.6.7 Real-Time Performance**

 • WebSocket-based doctor notification system  
 • In-memory event broadcasting  
 • Lightweight socket rooms per clinic

**Result:** Instant alert when patient completes intake or joins queue.

## **13.6.8 Scalability Strategy**

 • Horizontal scaling via load balancer  
 • Stateless backend servers  
 • MongoDB Atlas cluster scaling  
 • Redis cluster (future-ready)

**Result:** System can scale from 10 clinics to 1,000+ clinics without redesign.

**14\. Security & Authentication**  
**14.1 Password Security**

 **14.1.1Password Hashing**

• Algorithm: **bcrypt**  
 • Salt Rounds:  
 • SuperAdmin: 12  
 • Clinic Admin / Doctor: 11  
 • Receptionist / Staff: 10

 • Minimum Length:  
 • SuperAdmin: 10 characters  
 • Clinic Admin / Doctor: 8 characters  
 • Staff: 8 characters

 • Passwords are never stored in plain text  
 • Hashing performed before saving to MongoDB  
 • Password comparison using `bcrypt.compare()`

**14.1.2 Password Reset**

 • Secure token generated using `crypto.randomBytes()`  
 • Token stored hashed in database  
 • Expiry: 1 hour  
 • One-time use only

**Reset Flow:**

1. User requests password reset  
2. Secure token generated  
3. Email sent with reset link  
4. Token validated \+ expiry checked  
5. Password updated  
6. Reset token invalidated

**14.2 JWT Structure**  
**Access Token Payload**  
{  
  "sub": "userId",  
  "role": "superadmin | admin | branch\_admin | doctor | receptionist",  
  "clinicId": "clinicId",  
  "branchIds": \["branchId1", "branchId2"\],  
  "iat": 1234567890,  
  "exp": 1234999999  
}

**Configuration**  
 • Secret Key: 256-bit environment variable  
 • Algorithm: HS256 (HMAC SHA256)  
 • Access Token Expiry: 15–30 minutes  
 • Refresh Token Expiry: 7–14 days  
 • Token rotation enabled  
 • Logout invalidation via Redis blacklist

**14.2.1 Token Storage**  
• Web App: httpOnly secure cookies (recommended)  
• Admin Panel: Secure httpOnly cookies  
• Mobile App: SecureStore / Keychain   
• Tokens never stored in plain localStorage in production

**14.3 Authorization Levels**  
 **Role Hierarchy**

SuperAdmin  
   ⬇  
Clinic Admin  
   ⬇  
Branch Admin (Optional)  
   ⬇  
Doctor  
   ⬇  
Receptionist / Staff

 Middleware Chain  
 authenticate → injectTenantScope → injectBranchScope → authorize(\[roles\]) →    controller

**Inject Branch Scope:**  
• Validates branchId from request  
• Ensures branchId exists in user.branchIds  
• Prevents cross-branch access

Example:  
router.post(  
  '/api/admin/patients',  
  authenticate,  
  injectTenantScope,  
  authorize(\['admin', 'doctor'\]),  
  createPatient  
);

**Security Enforcement:**

• JWT signature validation  
• Token expiry validation  
• Clinic scope enforcement  
• Role-based access control  
• Branch-level scope enforcement  
• User access validated against assigned branchIds

**14.4 CORS Configuration**  
  const corsOptions \= {  
  origin: \[  
    'http://localhost:3000',  
    'http://localhost:3001',  
    'https://admin.dentalsmart.com',  
    'https://app.dentalsmart.com'  
  \],  
  credentials: true  
};

* Only trusted domains allowed  
*  Credentials enabled for secure cookie auth

**14.4.1 Input Validation**  
 **Request Validation**  
• Library: express-validator / Joi  
• All request bodies validated  
• Type checking enforced  
• Sanitization applied  
• MongoDB operator injection blocked  
• Strict query mode enabled

**Example:**  
mongoose.set('strictQuery', true);

**14.4.2 File Upload Security**  
**Restrictions**  
• Max File Size: 20MB (X-ray images configurable)  
**• Allowed Types:**

1. PDF  
2. JPEG  
3. PNG  
4. DICOM (for XRays)

• Filename Sanitization: Remove special characters  
• MIME type validation  
• Optional virus scanning 

 **Storage**  
• Path structure: /clinic-{clinicId}/branch-{branchId}/patients/{patientId}/  
• Public URLs signed & time-limited  
• Files never stored in MongoDB

### **14.5 XSS Prevention**

**Frontend:**

• React automatic escaping  
 • No unsafe `dangerouslySetInnerHTML`  
 • DOMPurify for rich text

**Backend:**

 • Helmet middleware  
 • Content-Security-Policy headers  
 • HTTP-only cookies

### **14.6 Rate Limiting**

 • Default: 100 requests / 15 minutes per IP  
 • Login: 10 attempts / 15 minutes  
 • Payment: 10 requests / 15 minutes  
 • OTP: 5 attempts / 10 minutes

### **14.7 Audit Logging**

 • Login attempts  
 • Role changes  
 • Patient record updates  
 • Prescription changes

## **14.8 Email Service (Nodemailer)**

 • SMTP credentials stored in environment variables  
 • No hardcoded credentials  
 • Rate limiting on email endpoints  
 • Email templates sanitized

### **14.9 Google OAuth**

**Allowed Roles:**

 • Clinic Admin  
 • Doctor  
 • Receptionist (optional)  
 • Patient (optional)

**Security Measures**:

 • Verify audience (CLIENT\_ID)  
 • Ensure email\_verified \= true  
 • User must already belong to clinic

**15\. Integration Points**

**15.1 Razorpay Payment Gateway**

**Used for:**

 • Consultation payments  
 • Invoice payments  
 • Clinic subscription plans (if SaaS billing enabled)

**15.1.1 Configuration**

const Razorpay \= require('razorpay');

const razorpay \= new Razorpay({  
  key\_id: process.env.RAZORPAY\_KEY\_ID,  
  key\_secret: process.env.RAZORPAY\_KEY\_SECRET  
});

**15.1.2 Order Creation**  
const order \= await razorpay.orders.create({  
  amount: amount \* 100, // Amount in paise  
  currency: 'INR',  
  receipt: \`receipt\_${Date.now()}\`,  
  notes: {  
    clinicId,  
    patientId,  
    invoiceId  
  }  
});

**15.1.3 Payment Verification**  
const crypto \= require('crypto');

const text \= razorpayOrderId \+ "|" \+ razorpayPaymentId;

const signature \= crypto  
  .createHmac('sha256', process.env.RAZORPAY\_KEY\_SECRET)  
  .update(text)  
  .digest('hex');

if (signature \=== razorpaySignature) {  
  // Payment verified  
}

**15.1.4 Webhook Endpoint**  
POST /api/payments/webhook

**Purpose:**

 • Handle payment success  
 • Handle payment failures  
 • Process refunds  
 • Update invoice status  
 • Update clinic subscription status

**Security:**

 • Validate Razorpay webhook signature  
 • Idempotency check before updating DB

### **15.2 WebSocket (Real-Time Notifications)**

**Used for:**

 • Patient QR intake completion alerts  
 • Live queue updates  
 • Doctor consultation status updates  
 • Real-time severity alerts

**Setup (Socket.IO Example)**

const { Server } \= require("socket.io");

const io \= new Server(server, {

  cors: {

    origin: process.env.FRONTEND\_URL,

    credentials: true

  }

});

**Emit Event**

io.to(\`clinic\_${clinicId}\`).emit("new\_patient\_intake", {

  patientId,

  severityScore,

  timestamp: Date.now()

});

**Room Strategy**

• Each clinic has its own socket room  
 • Doctors join room: `clinic_<clinicId>`  
 • Prevents cross-clinic real-time leakage

**15.3 Email Service (Nodemailer)**

**Used for:**

 • Clinic registration approval  
 • Doctor onboarding  
 • Patient appointment confirmation  
 • Appointment reminders  
 • Password reset  
 • Invoice receipt

**Configuration**

const nodemailer \= require('nodemailer');

const transporter \= nodemailer.createTransport({

  host: process.env.SMTP\_HOST,

  port: process.env.SMTP\_PORT,

  secure: true,

  auth: {

    user: process.env.SMTP\_USER,

    pass: process.env.SMTP\_PASS

  }

});

**Send Email**

await transporter.sendMail({

  from: '"Dental Smart Clinic" \<no-reply@dentalsmart.com\>',

  to: user.email,

  subject: 'Appointment Confirmation',

  html: emailTemplate({

    name: user.name,

    clinicName,

    appointmentDate

  })

});

**Email Templates**

Location:

server/src/utils/[emailTemplates.js](http://emailTemplates.js)

**Available Templates:**

 • Clinic approval email  
 • Doctor onboarding email  
 • Patient appointment confirmation  
 • Appointment reminder  
 • Password reset email  
 • Invoice receipt

**Security:**

 • SMTP credentials in environment variables  
 • No hardcoded secrets  
 • Rate limiting on email-trigger endpoints

### **15.4 Google OAuth**

Used for:

• Clinic Admin login  
 • Doctor login  
 • Optional patient login

**Setup**

const { OAuth2Client } \= require('google-auth-library');

const client \= new OAuth2Client(process.env.GOOGLE\_CLIENT\_ID);

**Verify Token**

async function verifyGoogleToken(token) {

  const ticket \= await client.verifyIdToken({

    idToken: token,

    audience: process.env.GOOGLE\_CLIENT\_ID

  });

  const payload \= ticket.getPayload();

  return {

    email: payload.email,

    name: payload.name,

    picture: payload.picture,

    googleId: payload.sub,

    emailVerified: payload.email\_verified

  };

}

**15.5 OAuth Flow:**

1. User logs in with Google  
2. Frontend receives ID token  
3. Backend verifies token  
4. Ensure `email_verified = true`  
5. User must belong to clinic  
6. Generate JWT (clinic-scoped)  
7. Return access \+ refresh token

**Security:**

 • Verify audience  
 • Enforce clinic membership  
 • Prevent cross-clinic login  
 • JWT issued only after validation

### **15.6 Redis (Caching & Background Jobs)**

**Used for:**

 • OTP verification  
 • Rate limiting  
 • JWT blacklist  
 • Appointment reminder jobs  
 • Follow-up notification jobs

**Example Setup**  
const Redis \= require("ioredis");  
const redis \= new Redis(process.env.REDIS\_URL);

**Queue Processing**

**Used for:**

• Scheduled reminders  
 • AI X-ray analysis processing  
 • Bulk notification delivery  
 • PDF generation

### **Part V: Deployment & Maintenance**

### **16\. Deployment Architecture** 

**16.1 Recommended Production Setup**

**16.1.1 Infrastructure Components**

**Load Balancer**

• SSL termination (TLS 1.2+)

• Health check monitoring (/health endpoint)

• WebSocket support enabled

• Automatic request distribution

**App Servers (Horizontal Scaling)**

 • 2+ backend instances (Node.js / FastAPI)  
 • Stateless architecture (JWT-based auth)  
 • No in-memory session storage  
 • PM2 (Node) or Gunicorn/Uvicorn (FastAPI)  
 • Auto-scaling based on CPU / memory

**Deployment Options:**  
 • DigitalOcean Droplets  
 • Render / Railway (for smaller scale)

**Database Layer**

 • MongoDB Atlas (Recommended – Managed)  
 • Database-per-clinic architecture  
 • Replica set  
 • Daily automated backups  
 • TLS encryption enabled  
 • IP whitelisting

**Cache & Queue Layer**

**Used for:**

 • OTP storage  
 • JWT blacklist  
 • Rate limiting  
 • Background jobs  
 • Appointment reminders  
 • Notification queues

**Security:**

 • Signed URLs (time-limited)  
 • Server-side encryption  
 • Folder structure per clinic

**Real-Time Layer**

• WebSocket server (Socket.IO)  
• Sticky sessions enabled (if needed)  
• Room-based per clinic

### **16.2 Environment Variables**

**Server (.env)**  
\# Server  
NODE\_ENV=production  
PORT=5000

\# Database  
MONGODB\_CLUSTER\_URI=mongodb+srv://...  
REDIS\_URL=redis://...  
\# JWT  
JWT\_SECRET=super\_secure\_256\_bit\_key  
JWT\_ACCESS\_EXPIRE=30m  
JWT\_REFRESH\_EXPIRE=14d

\# Razorpay  
RAZORPAY\_KEY\_ID=rzp\_live\_...  
RAZORPAY\_KEY\_SECRET=...

\# Email (SMTP)  
SMTP\_HOST=smtp.gmail.com  
SMTP\_PORT=465  
SMTP\_USER=no-reply@dentalsmart.com  
SMTP\_PASS=app\_password

\# Google OAuth  
GOOGLE\_CLIENT\_ID=...  
GOOGLE\_CLIENT\_SECRET=...

\# App URLs  
FRONTEND\_URL=https://admin.dentalsmart.com  
APP\_URL=https://app.dentalsmart.com  
API\_URL=https://api.dentalsmart.com

\# Rate Limiting  
RATE\_LIMIT\_WINDOW=900000  
RATE\_LIMIT\_MAX=100

**Admin Panel (.env)**  
REACT\_APP\_API\_URL=https://api.dentalsmart.com  
REACT\_APP\_SOCKET\_URL=wss://[api.dentalsmart.com](http://api.dentalsmart.com)  
**Mobile App (.env)**  
EXPO\_PUBLIC\_API\_URL=https://api.dentalsmart.com  
EXPO\_PUBLIC\_SOCKET\_URL=wss://[api.dentalsmart.com](http://api.dentalsmart.com)

### **16.3 Deployment Process**

## **Backend Deployment (EC2 Example)**

**16.1 Prepare Code**  
git clone https://github.com/your-repo/dental-smart-clinic.git  
cd dental-smart-clinic  
npm install \--production

**16.2 Configure Environment**  
cp .env.example .env  
nano .env

**16.3 Start with PM2**  
pm2 start src/server.js \--name dental-api \-i max  
pm2 save  
pm2 startup

**16.4 Configure Nginx (Reverse Proxy \+ SSL)**  
server {  
    listen 80;  
    server\_name api.dentalsmart.com;  
    return 301 https://$host$request\_uri;  
}

server {  
    listen 443 ssl http2;  
    server\_name api.dentalsmart.com;

    ssl\_certificate /etc/letsencrypt/live/api.dentalsmart.com/fullchain.pem;  
    ssl\_certificate\_key /etc/letsencrypt/live/api.dentalsmart.com/privkey.pem;

    location / {  
        proxy\_pass http://localhost:5000;  
        proxy\_http\_version 1.1;  
        proxy\_set\_header Upgrade $http\_upgrade;  
        proxy\_set\_header Connection 'upgrade';  
        proxy\_set\_header Host $host;  
        proxy\_set\_header X-Real-IP $remote\_addr;  
        proxy\_set\_header X-Forwarded-For $proxy\_add\_x\_forwarded\_for;  
    }  
}

**Frontend Deployment**  
**Admin Panel (Vercel Recommended)**  
cd admin  
npm install  
npm run build  
vercel \--prod

**Patient PWA Deployment**  
• Deploy via Vercel / Netlify  
• Enable HTTPS  
• Enable service workers  
• Optimize for mobile

**Mobile App Deployment (Expo)**  
eas build \--platform android \--profile production  
eas build \--platform ios \--profile production  
eas submit \--platform android

**16.4 Deployment Checklist**  
**Pre-Deployment**

 • \[ \] All environment variables configured  
 • \[ \] MongoDB cluster ready  
 • \[ \] Redis instance ready  
 • \[ \] S3 bucket created  
 • \[ \] Razorpay live keys configured  
 • \[ \] SMTP credentials verified  
 • \[ \] Google OAuth credentials configured  
 • \[ \] DNS records configured  
 • \[ \] SSL certificate obtained

**Deployment**  
• \[ \] Backend deployed and running  
• \[ \] PM2 configured  
• \[ \] WebSocket working  
• \[ \] Admin panel deployed  
• \[ \] Patient PWA deployed  
• \[ \] Mobile app built  
• \[ \] Razorpay webhook configured

**Post-Deployment**  
• \[ \] Health check endpoint working  
• \[ \] Login tested (all roles)  
• \[ \] Email sending tested  
• \[ \] WebSocket real-time tested  
• \[ \] File upload tested  
• \[ \] Background jobs working  
• \[ \] Monitoring alerts enabled

**Production Monitoring Recommendations**  
• PM2 Monitoring  
• MongoDB Atlas alerts  
• Redis monitoring  
• Sentry error tracking

**17\. System Monitoring**

**17.1 Monitoring Tools**

**17.1.1 PM2 Monitoring (Application Layer)**  
Used for managing and monitoring backend API processes.

### **Process Management**

pm2 list                 \# List running processes  
pm2 monit                \# Real-time CPU & memory monitoring  
pm2 logs dental-api      \# View logs  
pm2 restart dental-api   \# Restart application  
pm2 status               \# Check health status

**Metrics Monitored**

 • CPU usage  
 • Memory consumption  
 • Uptime  
 • Restart count  
 • Event loop delay  
 • Process crashes

**Purpose:**

 • Detect memory leaks  
 • Prevent downtime  
 • Monitor load under peak clinic usage

**17.1.2 Sentry (Error & Performance Tracking)**

Used for real-time error tracking and performance monitoring.

**Setup**

const Sentry \= require('@sentry/node');

Sentry.init({

  dsn: process.env.SENTRY\_DSN,

  environment: process.env.NODE\_ENV,

  tracesSampleRate: 0.5

});

// Error handler middleware

app.use(Sentry.Handlers.errorHandler());

**Benefits**

 • Real-time error alerts  
 • Full stack traces  
 • Request context  
 • User context (clinicId, role)  
 • Performance tracing  
 • API response time tracking

Critical for medical-grade reliability.

**17.1.3 MongoDB Atlas Monitoring**

Monitors database health across all clinic databases.

**Metrics Available**

 • Query performance  
 • Active connections  
 • Database size  
 • Index usage  
 • Slow query detection  
 • Disk I/O  
**Alerts**

 • High CPU usage  
 • Connection spikes  
 • Slow queries  
 • Disk nearing limit  
 • Replica set failure

Ensures tenant database stability.

**17.1.4 Redis Monitoring**

**Monitors:**

• Memory usage  
• Connected clients  
• Key expiration rate  
• Queue job failures  
• Latency

**Alerts configured for:**

• Redis unavailable  
• High memory usage  
• Queue backlog

**Ensures:**

• OTP reliability  
• Background jobs working  
• Notification delivery stability

**17.1.5 Razorpay Monitoring**

**Monitors:**

 • Payment success rate  
 • Failed transactions  
 • Refund errors  
 • Webhook failures

Critical for revenue tracking and billing accuracy.

**17.1.6 Custom Health Check Endpoint**

**Endpoint:**

GET /api/health

**Implementation:**

app.get('/api/health', async (req, res) \=\> {

  const health \= {  
    uptime: process.uptime(),  
    timestamp: Date.now(),  
    status: 'ok',  
    services: {  
      mongodb: 'checking',  
      redis: 'checking'  
    }  
  };

  try {  
    await mongoose.connection.db.admin().ping();  
    health.services.mongodb \= 'ok';  
  } catch (err) {  
    health.services.mongodb \= 'error';  
    health.status \= 'error';  
  }

  try {  
    await redis.ping();  
    health.services.redis \= 'ok';  
  } catch (err) {  
    health.services.redis \= 'error';  
    health.status \= 'error';  
  }

  const statusCode \= health.status \=== 'ok' ? 200 : 503;  
  res.status(statusCode).json(health);  
});

**Used by**: Load balancer health checks ,uptime monitoring services

### **17.2 Logging Strategy**

Logging Library: Winston (Recommended)

### **Log Levels**

 • error – Application errors  
 • warn – Potential issues  
 • info – Normal operations  
 • debug – Development only

**Logs Include:**

• User ID  
• Clinic ID  
• API route  
• Request method  
• Response status  
• Execution time

**17.3 Backup Strategy**

**Database Backups**

 • Daily automated MongoDB Atlas snapshots  
 • Retention: 30 days  
 • Point-in-time recovery enabled  
 • Restore per clinic database possible

**File Backups**

• S3 redundancy (multi-AZ)  
• Optional cross-region replication  
• Versioning enabled

**17.4 Alerting**  
• Server down  
• Database unreachable  
• Redis failure  
• Payment webhook failure

**Warning Alerts**  
• CPU usage \> 80%  
• Memory usage \> 85%  
• Slow API responses (\> 2 seconds)

**Notification Channels**  
• Email  
• Slack (recommended)  
• SMS (for critical outages)

**18\. Scalability Considerations**

**18.1 Current Capacity**

Estimated Capacity (Single Server – Moderate Instance e.g., 4 vCPU / 8GB RAM)

• 10–25 clinics

• 5,000–15,000 total patients

• 300–800 concurrent users (Doctors \+ Staff \+ Patients)

• 50–150 simultaneous consultations

• 200–400 real-time queue updates

**18.2 Horizontal Scaling**

**Load Balancing**

• Multiple backend instances (2+ minimum)

• Stateless JWT-based authentication

• WebSocket support enabled

• Sticky sessions only if required

**Because the backend is stateless:**

• Easy to add new app servers

• No session replication required

• Auto-scaling compatible

**Scale horizontally when:**

• CPU usage \> 70% consistently

• Memory usage \> 80%

• API average response time \> 500ms

• WebSocket latency increases

**18.3 Database Scaling**

**Current Strategy**

• Database-per-clinic architecture

• MongoDB Atlas Replica Set : 1 Primary, 2 Secondaries

**Benefits:**

• High availability

• Automatic failover

• Backup per clinic

**Read Scaling**

• Read-heavy queries routed to secondary nodes (optional)

• Connection pooling enabled

• Index-optimized patient & consultation queries

**Future Strategy:**

• MongoDB sharding

• Shard key: clinicId

• Each clinic database logically isolated

• Minimal cross-shard operations

**18.4 Caching Strategy**

Redis Caching

**Used for:**

• OTP verification (short TTL)

• JWT blacklist

• Rate limiting counters

• Frequently accessed dashboard metrics

• Doctor availability status

• Live queue state

**TTL Strategy:**

• OTP: 5–10 minutes

• Session blacklist: access token lifetime

• Dashboard metrics: 1–5 minutes

**18.5 File Storage Scalability**

• X-rays stored in databases.

• No binary storage in MongoDB

• Signed URLs for upload/download

• CDN optional for large traffic

**Benefits:**

• Infinite storage scalability

• Reduced DB load

• Faster file delivery

**18.6 Background Job Scalability**

**Redis Queue supports:**

• Appointment reminders

• Follow-up notifications

• AI X-ray analysis

• Bulk notifications

• PDF generation

**Scaling Strategy:**

• Separate worker processes

• Dedicated queue workers for heavy jobs

• Horizontal scaling of workers

**18.7 Performance Optimization**

**Database**

• Indexes on high-frequency fields

• Pagination on all list APIs

• Lean queries for read-only endpoints

• Field projection (return minimal fields)

• Avoid N+1 queries

**API Layer**

• Gzip compression enabled

• Rate limiting

• Efficient JSON payload structure

• Non-blocking async operations

• Background processing for heavy tasks

**Frontend / PWA**

• Code splitting

• Lazy loading

• Minimal API payloads

• Optimized image sizes

• Service worker caching (PWA)

**18.8 Future Enterprise Scaling**

**For large dental chains:**

• Multi-region deployment

• Read replicas in multiple regions

• Dedicated cluster tier per enterprise client

**Scalability Summary**

The Dental Smart Clinic platform is designed to scale:

• Vertically (upgrade instance size)

• Horizontally (add app servers)

• At database level (replica set → sharding)

**19\. Maintenance & Future Roadmap**

**19.1 Maintenance Strategy**

**19.1.1 Preventive Maintenance**

**Regular scheduled activities to ensure system stability:**

• Weekly dependency updates (security patches)

• Monthly MongoDB index review

• Quarterly performance audit

• SSL certificate renewal monitoring

• Log rotation & cleanup

**19.1.2 Corrective Maintenance**

**Triggered when issues occur:**

• Bug fixing with version control tracking

• Hotfix deployment using CI/CD

• Database recovery from backup (if required)

• Incident response documentation

**19.1.3 Adaptive Maintenance**

**Changes due to evolving requirements:**

• Regulatory compliance updates (healthcare standards)

• MongoDB version upgrades

• Node.js LTS upgrades

**19.2 Versioning Strategy**

**Backend Versioning**

• REST API versioning: /api/v1/...

• Backward compatibility maintained for major releases

• Deprecation notices before breaking changes

**Mobile & Admin App Versioning**

• Semantic Versioning (MAJOR.MINOR.PATCH)

• Mandatory update enforcement for critical security fixes

• Store release tracking (Android / iOS)

**19.3 Continuous Integration & Deployment (CI/CD)**

• GitHub Actions / GitLab CI

• Docker (optional containerization)

• PM2 reload for zero-downtime deployment

**19.4 Data Maintenance**

Database Optimization

• Remove inactive sessions

• Archive old appointment logs (\> 3 years configurable)

• Cleanup expired password reset tokens

• Monitor unused indexes

• Remove unused patient documents (if deleted)

• Auto-delete expired signed URLs

**19.5 Audit & Compliance**

**Because this is a healthcare system:**

• Audit logs retained minimum 1–3 years

• Login activity tracking

• Sensitive data access tracking

• Encrypted backups

• Role-based access enforcement

• Optional HIPAA/GDPR readiness support

**19.6 Future Enhancements Roadmap**

**Phase 1 Enhancements**

• Real-time appointment dashboard

• Advanced clinic revenue analytics

• Doctor performance AI scoring

• Multi-language support

• AI-Assisted Dental Scan & Clinic Recommendation Chatbot — guided dental self-assessment via mobile camera with AI visual analysis and automated dentist matching to drive patient engagement and appointment conversions (see Section 9.11, 10.9)

**Phase 2 Enhancements**

• AI-powered diagnosis assistance (extended by Dental Scan module)

• Tele-consultation (video integration)

• Insurance claim management module

• Automated Prescription Follow-Up & Care Reminder System — converts prescriptions into scheduled patient reminders (push, SMS, call) with compliance tracking visible to doctors, improving post-treatment adherence and outcomes (see Section 9.12, 10.10)

**Phase 3 Enhancements**

• Multi-branch clinic management

• Franchise management dashboard

• Predictive patient retention analytics

• Data warehouse for advanced reporting

• Clinical Inventory & Procedure Readiness Management System — centralized equipment and material tracking integrated with appointment scheduling, ensuring complex procedures are only scheduled when all required materials are available, with automated reservation, restocking alerts, and procedure readiness notifications (see Section 9.13, 10.11)

**19.7 Long-Term Scalability Vision**

• Auto database sharding (clinic-level)

• Kubernetes container orchestration

• Microservices architecture (future split)

• Dedicated analytics service

• Real-time event streaming (Kafka optional)

### 

### 

### 

### 

### 

### **20\. Technical Debt & Recommendations**

### **20.1 Current Technical Debt**

### **20.1.1 Testing Coverage**

**Issue:**  
No comprehensive unit or integration tests implemented across modules (Clinic, Doctor, Patient, Billing, Notifications).

**Recommendation:**  
• Add Jest unit tests for service layer logic  
• Test authentication & tenant isolation middleware  
• Test payment verification (Razorpay signature validation)  
• Test consultation lifecycle workflow  
• Test multi-database connection manager  
• Target: Minimum 70% backend code coverage

**Estimated Effort:** 2–3 weeks

### **20.1.2 API Documentation**

**Issue:**  
**No formal Swagger / OpenAPI documentation available.**

**Recommendation:**  
• Integrate Swagger (OpenAPI 3.0)  
• Document all endpoints (SuperAdmin, Clinic Admin, Doctor, Patient)  
• Include request/response schemas  
• Document JWT authentication header  
• Add example requests for critical flows (intake, payment, consultation)

Estimated Effort: 1 week

### **20.1.3 Error Handling Standardization**

**Issue:**  
Some controllers return inconsistent error formats.

Recommendation:  
• Implement centralized error handling middleware  
• Standardize JSON error structure  
• Log errors with userId \+ clinicId context  
• Avoid exposing internal stack traces in production

**Estimated Effort:** 3–4 days

### **20.1.4 Code Comments & Documentation**

**Issue:**  
Minimal inline documentation for business logic and multi-tenancy flow.

Recommendation:  
• Add JSDoc comments to service functions  
• Document DB connection manager logic  
• Explain tenant injection middleware  
• Document AI analysis integration points

**Estimated Effort**: 1 week

## **20.2 Performance Improvements**

### **20.2.1 Database Query Optimization**

**Current:**  
Some queries return full documents unnecessarily.

**Recommendation:**  
• Use projection (select) to fetch required fields only  
• Implement pagination for all listing endpoints  
• Use .lean() for read-only queries  
• Add indexes for:

* patient phone  
* appointment date \+ status  
* consultation createdAt  
* invoice createdAt

### **20.2.2 Caching Strategy Enhancement**

**Current:**  
Redis used minimally.

**Recommendation:**  
• Cache frequently accessed dashboard metrics  
• Cache clinic configuration data  
• Cache doctor availability slots  
• Implement TTL-based invalidation  
• Use Redis for rate limiting & queue processing

### **20.2.3 File & Image Optimization**

**Current:**  
Original images (X-rays) stored without compression strategy.

**Recommendation**:  
• Compress JPEG/PNG on upload  
• Generate thumbnail previews  
• Use signed URLs with expiration  
• Consider WebP conversion for non-medical images

## **20.3 Security Improvements**

### **20.3.1 Input Sanitization**

**Current:**  
Basic validation implemented.

**Recommendation:**  
• Block MongoDB operator injection ($, .)  
• Sanitize rich text (if added later)  
• Validate file MIME type \+ magic numbers  
• Enforce stricter password policy for admins

### **20.3.2 Audit Logging**

**Current:**  
Limited audit tracking.

**Recommendation:**  
• Log all Clinic Admin actions  
• Log doctor access to patient records  
• Log billing updates & refunds  
• Retention policy: Minimum 1 year  
• Add IP \+ device logging for sensitive actions

### **20.3.3 Secrets Management**

**Current:**  
Secrets stored in .env files.

**Recommendation:**  
• Rotate JWT secret annually  
• Rotate Razorpay keys periodically  
• Prevent secrets from being committed to Git

### **20.4 Code Quality**

### **20.4.1 Linting Enforcement**

Current:  
ESLint configured but not enforced in CI/CD.

Recommendation:  
• Fix existing lint warnings  
• Add Husky pre-commit hooks  
• Fail CI build if lint errors exist

### **20.4.2 Controller Refactoring**

**Current:**  
Some controllers handle multiple responsibilities.

**Recommendation:**  
• Extract business logic to service layer  
• Follow Single Responsibility Principle  
• Separate DB logic from request handling  
• Introduce DTO validation layer

## **20.5 Maintenance Recommendations**

### **Daily**

• Monitor server logs (PM2)  
• Review Sentry errors  
• Check payment failures  
• Verify health check endpoint

### **Weekly**

• Monitor DB size growth  
• Review slow queries  
• Review failed login attempts  
• Validate backup completion

### **Monthly**

• Test database restore process  
• Update dependencies (security patches)  
• Review audit logs  
• Review clinic usage analytics

### **Quarterly**

• Security audit  
• Performance benchmark test  
• Load testing (concurrent consultations)  
• Review infrastructure cost optimization

### **20.6 Project Status**

**Dental Smart Clinic – Version 1.0** is production-ready with core modules implemented:

• Multi-tenant hybrid database architecture  
• Clinic \+ Doctor database isolation  
• Patient intake & consultation workflow  
• Billing & Razorpay payment integration  
• Role-based authentication  
• File & X-ray management  
• Notification system  
• Deployment-ready infrastructure

## **Key Achievements**

• Hybrid Multi-Tenant Architecture (Clinic DB \+ Doctor DB)  
• 80+ API Endpoints across roles  
• Secure JWT-based authentication  
• Payment integration with Razorpay  
• Scalable horizontal deployment design  
• Healthcare-ready security model

## 

## 

## 

## **Project Metrics (Estimated)**

| Metric | Value |
| ----- | ----- |
| Total Backend Files | 150+ |
| Database Collections | 20+ (clinic \+ doctor scoped) |
| API Endpoints | 80+ |
| Backend LOC | \~12,000 |
| Frontend LOC | \~18,000 |
| Development Time |  |

## 

## **Next Steps**

• Implement automated testing  
• Add Swagger documentation  
• Strengthen audit logging  
• Introduce Kubernetes (future scaling)

## **Documentation Maintenance**

**This document should be updated:**

• After schema changes  
• When APIs are modified  
• During major version upgrades  
• After infrastructure scaling

**Current Version:** 1.0

**Last Updated:** 24 February 2026

**Maintained By:** Development Team

[image1]: <data:image/png;base64,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>

[image2]: <data:image/png;base64,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>

[image3]: <data:image/png;base64,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>

[image4]: <data:image/png;base64,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>

[image5]: <data:image/png;base64,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>

[image6]: <data:image/png;base64,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>