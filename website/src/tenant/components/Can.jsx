import { useTenantAuth } from '../TenantAuthContext';

/**
 * Element-level permission gate. Renders children only if the user
 * has the required permission(s).
 *
 * Usage:
 *   <Can permission="user:create">
 *     <button>Add Staff</button>
 *   </Can>
 *
 *   <Can any={['invoice:read', 'payment:read']}>
 *     <BillingSection />
 *   </Can>
 */
export default function Can({ permission, any, all, fallback = null, children }) {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = useTenantAuth();

  if (permission && !hasPermission(permission)) return fallback;
  if (any && !hasAnyPermission(...any)) return fallback;
  if (all && !hasAllPermissions(...all)) return fallback;

  return children;
}
