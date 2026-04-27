import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth.js';
import { can as canByPermission } from '../permissions/permissions.js';
import { resolveRoutePermission } from '../navigation/routePermissionMap.js';

export default function RequireRole({ allowedRoles, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  const permission = resolveRoutePermission(location.pathname);
  const permissionAllowed = permission ? canByPermission(user, permission) : false;
  const isMaster = user.isMaster === true || String(user?.role || '').toLowerCase() === 'master';
  const allowed = isMaster ? true : permissionAllowed;
  if (!allowed) {
    return <Navigate to="/gestao/dashboard" replace state={{ accessDeniedMessage: 'Você não tem permissão para acessar esta área.' }} />;
  }
  return children;
}
