import { Navigate } from 'react-router-dom';
import { useTenantAuth } from './TenantAuthContext';

/**
 * Route-level permission guard. Wraps a route element and redirects
 * to /clinic if the user lacks any of the required permissions.
 *
 * Usage:
 *   <Route path="staff" element={
 *     <PermissionRoute requiredPermissions={['user:read']}>
 *       <StaffManagement />
 *     </PermissionRoute>
 *   } />
 */
export default function PermissionRoute({ children, requiredPermissions = [] }) {
  const { hasAnyPermission } = useTenantAuth();

  if (requiredPermissions.length > 0 && !hasAnyPermission(...requiredPermissions)) {
    return <Navigate to="/clinic" replace />;
  }

  return children;
}
