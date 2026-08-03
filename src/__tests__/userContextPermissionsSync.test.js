import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import { can, getPermissionsCatalog, getUserAccess, updateUserAccess } from '../services/accessService.js';
import {
  syncCurrentUserPermissionsFromContext,
  sparseOverridesFromEffectiveMap,
} from '../services/collaboratorPermissionPersistence.js';

describe('Sincronização de contexto do usuário logado', () => {
  const USER_ID = 'user-melissa-1';
  const TENANT_ID = 'tenant-1';
  const ROLE = 'gerente';
  const MASTER = { id: 'master-1', role: 'admin', isMaster: true };

  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.users.push({
        id: USER_ID,
        name: 'Melissa',
        email: 'melissa@test.com',
        role: ROLE,
        active: true,
        has_system_access: true,
      });
      return db;
    });
  });

  it('can() usa custom_permissions quando has_custom_permissions=true', () => {
    const catalogIds = getPermissionsCatalog().map((p) => p.id);
    const fullCustom = Object.fromEntries(catalogIds.map((id) => [id, true]));

    updateUserAccess(MASTER, USER_ID, {
      role: ROLE,
      has_custom_permissions: true,
      custom_permissions: fullCustom,
      overrides: sparseOverridesFromEffectiveMap(fullCustom, ROLE),
    });

    const sessionUser = {
      id: USER_ID,
      role: ROLE,
      has_system_access: true,
    };
    expect(can(sessionUser, 'agenda', 'view')).toBe(true);
    expect(can(sessionUser, 'financeiro_contas_pagar', 'view')).toBe(true);
  });

  it('syncCurrentUserPermissionsFromContext persiste custom_permissions no IndexedDB', () => {
    const catalogIds = getPermissionsCatalog().map((p) => p.id);
    const fullCustom = Object.fromEntries(catalogIds.map((id) => [id, true]));
    const dispatchSpy = vi.fn();
    vi.stubGlobal('window', { dispatchEvent: dispatchSpy });

    syncCurrentUserPermissionsFromContext({
      id: USER_ID,
      email: 'melissa@test.com',
      role: ROLE,
      has_custom_permissions: true,
      custom_permissions: fullCustom,
      permissionOverrides: sparseOverridesFromEffectiveMap(fullCustom, ROLE),
    }, {
      id: USER_ID,
      email: 'melissa@test.com',
      role: ROLE,
      tenantId: TENANT_ID,
      has_system_access: true,
    }, catalogIds);

    const access = getUserAccess(USER_ID);
    expect(access.has_custom_permissions).toBe(true);
    expect(Object.keys(access.custom_permissions || {}).length).toBe(catalogIds.length);
    expect(dispatchSpy.mock.calls.some((call) => call[0]?.type === 'saas:user-permissions-synced')).toBe(true);
    vi.unstubAllGlobals();
  });
});
