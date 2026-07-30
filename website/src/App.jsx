import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Home from './pages/Home';
import LandingPage from './pages/LandingPage';
import Features from './pages/Features';
import Pricing from './pages/Pricing';
import AboutUs from './pages/AboutUs';
import Contact from './pages/Contact';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import Login from './pages/Login';
import Register from './pages/Register';
import PatientRegister from './pages/PatientRegister';
import DoctorProfile from './pages/DoctorProfile';
import Browse from './pages/Browse';
import ClinicProfile from './pages/ClinicProfile';

/* Platform */
import PlatformLayout from './platform/PlatformLayout';
import PlatformLogin from './platform/pages/PlatformLogin';
import Dashboard from './platform/pages/Dashboard';
import Tenants from './platform/pages/Tenants';
import TenantDetail from './platform/pages/TenantDetail';
import Plans from './platform/pages/Plans';
import Promotions from './platform/pages/Promotions';
import FeatureFlags from './platform/pages/FeatureFlags';
import PlatformUsers from './platform/pages/PlatformUsers';
import RevenueAnalytics from './platform/pages/RevenueAnalytics';
import SubscriptionAnalytics from './platform/pages/SubscriptionAnalytics';
import CustomPlanBuilder from './platform/pages/CustomPlanBuilder';
import IntegrationSettings from './platform/pages/IntegrationSettings';
import PlatformAnalytics from './platform/pages/PlatformAnalytics';
import SystemMonitoring from './platform/pages/SystemMonitoring';
import DentalScanAnalytics from './platform/pages/DentalScanAnalytics';
import JobPortalAnalytics from './platform/pages/JobPortalAnalytics';

import PlatformProtectedRoute from './platform/ProtectedRoute';
import { PlatformAuthProvider } from './platform/AuthContext';

/* Tenant */
import TenantLayout from './tenant/TenantLayout';
import TenantLogin from './tenant/pages/TenantLogin';
import ClinicDashboard from './tenant/pages/Dashboard';
import BranchManagement from './tenant/pages/BranchManagement';
import DepartmentManagement from './tenant/pages/DepartmentManagement';
import RoleMaster from './tenant/pages/RoleMaster';
import DoctorManagement from './tenant/pages/DoctorManagement';
import StaffManagement from './tenant/pages/StaffManagement';
import PatientManagement from './tenant/pages/PatientManagement';
import Appointments from './tenant/pages/Appointments';
import QueueManagement from './tenant/pages/QueueManagement';
import Billing from './tenant/pages/Billing';
import Payroll from './tenant/pages/Payroll';

import Notifications from './tenant/pages/Notifications';
import Reports from './tenant/pages/Reports';
import InsuranceManagement from './tenant/pages/InsuranceManagement';
import DoctorDashboard from './tenant/pages/DoctorDashboard';
import DoctorAppointments from './tenant/pages/DoctorAppointments';
import DoctorPatients from './tenant/pages/DoctorPatients';
import DoctorNotifications from './tenant/pages/DoctorNotifications';
import DoctorVirtualCare from './tenant/pages/DoctorVirtualCare';
import DoctorSchedule from './tenant/pages/DoctorSchedule';
import DoctorConsultation from './tenant/pages/DoctorConsultation';
import DoctorConsultations from './tenant/pages/DoctorConsultations';
import ConsultationDetail from './tenant/pages/ConsultationDetail';
import DoctorCareTaskList from './tenant/pages/DoctorCareTaskList';
import DoctorEmergency from './tenant/pages/DoctorEmergency';
import CareReminderManager from './tenant/pages/CareReminderManager';
import TenantRevenueAnalytics from './tenant/pages/RevenueAnalytics';
import Telemedicine from './tenant/pages/Telemedicine';
import VideoCall from './tenant/pages/VideoCall';
import AnalyticsDashboard from './tenant/pages/AnalyticsDashboard';
import ComplianceDashboard from './tenant/pages/ComplianceDashboard';
import InventoryManagement from './tenant/pages/InventoryManagement';
import BranchMonitor from './tenant/pages/BranchMonitor';
import ClinicQRCode from './tenant/pages/QRCode';
import ClinicSettings from './tenant/pages/ClinicSettings';
import BookingPolicySettings from './tenant/pages/BookingPolicySettings';
import JobPortalDashboard from './tenant/pages/JobPortalDashboard';
import CreateJobPosting from './tenant/pages/CreateJobPosting';
import ApplicantsTable from './tenant/pages/ApplicantsTable';
import BulkUploads from './tenant/pages/BulkUploads';
import PurchaseOrders from './tenant/pages/PurchaseOrders';

