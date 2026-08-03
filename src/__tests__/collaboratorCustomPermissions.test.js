import { beforeEach, describe, expect, it } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import {
  getPermissionsCatalog,
  getRoleDefaultPermissionIds,
  getUserAccess,
  updateUserAccess,
} from '../services/accessService.js';
import {
  countAllowedPermissions,
  effectiveMapFromSparseOverrides,
  resolvePermissionStateFromTenantUser,
  sparseOverridesFromEffectiveMap,
  syncPermissionStateToLocalDb,
  syncTeamRosterPermissionStates,
} from '../services/collaboratorPermissionPersistence.js';

const MASTER = { id: 'master-1', role: 'admin', isMaster: true };
const TARGET_USER = 'user-gerente-1';
const ROLE = 'gerente';

describe('Permissões customizadas de colaborador', () => {
  let catalogIds = [];

  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    catalogIds = getPermissionsCatalog().map((p) => p.id);
    withDb((db) => {
      db.users = db.users || [];
      if (!db.users.some((u) => u.id === TARGET_USER)) {
        db.users.push({
          id: TARGET_USER,
          name: 'Gerente Teste',
          email: 'gerente@teste.com',
          role: ROLE,
          active: true,
          has_system_access: true,
        });
      }
      return db;
    });
  });

  it('perfil Gerente começa com default (~28) sem custom salvo', () => {
    const defaults = getRoleDefaultPermissionIds(ROLE);
    const state = resolvePermissionStateFromTenantUser({ role: ROLE }, ROLE, catalogIds);
    expect(state.hasCustomPermissions).toBe(false);
    expect(countAllowedPermissions({
      sparseOverrides: state.sparseOverrides,
      role: ROLE,
      catalogIds,
    })).toBe(defaults.length);
  });

  it('master altera para 184/184, salva e recarrega do servidor sem reaplicar default', () => {
    const fullCustom = Object.fromEntries(catalogIds.map((id) => [id, true]));
    const sparse = sparseOverridesFromEffectiveMap(fullCustom, ROLE);

    updateUserAccess(MASTER, TARGET_USER, {
      role: ROLE,
      has_custom_permissions: true,
      custom_permissions: fullCustom,
      overrides: sparse,
    });

    const afterSave = getUserAccess(TARGET_USER);
    expect(afterSave.has_custom_permissions).toBe(true);
    expect(countAllowedPermissions({
      sparseOverrides: afterSave.overrides,
      role: ROLE,
      catalogIds,
    })).toBe(catalogIds.length);

    withDb((db) => {
      db.userPermissions = [];
      db.users = db.users.map((u) => (
        u.id === TARGET_USER
          ? { ...u, has_custom_permissions: false, custom_permissions: undefined, permissionOverrides: {} }
          : u
      ));
      return db;
    });

    const tenantUserFromApi = {
      user_id: TARGET_USER,
      role: ROLE,
      email: 'gerente@teste.com',
      has_custom_permissions: true,
      custom_permissions: fullCustom,
      permission_overrides: sparse,
    };

    const serverState = resolvePermissionStateFromTenantUser(tenantUserFromApi, ROLE, catalogIds);
    syncPermissionStateToLocalDb(TARGET_USER, {
      role: ROLE,
      hasCustomPermissions: serverState.hasCustomPermissions,
      sparseOverrides: serverState.sparseOverrides,
      customPermissions: serverState.customPermissions,
      email: 'gerente@teste.com',
      tenantId: 'tenant-1',
    });

    const reloaded = getUserAccess(TARGET_USER);
    expect(reloaded.has_custom_permissions).toBe(true);
    expect(countAllowedPermissions({
      sparseOverrides: reloaded.overrides,
      role: ROLE,
      catalogIds,
    })).toBe(catalogIds.length);
    expect(reloaded.role).toBe(ROLE);
  });

  it('compatibilidade legada: permission_overrides esparsos reconstrói mapa efetivo', () => {
    const defaults = new Set(getRoleDefaultPermissionIds(ROLE));
    const extraPerm = catalogIds.find((id) => !defaults.has(id));
    expect(extraPerm).toBeTruthy();

    const legacyTenantUser = {
      user_id: TARGET_USER,
      role: ROLE,
      permission_overrides: { [extraPerm]: true },
    };

    const state = resolvePermissionStateFromTenantUser(legacyTenantUser, ROLE, catalogIds);
    expect(state.hasCustomPermissions).toBe(true);
    expect(state.customPermissions[extraPerm]).toBe(true);
    const defaultPerm = catalogIds.find((id) => defaults.has(id));
    expect(state.customPermissions[defaultPerm]).toBe(true);

    const rebuilt = effectiveMapFromSparseOverrides(state.sparseOverrides, ROLE, catalogIds);
    expect(rebuilt[extraPerm]).toBe(true);
  });

  it('syncTeamRosterPermissionStates propaga custom_permissions para IndexedDB', () => {
    const fullCustom = Object.fromEntries(catalogIds.map((id) => [id, true]));
    const roster = [{
      user_id: TARGET_USER,
      email: 'gerente@teste.com',
      role: ROLE,
      has_custom_permissions: true,
      custom_permissions: fullCustom,
      permission_overrides: sparseOverridesFromEffectiveMap(fullCustom, ROLE),
    }];

    syncTeamRosterPermissionStates(roster, 'tenant-1', catalogIds);
    const access = getUserAccess(TARGET_USER);
    expect(access.has_custom_permissions).toBe(true);
    expect(countAllowedPermissions({
      sparseOverrides: access.overrides,
      role: ROLE,
      catalogIds,
    })).toBe(catalogIds.length);
  });

  it('aplicar perfil padrão limpa custom e volta ao default do Gerente', () => {
    const fullCustom = Object.fromEntries(catalogIds.map((id) => [id, true]));
    updateUserAccess(MASTER, TARGET_USER, {
      role: ROLE,
      has_custom_permissions: true,
      custom_permissions: fullCustom,
      overrides: sparseOverridesFromEffectiveMap(fullCustom, ROLE),
    });

    updateUserAccess(MASTER, TARGET_USER, {
      role: ROLE,
      has_custom_permissions: false,
      custom_permissions: null,
      overrides: {},
    });

    const access = getUserAccess(TARGET_USER);
    expect(access.has_custom_permissions).toBe(false);
    expect(countAllowedPermissions({
      sparseOverrides: access.overrides,
      role: ROLE,
      catalogIds,
    })).toBe(getRoleDefaultPermissionIds(ROLE).length);
  });
});
