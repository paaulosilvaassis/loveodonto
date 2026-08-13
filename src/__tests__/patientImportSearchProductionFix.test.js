import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { suggestPatients, searchPatients, createPatientQuick } from '../services/patientService.js';
import { importFromCsvOrXlsx, IMPORT_ROW_STATUS } from '../services/importPatientService.js';
import {
  resolvePatientFullName,
  isPatientMetadataName,
  foldPatientSearchText,
} from '../utils/patientIdentity.js';
import { getPatientSuggestLabel, getPatientSuggestId } from '../utils/patientSuggestHelpers.js';

const SCOPE = 'Escopo: Todos os pacientes (sem filtro)';
const TENANT_A = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const TENANT_B = 'f2615848-d67d-4a87-96f1-508049953b84';
const adminA = { id: 'user-a', role: 'admin', tenant_id: TENANT_A };
const adminB = { id: 'user-b', role: 'admin', tenant_id: TENANT_B };

function validCpfFromSeed(seed) {
  const base = String(seed).padStart(9, '0').slice(-9);
  if (/^(\d)\1+$/.test(base)) return validCpfFromSeed(seed + 1);
  const calc = (b, factor) => {
    let total = 0;
    for (let i = 0; i < b.length; i++) total += Number(b[i]) * (factor - i);
    const mod = total % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const d1 = calc(base, 10);
  const d2 = calc(base + String(d1), 11);
  return base + String(d1) + String(d2);
}

function mockFile(csvContent, filename = 'test.csv') {
  return { name: filename, text: () => Promise.resolve(csvContent) };
}

describe('PHASE_PATIENT_IMPORT_SEARCH_PRODUCTION_FIX', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [
        { id: TENANT_A, name: 'Implanprime', status: 'active' },
        { id: TENANT_B, name: 'Outro', status: 'active' },
      ];
      db.patients = [];
      db.patientPhones = [];
      db.patientDocuments = [];
      db.patientBirth = [];
      db.patientEducation = [];
      db.patientRelationships = [];
      db.patientActivitySummary = [];
      return db;
    });
  });

  it('detecta texto de escopo e não o usa como nome civil', () => {
    expect(isPatientMetadataName(SCOPE)).toBe(true);
    expect(resolvePatientFullName({ full_name: SCOPE, nickname: 'Maria' })).toBe('Maria');
    expect(resolvePatientFullName({ name: SCOPE, full_name: 'Ana Souza' })).toBe('Ana Souza');
    expect(getPatientSuggestLabel({ name: SCOPE, cpf: '52998224725' })).toBe('Paciente');
    expect(getPatientSuggestLabel({ name: SCOPE })).not.toContain('Escopo');
  });

  it('planilha real: header de escopo + coluna de nome => persiste nome civil, nunca o escopo', async () => {
    const cpf = validCpfFromSeed(510000101);
    const realName = 'Helena Cristina Oliveira Teste';
    const csv = [
      `"${SCOPE}",Nome Completo,cpf,data_nascimento,sexo`,
      `"${SCOPE}",${realName},${cpf},1985-03-12,F`,
    ].join('\n');
    const result = await importFromCsvOrXlsx(mockFile(csv), adminA, 'create', {
      getCancelRequested: () => false,
    });
    expect(result.created).toBe(1);
    expect(result.duplicateSkipped).toBe(0);
    const persisted = loadDb().patients.find((p) => p.cpf === cpf);
    expect(persisted).toBeTruthy();
    expect(persisted.full_name).toBe(realName);
    expect(persisted.full_name).not.toBe(SCOPE);
    expect(persisted.full_name).not.toContain('Escopo');
    expect(persisted.tenant_id).toBe(TENANT_A);
    const { results } = suggestPatients('name', 'Helena', 10, TENANT_A);
    expect(results[0].id).toBe(persisted.id);
    expect(results[0].name).toBe(realName);
    expect(results[0].full_name).toBe(realName);
  });

  it('1/2/7/8/10 paciente importado aparece na busca com nome civil e patientId', async () => {
    const cpf = validCpfFromSeed(510000001);
    const csv = [
      `${SCOPE},Nome Completo,cpf,data_nascimento,sexo`,
      `${SCOPE},Maria Fernanda Alves Teste,${cpf},1990-01-01,F`,
    ].join('\n');
    const result = await importFromCsvOrXlsx(mockFile(csv), adminA, 'create', {
      getCancelRequested: () => false,
    });
    expect(result.created).toBe(1);
    const { results } = suggestPatients('name', 'Maria', 10, TENANT_A);
    expect(results).toHaveLength(1);
    expect(getPatientSuggestId(results[0])).toMatch(/^patient-/);
    expect(results[0].name).toBe('Maria Fernanda Alves Teste');
    expect(results[0].full_name).toBe('Maria Fernanda Alves Teste');
    expect(results[0].name).not.toContain('Escopo');
    expect(results[0].cpfMasked).toMatch(/\*\*\*/);
  });

  it('2 busca por início do nome', async () => {
    createPatientQuick(adminA, {
      full_name: 'Carlos Eduardo Lima',
      sex: 'M',
      birth_date: '1990-01-01',
      cpf: validCpfFromSeed(510000002),
    });
    const { results } = suggestPatients('name', 'Car', 10, TENANT_A);
    expect(results[0].id).toBeTruthy();
    expect(results[0].name).toBe('Carlos Eduardo Lima');
  });

  it('3 busca por nome intermediário', () => {
    createPatientQuick(adminA, {
      full_name: 'Ana Beatriz Costa',
      sex: 'F',
      birth_date: '1990-01-01',
      cpf: validCpfFromSeed(510000003),
    });
    const { results } = suggestPatients('name', 'Beatriz', 10, TENANT_A);
    expect(results.some((r) => r.name === 'Ana Beatriz Costa')).toBe(true);
  });

  it('4/5 busca case-insensitive e com acentos', () => {
    createPatientQuick(adminA, {
      full_name: 'José Antônio Çâmara',
      sex: 'M',
      birth_date: '1990-01-01',
      cpf: validCpfFromSeed(510000004),
    });
    expect(foldPatientSearchText('JOSÉ')).toBe(foldPatientSearchText('jose'));
    const byCase = suggestPatients('name', 'JOSÉ', 10, TENANT_A);
    const byFold = suggestPatients('name', 'jose', 10, TENANT_A);
    expect(byCase.results).toHaveLength(1);
    expect(byFold.results).toHaveLength(1);
    expect(byFold.results[0].name).toBe('José Antônio Çâmara');
  });

  it('6 busca por CPF normalizado', () => {
    const cpf = validCpfFromSeed(510000005);
    const created = createPatientQuick(adminA, {
      full_name: 'Paciente Cpf',
      sex: 'F',
      birth_date: '1990-01-01',
      cpf,
    });
    const { results } = suggestPatients('cpf', cpf, 10, TENANT_A);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(created.patientId || created.profile?.id);
  });

  it('9 não apresenta nickname no lugar do nome civil', () => {
    const created = createPatientQuick(adminA, {
      full_name: 'Paulo Henrique Silva de Assis',
      nickname: 'PH',
      sex: 'M',
      birth_date: '1990-01-01',
      cpf: validCpfFromSeed(510000006),
    });
    const { results } = suggestPatients('name', 'PH', 10, TENANT_A);
    expect(results[0].id).toBe(created.patientId || created.profile?.id);
    expect(getPatientSuggestLabel(results[0])).toBe('Paulo Henrique Silva de Assis');
    expect(getPatientSuggestLabel(results[0])).not.toBe('PH');
  });

  it('10 não apresenta texto de escopo como nome mesmo se persistido', () => {
    withDb((db) => {
      db.patients.push({
        id: 'patient-scope-1',
        full_name: SCOPE,
        nickname: '',
        social_name: '',
        cpf: '52998224725',
        tenant_id: TENANT_A,
        status: 'active',
      });
      return db;
    });
    const { results } = suggestPatients('name', 'Maria', 10, TENANT_A);
    expect(results.every((r) => !String(r.name).includes('Escopo'))).toBe(true);
    const byPa = suggestPatients('name', 'pa', 10, TENANT_A);
    expect(byPa.results.every((r) => r.name !== SCOPE)).toBe(true);
  });

  it('11 tenant A não vê paciente tenant B', () => {
    createPatientQuick(adminA, {
      full_name: 'Paciente Tenant A',
      sex: 'F',
      birth_date: '1990-01-01',
      cpf: validCpfFromSeed(510000007),
    });
    createPatientQuick(adminB, {
      full_name: 'Paciente Tenant B',
      sex: 'M',
      birth_date: '1990-01-01',
      cpf: validCpfFromSeed(510000008),
    });
    const scopedA = suggestPatients('name', 'Paciente Tenant', 10, TENANT_A);
    const scopedB = suggestPatients('name', 'Paciente Tenant', 10, TENANT_B);
    expect(scopedA.results.every((r) => r.name === 'Paciente Tenant A')).toBe(true);
    expect(scopedB.results.every((r) => r.name === 'Paciente Tenant B')).toBe(true);
    expect(scopedA.results.some((r) => r.name.includes('Tenant B'))).toBe(false);
  });

  it('12/13 reload mantém pacientes pesquisáveis e paciente antigo continua pesquisável', () => {
    const created = createPatientQuick(adminA, {
      full_name: 'Paciente Antigo Reload',
      sex: 'F',
      birth_date: '1980-01-01',
      cpf: validCpfFromSeed(510000009),
    });
    const afterReload = loadDb();
    expect(afterReload.patients.some((p) => p.id === (created.patientId || created.profile?.id))).toBe(true);
    const { results } = suggestPatients('name', 'Antigo', 10, TENANT_A);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Paciente Antigo Reload');
  });

  it('14 importação não cria duplicata silenciosa no mesmo CPF', async () => {
    const cpf = validCpfFromSeed(510000010);
    const csv = [
      'nome_completo,cpf,data_nascimento,sexo',
      `Ana Duplicata,${cpf},1990-01-01,F`,
      `Ana Duplicata,${cpf},1990-01-01,F`,
    ].join('\n');
    const result = await importFromCsvOrXlsx(mockFile(csv), adminA, 'create', {
      getCancelRequested: () => false,
    });
    expect(result.created).toBe(1);
    expect(result.duplicateSkipped).toBe(1);
    const sameCpf = loadDb().patients.filter((p) => p.cpf === cpf && p.tenant_id === TENANT_A);
    expect(sameCpf).toHaveLength(1);
    expect(result.reportRows.filter((r) => r.status === IMPORT_ROW_STATUS.DUPLICATE_SKIPPED)).toHaveLength(1);
  });

  it('15 agendamento recebe o patientId real selecionado', () => {
    const created = createPatientQuick(adminA, {
      full_name: 'Paciente Agenda Select',
      sex: 'M',
      birth_date: '1990-01-01',
      cpf: validCpfFromSeed(510000011),
    });
    const expectedId = created.patientId || created.profile?.id;
    const { results } = suggestPatients('name', 'Agenda Select', 10, TENANT_A);
    const selectedId = getPatientSuggestId(results[0]);
    expect(selectedId).toBe(expectedId);
    const appointmentPayload = { patient: { ...results[0], id: selectedId } };
    expect(appointmentPayload.patient.id).toBe(expectedId);
  });

  it('searchPatients também ignora escopo e encontra por meio do nome', () => {
    createPatientQuick(adminA, {
      full_name: 'Helena Mid Name',
      sex: 'F',
      birth_date: '1990-01-01',
      cpf: validCpfFromSeed(510000012),
    });
    const { results } = searchPatients('name', 'mid', TENANT_A);
    expect(results.some((p) => p.full_name === 'Helena Mid Name')).toBe(true);
  });
});
