import { resolveRoutePermission } from './routePermissionMap.js';
import { canAccessRoute } from '../tenant/tenantAccess.js';
import { can as canByPermission } from '../permissions/permissions.js';
import { isPrivilegedUser, isRoutePermissionAllowed } from '../utils/rbacHelpers.js';

export const DEFAULT_SAFE_LANDING = '/gestao/dashboard';

export function isNavRoleAllowed(user, allowedRoles) {
  if (!user) return false;
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (allowedRoles.includes('*')) return true;
  if (user.role === 'master' || user.role === 'admin' || user.role === 'owner') return true;
  return allowedRoles.includes(user.role);
}

export function canSeeNavItem(user, item, modules, flags) {
  if (!user) {
    return { allowed: false, roleAllowed: false, moduleAllowed: false, permissionAllowed: false };
  }
  const roleAllowed = isNavRoleAllowed(user, item.rolesAllowed);
  const moduleAllowed = canAccessRoute(item.route, modules, flags);
  const permission = resolveRoutePermission(item.route);
  const permissionAllowed = isRoutePermissionAllowed(user, permission, canByPermission);
  const isMaster = isPrivilegedUser(user);
  const allowed = isMaster
    ? moduleAllowed
    : moduleAllowed && permissionAllowed;
  return { allowed, roleAllowed, moduleAllowed, permissionAllowed };
}

/**
 * Rota de entrada da categoria: defaultRoute só se o guard também permitir.
 * Evita bounce Dashboard ← RequireRole ao clicar no ícone da área.
 */
export function resolveCategoryLandingRoute(
  category,
  user,
  modules,
  flags,
  { fallback = DEFAULT_SAFE_LANDING, seeNavItem = canSeeNavItem } = {},
) {
  const items = Array.isArray(category?.items) ? category.items : [];
  const allowed = items.filter((item) => seeNavItem(user, item, modules, flags).allowed);
  if (!allowed.length) return fallback;
  const defaultRoute = category?.defaultRoute;
  if (defaultRoute && allowed.some((item) => item.route === defaultRoute)) return defaultRoute;
  return allowed[0].route || fallback;
}
