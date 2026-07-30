import { Navigate } from 'react-router-dom';
import { useTenantAuth } from '../tenant/TenantAuthContext';

export default function PatientProtectedRoute({ children }) {
  const { isAuthenticated, loading, user } = useTenantAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="w-8 h-8 border-3 border-primary-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/patient/login" replace />;

  // Only allow patient and guardian roles
  if (user?.role !== 'patient' && user?.role !== 'guardian') {
    return <Navigate to="/clinic" replace />;
  }

  return children;
}
