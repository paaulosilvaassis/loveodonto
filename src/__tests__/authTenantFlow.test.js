import { describe, expect, it, vi } from 'vitest';
import { raceWithTimeout } from '../utils/async.js';
import { getDefaultTenant } from '../services/tenantService.js';
import { requireSessionTenantId, TenantIsolationError } from '../services/tenantIsolation.js';
import { tenantAudit, clearTenantAuditLogs, getTenantAuditLogs } from '../services/tenantAuditLog.js';

vi.mock('../services/saasAuthService.js', () => ({
  isSaasModeEnabled: vi.fn(() => false),
  fetchSaasAccessBootstrap: vi.fn(),
  signInSaasWithPassword: vi.fn(),
}));

describe('auth tenant flow — helpers', () => {
  it('raceWithTimeout está definido e importável', async () => {
    const value = await raceWithTimeout(Promise.resolve('ok'), 200, 'timeout');
    expect(value).toBe('ok');
  });

  it('getDefaultTenant retorna null em modo SaaS', async () => {
    const { isSaasModeEnabled } = await import('../services/saasAuthService.js');
    isSaasModeEnabled.mockReturnValue(true);
    expect(getDefaultTenant()).toBeNull();
  });

  it('requireSessionTenantId rejeita usuário sem tenant_id', () => {
    expect(() => requireSessionTenantId({ id: 'u1', email: 'a@b.com' })).toThrow(TenantIsolationError);
  });

  it('tenantAudit registra TENANT_AUTH com campos obrigatórios', () => {
    clearTenantAuditLogs();
    tenantAudit('TENANT_AUTH', {
      user_id: 'uid-1',
      email: 'master@clinic.com',
      tenant_id: 'tenant-a',
      role: 'master',
      source: 'tenant_users',
      duration_ms: 12,
      status: 'ok',
    });
    const logs = getTenantAuditLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].tag).toBe('TENANT_AUTH');
    expect(logs[0].tenant_id).toBe('tenant-a');
    expect(logs[0].source).toBe('tenant_users');
  });
});

describe('auth tenant flow — cenários de login (contrato)', () => {
  const IMPLANPRIME = 'b2f95268-101c-42cb-8a8e-8d3681aa7dfa';

  const scenarios = [
    { label: 'MASTER', role: 'master', tenantId: IMPLANPRIME, active: true },
    { label: 'Administrador', role: 'admin', tenantId: IMPLANPRIME, active: true },
    { label: 'Gerente', role: 'gerente', tenantId: IMPLANPRIME, active: true },
    { label: 'sem vínculo ativo', role: null, tenantId: null, active: false },
    { label: 'outro tenant', role: 'atendimento', tenantId: '00000000-0000-4000-8000-000000000099', active: true },
  ];

  scenarios.forEach(({ label, role, tenantId, active }) => {
    it(`login ${label}: tenant_id ${active ? 'presente' : 'ausente'} conforme tenant_users`, () => {
      if (!active || !tenantId) {
        expect(() => requireSessionTenantId({ id: 'u', role })).toThrow(TenantIsolationError);
        return;
      }
      const user = { id: 'u', email: 'user@test.com', tenantId, role };
      expect(requireSessionTenantId(user)).toBe(tenantId);
    });
  });
});

describe('auth tenant flow — TenantContext module', () => {
  it('importa TenantProvider sem ReferenceError (raceWithTimeout)', async () => {
    await expect(import('../tenant/TenantContext.jsx')).resolves.toBeDefined();
  });
});