import ReceptionistDashboard from './tenant/pages/ReceptionistDashboard';
import ReceptionistAppointments from './tenant/pages/ReceptionistAppointments';
import ReceptionistPatients from './tenant/pages/ReceptionistPatients';
import ReceptionistQueue from './tenant/pages/ReceptionistQueue';
import ReceptionistBilling from './tenant/pages/ReceptionistBilling';
import ReceptionistNotifications from './tenant/pages/ReceptionistNotifications';

import SupportDashboard from './tenant/pages/SupportDashboard';
import SupportAppointments from './tenant/pages/SupportAppointments';
import SupportNotifications from './tenant/pages/SupportNotifications';

import BillingOfficerDashboard from './tenant/pages/BillingOfficerDashboard';
import BillingOfficerInvoices from './tenant/pages/BillingOfficerInvoices';
import BillingOfficerPayments from './tenant/pages/BillingOfficerPayments';
import BillingOfficerInsurance from './tenant/pages/BillingOfficerInsurance';
import BillingOfficerNotifications from './tenant/pages/BillingOfficerNotifications';
import BillingOfficerCreditNotes from './tenant/pages/BillingOfficerCreditNotes';

import AccountantDashboard from './tenant/pages/AccountantDashboard';
import AccountantInvoices from './tenant/pages/AccountantInvoices';
import AccountantReports from './tenant/pages/AccountantReports';
import AccountantNotifications from './tenant/pages/AccountantNotifications';

import HRDashboard from './tenant/pages/HRDashboard';
import HRStaff from './tenant/pages/HRStaff';
import HRPayroll from './tenant/pages/HRPayroll';
import HRNotifications from './tenant/pages/HRNotifications';

import ITDashboard from './tenant/pages/ITDashboard';
import ITSettings from './tenant/pages/ITSettings';

import ITNotifications from './tenant/pages/ITNotifications';

import HolidayCalendar from './tenant/pages/HolidayCalendar';
import TeamCalendar from './tenant/pages/TeamCalendar';
import LeaveManagement from './tenant/pages/LeaveManagement';
import DoctorAvailability from './tenant/pages/DoctorAvailability';
import TenantProtectedRoute from './tenant/TenantProtectedRoute';
import PermissionRoute from './tenant/PermissionRoute';
import { TenantAuthProvider, useTenantAuth } from './tenant/TenantAuthContext';

/* Patient */
import PatientLayout from './patient/PatientLayout';
import PatientDashboard from './patient/pages/PatientDashboard';
import PatientAppointments from './patient/pages/PatientAppointments';
import PatientHealth from './patient/pages/PatientHealth';
import PatientPayments from './patient/pages/PatientPayments';
import PatientEmergency from './patient/pages/PatientEmergency';
import PatientVideoCall from './patient/pages/PatientVideoCall';
import PatientNotifications from './patient/pages/PatientNotifications';
import PatientShareRecords from './patient/pages/PatientShareRecords';
import PatientConsents from './patient/pages/PatientConsents';
import PatientReviews from './patient/pages/PatientReviews';
import PatientActivityLog from './patient/pages/PatientActivityLog';
import PatientProfile from './patient/pages/PatientProfile';
import PatientDependents from './patient/pages/PatientDependents';
import PatientConsultationDetail from './patient/pages/PatientConsultationDetail';
import SharedRecordView from './patient/pages/SharedRecordView';
import PatientLogin from './patient/pages/PatientLogin';
import { PatientAuthProvider } from './patient/PatientAuthContext';

/* Public Career Portal */
import Careers from './pages/Careers';
import JobDetail from './pages/JobDetail';

