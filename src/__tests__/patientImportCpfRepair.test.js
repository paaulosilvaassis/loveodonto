import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { importFromCsvOrXlsx } from '../services/importPatientService.js';
import { dryRunPatientCpfRepair } from '../services/patientImportCpfRepairService.js';

const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const admin = { id: 'user-a', role: 'admin', tenant_id: TENANT };

function mockFile(csv, filename = 'test.csv') {
  return { name: filename, text: () => Promise.resolve(csv) };
}

describe('patientImportCpfRepair — fail-closed', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [{ id: TENANT, name: 'Implanprime', status: 'active' }];
      db.patients = [];
      return db;
    });
  });

  it('dry-run nunca propõe CREATE', () => {
    const result = dryRunPatientCpfRepair({
      tenantId: TENANT,
      patients: [{ id: 'patient-1', full_name: 'Escopo: Todos os pacientes (sem filtro)', cpf: '52998224725', tenant_id: TENANT }],
      sheetRows: [
        { cpf: '52998224725', full_name: 'Maria Silva Teste' },
        { cpf: '39053344705', full_name: 'Paciente Sem Match' },
      ],
    });
    expect(result.summary.WOULD_CREATE).toBe(0);
    expect(result.summary.WOULD_UPDATE).toBe(1);
    expect(result.summary.MATCH_EXACT_BY_CPF).toBe(1);
    expect(result.updates[0].id).toBe('patient-1');
    expect(result.updates[0].nextName).toBe('Maria Silva Teste');
    expect(result.skips.some((s) => s.reason === 'NOT_FOUND')).toBe(true);
  });

  it('CPF duplicado no IndexedDB vira CONFLICT e não atualiza', () => {
    const result = dryRunPatientCpfRepair({
      tenantId: TENANT,
      patients: [
        { id: 'a', full_name: 'A', cpf: '52998224725', tenant_id: TENANT },
        { id: 'b', full_name: 'B', cpf: '52998224725', tenant_id: TENANT },
      ],
      sheetRows: [{ cpf: '52998224725', full_name: 'Nome Civil' }],
    });
    expect(result.summary.WOULD_UPDATE).toBe(0);
    expect(result.summary.WOULD_CREATE).toBe(0);
    expect(result.summary.CPF_CONFLICTS).toBe(1);
  });

  it('isolamento: paciente de outro tenant não entra no match', () => {
    const result = dryRunPatientCpfRepair({
      tenantId: TENANT,
      patients: [{ id: 'x', full_name: 'Outro', cpf: '52998224725', tenant_id: 'other-tenant' }],
      sheetRows: [{ cpf: '52998224725', full_name: 'Nome Civil' }],
    });
    expect(result.summary.MATCH_EXACT_BY_CPF).toBe(0);
    expect(result.summary.WOULD_CREATE).toBe(0);
    expect(result.skips[0].reason).toBe('NOT_FOUND');
  });

  it('importFromCsvOrXlsx update_cpf CRIA quando CPF não existe — por isso o reparo não o usa', async () => {
    const csv = 'nome_completo,cpf,data_nascimento,sexo\nNovo Paciente,39053344705,1990-01-01,M\n';
    const result = await importFromCsvOrXlsx(mockFile(csv), admin, 'update_cpf', {
      getCancelRequested: () => false,
    });
    expect(result.created).toBe(1);
    expect(loadDb().patients).toHaveLength(1);
  });
});
