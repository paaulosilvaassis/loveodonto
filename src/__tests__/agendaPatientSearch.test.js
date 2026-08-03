import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import { suggestPatients } from '../services/patientService.js';

describe('Agenda - busca de paciente', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [
        { id: 'tenant-1', name: 'Clínica A', status: 'active' },
        { id: 'tenant-2', name: 'Clínica B', status: 'active' },
      ];
      db.patients = [
        { id: 'p1', full_name: 'Ana Silva', cpf: '52998224725', tenant_id: 'tenant-1' },
        { id: 'p2', full_name: 'Bruno Costa', cpf: '11144477735', tenant_id: 'tenant-2' },
      ];
      db.patientPhones = [
        { id: 'ph1', patient_id: 'p1', ddd: '11', number: '987654321', is_primary: true },
      ];
      return db;
    });
  });

  it('suggestPatients filtra por tenant_id', () => {
    const scoped = suggestPatients('name', 'ana', 10, 'tenant-1');
    expect(scoped.results).toHaveLength(1);
    expect(scoped.results[0].id).toBe('p1');
    expect(scoped.results[0].name).toBe('Ana Silva');
  });

  it('suggestPatients busca por telefone sem quebrar', () => {
    const byPhone = suggestPatients('phone', '9876', 10, 'tenant-1');
    expect(byPhone.results.some((r) => r.id === 'p1')).toBe(true);
  });

  it('suggestPatients retorna lista vazia para nome inexistente', () => {
    const empty = suggestPatients('name', 'zzznome', 10, 'tenant-1');
    expect(empty.results).toEqual([]);
  });

  it('suggestPatients isola pacientes pelo tenant_id da clínica SaaS', () => {
    const saasTenantId = 'a1111111-1111-4111-8111-111111111111';
    withDb((db) => {
      db.tenants = [{ id: saasTenantId, name: 'Implanprime', status: 'active' }];
      db.patients = [
        { id: 'p-saas', full_name: 'Carlos SaaS', cpf: '39053344705', tenant_id: saasTenantId },
      ];
      return db;
    });
    const scoped = suggestPatients('name', 'carlos', 10, saasTenantId);
    expect(scoped.results).toHaveLength(1);
    expect(scoped.results[0].id).toBe('p-saas');
  });
});
