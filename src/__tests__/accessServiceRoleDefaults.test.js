import { describe, expect, it } from 'vitest';
import { canByPermission, getRoleDefaultPermissionIds } from '../services/accessService.js';

describe('accessService role defaults fallback', () => {
  it('usa ROLE_DEFAULT_PERMISSIONS quando rolePermissions do DB está vazio', () => {
    const perms = getRoleDefaultPermissionIds('recepcao');
    expect(perms.length).toBeGreaterThan(0);
    expect(perms.some((id) => id.includes('dashboard'))).toBe(true);
  });

  it('permite dashboard:view para recepção via fallback', () => {
    const user = { id: 'u-test', role: 'recepcao', has_system_access: true };
    expect(canByPermission(user, 'dashboard:view')).toBe(true);
  });

  it('nega financeiro para recepção por padrão', () => {
    const user = { id: 'u-test', role: 'recepcao', has_system_access: true };
    expect(canByPermission(user, 'financeiro_relatorios:view')).toBe(false);
  });
});