const ROLE_DASHBOARDS = {
  doctor: '/clinic/doctor-dashboard',
  receptionist: '/clinic/receptionist-dashboard',
  support_staff: '/clinic/support-dashboard',
  billing_officer: '/clinic/billing-officer-dashboard',
  accountant: '/clinic/accountant-dashboard',
  hr_payroll_manager: '/clinic/hr-dashboard',
  it_support: '/clinic/it-dashboard',
};

function ClinicIndex() {
  const { user } = useTenantAuth();
  const dest = ROLE_DASHBOARDS[user?.role];
  if (dest) return <Navigate to={dest} replace />;
  return <ClinicDashboard />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing page — fully standalone, no MainLayout */}
        <Route index element={<LandingPage />} />

        {/* Marketing */}
        <Route element={<MainLayout />}>
          <Route path="browse" element={<Browse />} />
          <Route path="clinics/:slug" element={<ClinicProfile />} />
          <Route path="features" element={<Features />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="about" element={<AboutUs />} />
          <Route path="contact" element={<Contact />} />
          <Route path="blog" element={<Blog />} />
          <Route path="blog/:slug" element={<BlogPost />} />
          {/* Career Portal — public job board */}
          <Route path="careers" element={<Careers />} />
          <Route path="careers/:slug" element={<JobDetail />} />
        </Route>

        {/* Auth pages */}
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />

        {/* Patient login (email-first flow) */}
        <Route path="patient/login" element={<PatientLogin />} />

        {/* Patient registration (from chatbot doctor discovery funnel) */}
        <Route path="patient/register" element={<PatientRegister />} />

        {/* Doctor profile + booking (public view, auth required for booking) */}
        <Route path="clinics/:slug/doctors/:doctorId" element={<DoctorProfile />} />
        <Route path="clinic/:slug/doctor/:doctorId" element={<DoctorProfile />} />

        {/* PLATFORM — All routes wrapped in single auth provider */}
        <Route path="platform" element={<PlatformAuthProvider><Outlet /></PlatformAuthProvider>}>
          {/* Public login route */}
          <Route path="login" element={<PlatformLogin />} />

          {/* Protected platform routes */}
          <Route element={<PlatformProtectedRoute><PlatformLayout /></PlatformProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="tenants" element={<Tenants />} />
            <Route path="tenants/:slug" element={<TenantDetail />} />
            <Route path="plans" element={<Plans />} />
            <Route path="promotions" element={<Promotions />} />
            <Route path="feature-flags" element={<FeatureFlags />} />
            <Route path="revenue" element={<RevenueAnalytics />} />
            <Route path="subscription-analytics" element={<SubscriptionAnalytics />} />
            <Route path="custom-plan-builder" element={<CustomPlanBuilder />} />
            <Route path="users" element={<PlatformUsers />} />
            <Route path="tenants/:slug/integrations" element={<IntegrationSettings />} />
            <Route path="analytics" element={<PlatformAnalytics />} />
            <Route path="dental-scan-analytics" element={<DentalScanAnalytics />} />
            <Route path="job-portal" element={<JobPortalAnalytics />} />
            <Route path="monitoring" element={<SystemMonitoring />} />
          </Route>
        </Route>

        {/* TENANT — All clinic routes wrapped in single auth provider */}
        <Route path="clinic" element={<TenantAuthProvider><Outlet /></TenantAuthProvider>}>
          {/* Public login route */}
          <Route path="login" element={<TenantLogin />} />

          {/* Protected clinic routes */}
          <Route element={<TenantProtectedRoute><TenantLayout /></TenantProtectedRoute>}>
            <Route index element={<ClinicIndex />} />
            <Route path="branches" element={<PermissionRoute requiredPermissions={['branch:read']}><BranchManagement /></PermissionRoute>} />
            <Route path="holidays" element={<PermissionRoute requiredPermissions={['holiday:read']}><HolidayCalendar /></PermissionRoute>} />
            <Route path="team-calendar" element={<PermissionRoute requiredPermissions={['appointment:read']}><TeamCalendar /></PermissionRoute>} />
            <Route path="leave-management" element={<PermissionRoute requiredPermissions={['user:read']}><LeaveManagement /></PermissionRoute>} />
            <Route path="departments" element={<PermissionRoute requiredPermissions={['department:read']}><DepartmentManagement /></PermissionRoute>} />
            <Route path="roles" element={<PermissionRoute requiredPermissions={['user:read']}><RoleMaster /></PermissionRoute>} />
            <Route path="doctors" element={<PermissionRoute requiredPermissions={['user:read']}><DoctorManagement /></PermissionRoute>} />
            <Route path="staff" element={<PermissionRoute requiredPermissions={['user:read']}><StaffManagement /></PermissionRoute>} />
            <Route path="patients" element={<PermissionRoute requiredPermissions={['patient:read']}><PatientManagement /></PermissionRoute>} />
            <Route path="bulk-uploads" element={<PermissionRoute requiredPermissions={['user:create']}><BulkUploads /></PermissionRoute>} />
            <Route path="appointments" element={<PermissionRoute requiredPermissions={['appointment:read']}><Appointments /></PermissionRoute>} />
            <Route path="doctor-availability" element={<PermissionRoute requiredPermissions={['appointment:read']}><DoctorAvailability /></PermissionRoute>} />
            <Route path="queue" element={<PermissionRoute requiredPermissions={['queue:read']}><QueueManagement /></PermissionRoute>} />
            <Route path="inventory" element={<PermissionRoute requiredPermissions={['inventory:read']}><InventoryManagement /></PermissionRoute>} />
            <Route path="purchase-orders" element={<PermissionRoute requiredPermissions={['purchaseOrder:read']}><PurchaseOrders /></PermissionRoute>} />
            <Route path="billing" element={<PermissionRoute requiredPermissions={['invoice:read']}><Billing /></PermissionRoute>} />
            <Route path="insurance" element={<PermissionRoute requiredPermissions={['insurance:read']}><InsuranceManagement /></PermissionRoute>} />
            <Route path="payroll" element={<PermissionRoute requiredPermissions={['payroll:read']}><Payroll /></PermissionRoute>} />

            <Route path="notifications" element={<Notifications />} />
            <Route path="reports" element={<PermissionRoute requiredPermissions={['report:generate']}><Reports /></PermissionRoute>} />
            <Route path="receptionist-dashboard" element={<ReceptionistDashboard />} />
            <Route path="receptionist-appointments" element={<ReceptionistAppointments />} />
            <Route path="receptionist-patients" element={<ReceptionistPatients />} />
            <Route path="receptionist-queue" element={<ReceptionistQueue />} />
            <Route path="receptionist-billing" element={<ReceptionistBilling />} />
            <Route path="receptionist-notifications" element={<ReceptionistNotifications />} />
            <Route path="support-dashboard" element={<SupportDashboard />} />
            <Route path="support-appointments" element={<SupportAppointments />} />
            <Route path="support-notifications" element={<SupportNotifications />} />
            <Route path="billing-officer-dashboard" element={<BillingOfficerDashboard />} />
            <Route path="billing-officer-invoices" element={<BillingOfficerInvoices />} />
            <Route path="billing-officer-payments" element={<BillingOfficerPayments />} />
            <Route path="billing-officer-insurance" element={<BillingOfficerInsurance />} />
            <Route path="billing-officer-credit-notes" element={<BillingOfficerCreditNotes />} />
            <Route path="billing-officer-notifications" element={<BillingOfficerNotifications />} />
            <Route path="accountant-dashboard" element={<AccountantDashboard />} />
            <Route path="accountant-invoices" element={<AccountantInvoices />} />
            <Route path="accountant-reports" element={<AccountantReports />} />
            <Route path="accountant-notifications" element={<AccountantNotifications />} />
            <Route path="hr-dashboard" element={<HRDashboard />} />
            <Route path="hr-staff" element={<HRStaff />} />
            <Route path="hr-payroll" element={<HRPayroll />} />
            <Route path="hr-notifications" element={<HRNotifications />} />
            <Route path="it-dashboard" element={<ITDashboard />} />
            <Route path="it-settings" element={<ITSettings />} />

            <Route path="it-notifications" element={<ITNotifications />} />
            <Route path="doctor-dashboard" element={<DoctorDashboard />} />
            <Route path="doctor-appointments" element={<DoctorAppointments />} />
            <Route path="doctor-patients" element={<DoctorPatients />} />
            <Route path="doctor-notifications" element={<DoctorNotifications />} />
            <Route path="doctor-virtual-care" element={<DoctorVirtualCare />} />
            <Route path="doctor-care-tasks" element={<DoctorCareTaskList />} />
            <Route path="doctor-schedule" element={<DoctorSchedule />} />
            <Route path="doctor-emergency" element={<PermissionRoute requiredPermissions={['emergency:read']}><DoctorEmergency /></PermissionRoute>} />
            <Route path="doctor-consultation/:appointmentId" element={<DoctorConsultation />} />
            <Route path="care-reminders/:patientId" element={<CareReminderManager />} />
            <Route path="consultations" element={<PermissionRoute requiredPermissions={['record:read']}><DoctorConsultations /></PermissionRoute>} />
            <Route path="consultation/:appointmentId" element={<DoctorConsultation />} />
            <Route path="consultation-detail/:appointmentId" element={<PermissionRoute requiredPermissions={['record:read']}><ConsultationDetail /></PermissionRoute>} />
            <Route path="revenue" element={<PermissionRoute requiredPermissions={['revenueReport:view']}><TenantRevenueAnalytics /></PermissionRoute>} />
            <Route path="telemedicine" element={<PermissionRoute requiredPermissions={['telemedicine:read']}><Telemedicine /></PermissionRoute>} />
            <Route path="telemedicine/:id" element={<VideoCall />} />
            <Route path="compliance" element={<PermissionRoute requiredPermissions={['careCompliance:read']}><ComplianceDashboard /></PermissionRoute>} />
            <Route path="analytics" element={<PermissionRoute requiredPermissions={['clinicAnalytics:view']}><AnalyticsDashboard /></PermissionRoute>} />
            <Route path="branch-monitor" element={<PermissionRoute requiredPermissions={['branch:read']}><BranchMonitor /></PermissionRoute>} />
            <Route path="qr-code" element={<ClinicQRCode />} />
            <Route path="settings" element={<PermissionRoute requiredPermissions={['clinic:update']}><ClinicSettings /></PermissionRoute>} />
            <Route path="booking-policy" element={<PermissionRoute requiredPermissions={['clinic:update']}><BookingPolicySettings /></PermissionRoute>} />
            {/* Job Portal */}
            <Route path="jobs" element={<PermissionRoute requiredPermissions={['job:read']}><JobPortalDashboard /></PermissionRoute>} />
            <Route path="jobs/new" element={<PermissionRoute requiredPermissions={['job:create']}><CreateJobPosting /></PermissionRoute>} />
            <Route path="jobs/:id/edit" element={<PermissionRoute requiredPermissions={['job:update']}><CreateJobPosting /></PermissionRoute>} />
            <Route path="jobs/:jobId/applicants" element={<PermissionRoute requiredPermissions={['application:read']}><ApplicantsTable /></PermissionRoute>} />
          </Route>
        </Route>

        {/* PATIENT PORTAL — requires patient auth (same localStorage tokens as chatbot funnel) */}
        <Route path="patient" element={<TenantAuthProvider><PatientAuthProvider><PatientLayout /></PatientAuthProvider></TenantAuthProvider>}>
          <Route index element={<PatientDashboard />} />
          <Route path="appointments" element={<PatientAppointments />} />
          <Route path="health" element={<PatientHealth />} />
          <Route path="payments" element={<PatientPayments />} />
          <Route path="emergency" element={<PatientEmergency />} />
          <Route path="share-records" element={<PatientShareRecords />} />
          <Route path="consents" element={<PatientConsents />} />
          <Route path="reviews" element={<PatientReviews />} />
          <Route path="activity-log" element={<PatientActivityLog />} />
          <Route path="profile" element={<PatientProfile />} />
          <Route path="dependents" element={<PatientDependents />} />
          <Route path="notifications" element={<PatientNotifications />} />
          <Route path="video/:appointmentId" element={<PatientVideoCall />} />
          <Route path="consultation/:appointmentId" element={<PatientConsultationDetail />} />
        </Route>

        {/* Public shared record */}
        <Route path="shared/:token" element={<SharedRecordView />} />

      </Routes>
    </BrowserRouter>
  );
}