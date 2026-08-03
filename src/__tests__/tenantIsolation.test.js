import { describe, expect, it } from 'vitest';
import {
  assertSameTenant,
  filterRecordsByTenant,
  requireSessionTenantId,
  TenantIsolationError,
} from '../services/tenantIsolation.js';
import { resolveTenantIdForWrite } from '../services/tenantWriteGuard.js';

describe('tenantIsolation', () => {
  const userA = { id: 'user-a', tenantId: 'tenant-a', email: 'a@clinic.com' };
  const userB = { id: 'user-b', tenantId: 'tenant-b', email: 'b@clinic.com' };

  it('requireSessionTenantId bloqueia usuário sem tenant', () => {
    expect(() => requireSessionTenantId({ id: 'x' })).toThrow(TenantIsolationError);
  });

  it('assertSameTenant bloqueia cross-tenant', () => {
    expect(() => assertSameTenant(userA, 'tenant-b')).toThrow(TenantIsolationError);
    expect(assertSameTenant(userA, 'tenant-a')).toBe('tenant-a');
  });

  it('resolveTenantIdForWrite usa sessão e rejeita payload de outro tenant', () => {
    expect(resolveTenantIdForWrite(userA)).toBe('tenant-a');
    expect(resolveTenantIdForWrite(userA, 'tenant-a')).toBe('tenant-a');
    expect(() => resolveTenantIdForWrite(userA, 'tenant-b')).toThrow(TenantIsolationError);
  });

  it('filterRecordsByTenant remove registros de outras clínicas', () => {
    const rows = [
      { id: '1', tenant_id: 'tenant-a', name: 'Juliana' },
      { id: '2', tenant_id: 'tenant-b', name: 'Renata' },
      { id: '3', name: 'Sem tenant' },
    ];
    const filtered = filterRecordsByTenant(rows, 'tenant-a');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Juliana');
  });

  it('cenário multi-clínica: usuário A não acessa dados de B', () => {
    const clinicAUsers = filterRecordsByTenant(
      [
        { email: 'master-a@clinic.com', tenant_id: 'clinic-a' },
        { email: 'user-a@clinic.com', tenant_id: 'clinic-a' },
        { email: 'user-b@clinic.com', tenant_id: 'clinic-b' },
      ],
      'clinic-a',
    );
    expect(clinicAUsers.every((u) => u.tenant_id === 'clinic-a')).toBe(true);
    expect(clinicAUsers.some((u) => u.email === 'user-b@clinic.com')).toBe(false);
    expect(() => assertSameTenant({ tenantId: 'clinic-a' }, 'clinic-b')).toThrow(TenantIsolationError);
  });
});
