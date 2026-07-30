import { Navigate } from 'react-router-dom';
import { useTenantAuth } from './TenantAuthContext';

const ALLOWED_ROLES = [
  'admin',
  'manager',
  'department_manager',
  'doctor',
  'receptionist',
  'support_staff',
  'billing_officer',
  'accountant',
  'hr_payroll_manager',
  'it_support',
  'super_admin',
];

export default function TenantProtectedRoute({ children }) {
  const { isAuthenticated, loading, user } = useTenantAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/clinic/login" replace />;

  // Block patient and guardian roles — redirect them to the patient portal
  if (!user?.role || !ALLOWED_ROLES.includes(user.role)) {
    return <Navigate to="/patient" replace />;
  }

  return children;
}
