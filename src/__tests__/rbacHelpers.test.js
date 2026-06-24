import { describe, expect, it } from 'vitest';
import {
  isPrivilegedUser,
  isRoutePermissionAllowed,
  canManageTenantUsers,
} from '../utils/rbacHelpers.js';

describe('rbacHelpers', () => {
  it('identifica usuários privilegiados', () => {
    expect(isPrivilegedUser({ role: 'admin', isMaster: false })).toBe(true);
    expect(isPrivilegedUser({ role: 'owner', isMaster: false })).toBe(true);
    expect(isPrivilegedUser({ role: 'master', isMaster: false })).toBe(true);
    expect(isPrivilegedUser({ saasAppRole: 'master', role: 'recepcao', isMaster: false })).toBe(true);
    expect(isPrivilegedUser({ role: 'recepcao', isMaster: false })).toBe(false);
    expect(isPrivilegedUser({ role: 'recepcao', isMaster: true })).toBe(true);
  });

  it('canManageTenantUsers usa role do backend tenant-context', () => {
    expect(canManageTenantUsers(
      { id: 'u1', role: 'recepcao', isMaster: false },
      'tenant-1',
      { role: 'master' },
    )).toBe(true);
    expect(canManageTenantUsers(
      { id: 'u1', role: 'recepcao', isMaster: false },
      'tenant-1',
      { role: 'atendimento' },
    )).toBe(false);
  });

  it('permite rota sem mapeamento de permissão', () => {
    const canFn = () => false;
    expect(isRoutePermissionAllowed({ role: 'recepcao' }, null, canFn)).toBe(true);
  });

  it('exige permissão para perfis comuns', () => {
    const canFn = (_user, perm) => perm === 'dashboard:view';
    expect(isRoutePermissionAllowed({ role: 'recepcao' }, 'dashboard:view', canFn)).toBe(true);
    expect(isRoutePermissionAllowed({ role: 'recepcao' }, 'financeiro_relatorios:view', canFn)).toBe(false);
  });
});
