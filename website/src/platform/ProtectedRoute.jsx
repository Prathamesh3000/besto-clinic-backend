import { Navigate } from 'react-router-dom';
import { usePlatformAuth } from './AuthContext';

const ALLOWED_ROLES = ['product_owner', 'super_admin'];

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, user } = usePlatformAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/platform/login" replace />;

  // Only product_owner and super_admin may access platform routes
  if (!user?.role || !ALLOWED_ROLES.includes(user.role)) {
    return <Navigate to="/platform/login" replace />;
  }

  return children;
}
