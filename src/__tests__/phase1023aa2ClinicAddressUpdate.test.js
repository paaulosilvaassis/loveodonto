/**
 * PATCH B.2AA.2 — updateClinicAddress (AA2-01–AA2-15).
 * Fixtures only. Sem write de produção.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as idb from '../db/idbStorage.js';
import { defaultDbState } from '../db/schema.js';
import {
  createEmptyDbRuntime,
  useDbRuntime,
  resetDb,
  initDb,
  withDb,
  saveDb,
  loadDb,
  flushDbPersistence,
  getDbPersistenceStatus,
  DB_NO_CHANGE,
} from '../db/index.js';
import {
  addClinicAddress,
  updateClinicAddress,
} from '../services/clinicService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import {
  resolveContractVariables,
} from '../contracts/contractVariableResolver.js';
import { validateContractGeneration } from '../services/contractValidationService.js';

const ADDRESS_ID = 'addr-974b5bd4-0949-424e-a261-0ba122295860';
const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const CLINIC_ID = 'clinic-b721c2c9';

const admin = {
  id: 'user-aa2-admin',
  role: 'admin',
  tenantId: TENANT,
  tenant_id: TENANT,
};

function fixtureAddress(overrides = {}) {
  return {
    id: ADDRESS_ID,
    clinicId: 'clinic-1',
    tipo: 'principal',
    cep: '35685-000',
    logradouro: 'Praça Antônio Quirino da Silva',
    numero: '107',
    complemento: 'LOJA 02A',
    bairro: 'CENTRO',
    cidade: 'Itatiaiuçu',
    uf: '',
    principal: false,
    ...overrides,
  };
}

function seedClinicContext(addressOverrides = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime', status: 'active' }];
    db.clinicProfile = {
      id: CLINIC_ID,
      tenant_id: TENANT,
      razaoSocial: 'Implanprime Odontologia',
      nomeFantasia: 'Implanprime Odontologia',
      nomeClinica: 'Implanprime Odontologia',
    };
    db.clinicDocumentation = {
      clinicId: CLINIC_ID,
      cnpj: '52691886000160',
      responsavelTecnico: 'Dra. Juliana',
      croResponsavelTecnico: 'CRO-MG 27267',
    };
    db.clinicAddresses = [fixtureAddress(addressOverrides)];
    db.clinicPhones = [{ principal: true, ddd: '31', numero: '971196315' }];
    db.patients = [{
      id: 'p-aa2',
      tenant_id: TENANT,
      full_name: 'João Silva',
      cpf: '52998224725',
      birth_date: '1990-05-10',
      email: 'joao@email.com',
    }];
    db.patientAddresses = [{
      patient_id: 'p-aa2',
      principal: true,
      logradouro: 'Rua B',
      numero: '50',
      bairro: 'Centro',
      cidade: 'Itatiaiuçu',
      uf: 'MG',
    }];
    db.appointments = [{ id: 'apt-aa2', patientId: 'p-aa2', tenant_id: TENANT }];
    db.clinicalAppointments = [{
      appointmentId: 'apt-aa2',
      patientId: 'p-aa2',
      budget: {
        id: 'budget-aa2',
        budgetNumber: 'ORC-002',
        status: BUDGET_STATUS.APROVADO,
        totalValue: 25000,
        planName: 'Implantes',
        procedures: [{
          id: 'proc-aa2',
          name: 'Implante',
          quantity: 1,
          unitValue: 25000,
          totalValue: 25000,
          tooth: '36',
        }],
        paymentOptions: [{
          id: 'pay-aa2',
          type: 'a_vista',
          accepted: true,
          total: 25000,
          method: 'pix',
        }],
        createdAt: '2026-06-01T10:00:00.000Z',
      },
    }];
    return db;
  });
}

function publicAddressFields(row) {
  const {
    uf: _uf,
    updatedAt: _updatedAt,
    updatedBy: _updatedBy,
    ...rest
  } = row;
  return rest;
}

async function persistedRevision() {
  const snap = await idb.getFullDbSnapshot(defaultDbState());
  return snap.revision;
}

describe('PHASE_10.23AA2 — canonical clinic address update', () => {
  beforeEach(async () => {
    localStorage.clear();
    useDbRuntime(createEmptyDbRuntime());
    resetDb();
    await idb.clearIdb();
    await initDb();
  });

  afterEach(async () => {
    await flushDbPersistence().catch(() => {});
    resetDb();
    await idb.clearIdb();
    vi.restoreAllMocks();
  });

  it('AA2-01 existing address uf "" → MG changes same row id', () => {
    seedClinicContext();
    const updated = updateClinicAddress(admin, ADDRESS_ID, { uf: 'MG' });
    expect(updated).not.toBe(DB_NO_CHANGE);
    expect(updated.id).toBe(ADDRESS_ID);
    expect(updated.uf).toBe('MG');
    const rows = loadDb().clinicAddresses;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(ADDRESS_ID);
    expect(rows[0].uf).toBe('MG');
  });

  it('AA2-02 address count remains unchanged', () => {
    seedClinicContext();
    const before = loadDb().clinicAddresses.length;
    updateClinicAddress(admin, ADDRESS_ID, { uf: 'MG' });
    expect(loadDb().clinicAddresses).toHaveLength(before);
  });

  it('AA2-03 all unrelated address fields remain byte/semantic equivalent', () => {
    seedClinicContext();
    const before = publicAddressFields(loadDb().clinicAddresses[0]);
    updateClinicAddress(admin, ADDRESS_ID, { uf: 'MG' });
    const after = publicAddressFields(loadDb().clinicAddresses[0]);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it('AA2-04 missing address id fails closed', () => {
    seedClinicContext();
    expect(() => updateClinicAddress(admin, 'addr-missing', { uf: 'MG' }))
      .toThrow('Endereço não encontrado.');
    expect(() => updateClinicAddress(admin, '', { uf: 'MG' }))
      .toThrow('Endereço não encontrado.');
    expect(loadDb().clinicAddresses[0].uf).toBe('');
  });

  it('AA2-05 cross-tenant/clinic address update fails closed', () => {
    seedClinicContext({ clinicId: 'clinic-foreign-999' });
    expect(() => updateClinicAddress(admin, ADDRESS_ID, { uf: 'MG' }))
      .toThrow('Endereço não pertence a esta clínica.');
    expect(loadDb().clinicAddresses[0].uf).toBe('');
    expect(loadDb().clinicAddresses[0].id).toBe(ADDRESS_ID);

    seedClinicContext({ clinicId: 'clinic-1', tenant_id: 'tenant-other' });
    expect(() => updateClinicAddress(admin, ADDRESS_ID, { uf: 'MG' }))
      .toThrow('Endereço não pertence a esta clínica.');
    expect(loadDb().clinicAddresses[0].uf).toBe('');
  });

  it('AA2-06 invalid UF rejected', () => {
    seedClinicContext();
    expect(() => updateClinicAddress(admin, ADDRESS_ID, { uf: '' }))
      .toThrow('UF inválida.');
    expect(() => updateClinicAddress(admin, ADDRESS_ID, { uf: 'M' }))
      .toThrow('UF inválida.');
    expect(() => updateClinicAddress(admin, ADDRESS_ID, { uf: 'MGG' }))
      .toThrow('UF inválida.');
    expect(() => updateClinicAddress(admin, ADDRESS_ID, { uf: '12' }))
      .toThrow('UF inválida.');
    expect(() => updateClinicAddress(admin, ADDRESS_ID, { uf: 'SP' }))
      .not.toThrow();
    expect(loadDb().clinicAddresses[0].uf).toBe('SP');
  });

  it('AA2-07 uf normalization " mg " → "MG"', () => {
    seedClinicContext();
    const updated = updateClinicAddress(admin, ADDRESS_ID, { uf: ' mg ' });
    expect(updated.uf).toBe('MG');
    expect(loadDb().clinicAddresses[0].uf).toBe('MG');
  });

  it('AA2-08 identical uf "MG" → "MG" is DB_NO_CHANGE', () => {
    seedClinicContext({ uf: 'MG' });
    const result = updateClinicAddress(admin, ADDRESS_ID, { uf: 'MG' });
    expect(result).toBe(DB_NO_CHANGE);
    const row = loadDb().clinicAddresses[0];
    expect(row.uf).toBe('MG');
    expect(row.updatedAt).toBeUndefined();
    expect(row.updatedBy).toBeUndefined();
  });

  it('AA2-09 no-op does not increment saveEpoch/revision', async () => {
    useDbRuntime(createEmptyDbRuntime());
    resetDb();
    await idb.clearIdb();
    saveDb(defaultDbState());
    await flushDbPersistence();
    seedClinicContext({ uf: 'MG' });
    await flushDbPersistence();
    const epoch = getDbPersistenceStatus().saveEpoch;
    const rev = await persistedRevision();
    const saveSpy = vi.spyOn(idb, 'saveFullDb');
    const result = updateClinicAddress(admin, ADDRESS_ID, { uf: 'MG' });
    expect(result).toBe(DB_NO_CHANGE);
    await flushDbPersistence();
    expect(getDbPersistenceStatus().saveEpoch).toBe(epoch);
    expect(await persistedRevision()).toBe(rev);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('AA2-10 real update increments persistence exactly once', async () => {
    useDbRuntime(createEmptyDbRuntime());
    resetDb();
    await idb.clearIdb();
    saveDb(defaultDbState());
    await flushDbPersistence();
    seedClinicContext();
    await flushDbPersistence();
    const epoch = getDbPersistenceStatus().saveEpoch;
    const rev = await persistedRevision();
    updateClinicAddress(admin, ADDRESS_ID, { uf: 'MG' });
    expect(getDbPersistenceStatus().saveEpoch).toBe(epoch + 1);
    await flushDbPersistence();
    expect(await persistedRevision()).toBe(rev + 1);
    expect(loadDb().clinicAddresses[0].updatedBy).toBe(admin.id);
    expect(loadDb().clinicAddresses[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('AA2-11 existing addClinicAddress behavior unchanged', () => {
    seedClinicContext();
    const beforeIds = loadDb().clinicAddresses.map((row) => row.id);
    const rows = addClinicAddress(admin, {
      tipo: 'comercial',
      cep: '30130-000',
      logradouro: 'Rua Nova',
      numero: '1',
      cidade: 'Belo Horizonte',
      uf: 'mg',
      principal: false,
    });
    expect(rows).toHaveLength(2);
    const added = rows.find((row) => !beforeIds.includes(row.id));
    expect(added.clinicId).toBe('clinic-1');
    expect(added.uf).toBe('mg');
    expect(loadDb().clinicAddresses[0].id).toBe(ADDRESS_ID);
    expect(loadDb().clinicAddresses[0].uf).toBe('');
  });

  it('AA2-12 contract resolver reads updated address uf correctly', () => {
    seedClinicContext();
    updateClinicAddress(admin, ADDRESS_ID, { uf: 'MG' });
    const { map } = resolveContractVariables({
      quoteSource: 'clinical_budget',
      quoteId: 'apt-aa2',
      patientId: 'p-aa2',
      currentUser: admin,
    });
    expect(map['#clinicaEstado']).toBe('MG');
  });

  it('AA2-13 #clinicaEstado resolves MG after update in test fixture', () => {
    seedClinicContext();
    expect(resolveContractVariables({
      quoteSource: 'clinical_budget',
      quoteId: 'apt-aa2',
      patientId: 'p-aa2',
      currentUser: admin,
    }).map['#clinicaEstado']).toBe('');
    updateClinicAddress(admin, ADDRESS_ID, { uf: 'MG' });
    expect(resolveContractVariables({
      quoteSource: 'clinical_budget',
      quoteId: 'apt-aa2',
      patientId: 'p-aa2',
      currentUser: admin,
    }).map['#clinicaEstado']).toBe('MG');
  });

  it('AA2-14 #clinicaCidadeEstado resolves Itatiaiuçu/MG after update', () => {
    seedClinicContext();
    updateClinicAddress(admin, ADDRESS_ID, { uf: 'MG' });
    const { map } = resolveContractVariables({
      quoteSource: 'clinical_budget',
      quoteId: 'apt-aa2',
      patientId: 'p-aa2',
      currentUser: admin,
    });
    expect(map['#clinicaCidade']).toBe('Itatiaiuçu');
    expect(map['#clinicaCidadeEstado']).toBe('Itatiaiuçu/MG');
  });

  it('AA2-15 finalize validation no longer reports UF/foro blockers', () => {
    seedClinicContext();
    const before = validateContractGeneration({
      quoteSource: 'clinical_budget',
      quoteId: 'apt-aa2',
      patientId: 'p-aa2',
      currentUser: admin,
      contractNumber: 'CTR-AA2-001',
      strict: true,
    });
    expect(before.missing.some((item) => item.label === 'UF da clínica')).toBe(true);
    expect(before.missing.some((item) => item.label === 'Cidade/UF do foro')).toBe(true);

    updateClinicAddress(admin, ADDRESS_ID, { uf: 'MG' });

    const after = validateContractGeneration({
      quoteSource: 'clinical_budget',
      quoteId: 'apt-aa2',
      patientId: 'p-aa2',
      currentUser: admin,
      contractNumber: 'CTR-AA2-001',
      strict: true,
    });
    expect(after.missing.some((item) => item.label === 'UF da clínica')).toBe(false);
    expect(after.missing.some((item) => item.label === 'Cidade/UF do foro')).toBe(false);
    expect(after.map['#clinicaEstado']).toBe('MG');
    expect(after.map['#clinicaCidadeEstado']).toBe('Itatiaiuçu/MG');
  });

  it('ignores identity/tenant fields in patch', () => {
    seedClinicContext();
    updateClinicAddress(admin, ADDRESS_ID, {
      uf: 'MG',
      id: 'addr-hijack',
      clinicId: 'clinic-hijack',
      tenant_id: 'tenant-hijack',
      createdAt: '1999-01-01T00:00:00.000Z',
      createdBy: 'attacker',
    });
    const row = loadDb().clinicAddresses[0];
    expect(row.id).toBe(ADDRESS_ID);
    expect(row.clinicId).toBe('clinic-1');
    expect(row.tenant_id).toBeUndefined();
    expect(row.createdAt).toBeUndefined();
    expect(row.createdBy).toBeUndefined();
    expect(row.uf).toBe('MG');
  });
});
