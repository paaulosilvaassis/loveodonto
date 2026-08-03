import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb } from '../db/index.js';
import { navCategories } from '../navigation/navCategories.js';
import { resolveRoutePermission } from '../navigation/routePermissionMap.js';
import { can as canByPermission } from '../permissions/permissions.js';
import { isPrivilegedUser, isRoutePermissionAllowed } from '../utils/rbacHelpers.js';
import { canAccessRoute, createDefaultModuleMap } from '../tenant/tenantAccess.js';

function collectVisibleRoutes(user, modules, flags) {
  const routes = new Set();
  for (const category of navCategories) {
    for (const item of category.items) {
      const moduleAllowed = canAccessRoute(item.route, modules, flags);
      const permission = resolveRoutePermission(item.route);
      const permissionAllowed = isRoutePermissionAllowed(user, permission, canByPermission);
      const isMaster = isPrivilegedUser(user);
      const allowed = isMaster ? moduleAllowed : moduleAllowed && permissionAllowed;
      if (allowed) routes.add(item.route.trim());
    }
  }
  return routes;
}

describe('manualMenuByRole — matriz de menu (Layout.jsx)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('admin/owner vê menu amplo (dashboard + financeiro + equipe)', () => {
    for (const role of [{ role: 'admin' }, { role: 'owner', isMaster: true }]) {
      const routes = collectVisibleRoutes(role, createDefaultModuleMap(), {});
      expect(routes.has('/gestao/dashboard')).toBe(true);
      expect(routes.has('/financeiro/contas-receber')).toBe(true);
      expect(routes.has('/admin/colaboradores')).toBe(true);
      expect(routes.has('/crm/pipeline')).toBe(true);
    }
  });

  it('financeiro vê financeiro e não vê equipe admin', () => {
    const routes = collectVisibleRoutes({ id: 'u-fin', role: 'financeiro' }, createDefaultModuleMap(), {});
    expect(routes.has('/gestao/dashboard')).toBe(true);
    expect([...routes].some((r) => r.startsWith('/financeiro'))).toBe(true);
    expect(routes.has('/admin/colaboradores')).toBe(false);
  });

  it('dentista vê agenda/pacientes e não vê financeiro', () => {
    const routes = collectVisibleRoutes({ id: 'u-dent', role: 'dentista' }, createDefaultModuleMap(), {});
    expect(routes.has('/gestao/dashboard')).toBe(true);
    expect(routes.has('/gestao/agenda')).toBe(true);
    expect(routes.has('/pacientes/busca')).toBe(true);
    expect([...routes].some((r) => r.startsWith('/financeiro'))).toBe(false);
  });

  it('recepcao vê agenda e não vê financeiro', () => {
    const routes = collectVisibleRoutes({ id: 'u-rec', role: 'recepcao' }, createDefaultModuleMap(), {});
    expect(routes.has('/gestao/dashboard')).toBe(true);
    expect(routes.has('/gestao/agenda')).toBe(true);
    expect([...routes].some((r) => r.startsWith('/financeiro'))).toBe(false);
  });

  it('comercial vê CRM e orçamentos', () => {
    const routes = collectVisibleRoutes({ id: 'u-com', role: 'comercial' }, createDefaultModuleMap(), {});
    expect(routes.has('/gestao/dashboard')).toBe(true);
    expect(routes.has('/crm/pipeline')).toBe(true);
    expect(routes.has('/orcamentos')).toBe(true);
  });
});
