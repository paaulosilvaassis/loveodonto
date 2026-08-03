import { describe, expect, it } from 'vitest';
import {
  canShowCollaboratorPermissionsPanel,
  normalizeTenantAccessRole,
  resolveAccessTargetUserId,
} from '../utils/collaboratorAccessPanel.js';

describe('collaboratorAccessPanel', () => {
  it('resolve target user id a partir do tenant_users', () => {
    expect(resolveAccessTargetUserId({ localUserId: null, tenantUser: { user_id: 'auth-1' } })).toBe('auth-1');
    expect(resolveAccessTargetUserId({ localUserId: 'local-1', tenantUser: { user_id: 'auth-1' } })).toBe('auth-1');
    expect(resolveAccessTargetUserId({ localUserId: 'stale-local', tenantUser: { id: 'tu-1' } })).toBe(null);
    expect(resolveAccessTargetUserId({ localUserId: 'stale-local', tenantUser: { id: 'tu-1', user_id: 'gone', auth_user_valid: false } })).toBe(null);
    expect(resolveAccessTargetUserId({ localUserId: 'local-1', tenantUser: null })).toBe('local-1');
    expect(resolveAccessTargetUserId({ localUserId: 'stale-local', tenantUser: null, saasMode: true })).toBe(null);
  });

  it('exibe painel quando há tenant user ou auth id', () => {
    expect(canShowCollaboratorPermissionsPanel({ targetUserId: 'auth-1' })).toBe(true);
    expect(canShowCollaboratorPermissionsPanel({ tenantUser: { id: 'tu-1', email: 'a@b.com' }, collaboratorEmail: 'a@b.com' })).toBe(true);
    expect(canShowCollaboratorPermissionsPanel({})).toBe(false);
  });

  it('normaliza roles do tenant', () => {
    expect(normalizeTenantAccessRole('owner')).toBe('admin');
    expect(normalizeTenantAccessRole('profissional')).toBe('profissional');
  });
});
