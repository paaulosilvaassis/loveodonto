/**
 * PHASE_PATIENT_IMPORT_RECOVERY_05A — CPF placeholder + identidade fiscal.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, loadDb, withDb } from '../db/index.js';
import {
  createPatientFromImport,
  createPatientsFromImportBatch,
  generatePlaceholderCpf,
  searchPatients,
  suggestPatients,
} from '../services/patientService.js';
import { importFromCsvOrXlsx, IMPORT_ROW_STATUS } from '../services/importPatientService.js';
import { getCanonicalHeaderMap, normalizeParsedRows } from '../services/csvXlsxUtils.js';
import { isPatientMetadataName } from '../utils/patientIdentity.js';
import {
  allocateMissingPatientCpf,
  formatCivilCpf,
  hasRealPatientCpf,
  isPlaceholderCpf,
  isRealPatientCpf,
  NO_CPF_TOKEN_PREFIX,
} from '../utils/patientCpfIdentity.js';
import { isCpfValid, formatCpf } from '../utils/validators.js';
import { buildProfessionalContractHtml } from '../components/clinical/contract/professionalContractTemplate.js';
import { LEGAL_CONTRACT_TEXTS } from '../components/clinical/contract/professionalContractClauses.js';

const admin = { id: 'user-admin', role: 'admin', tenant_id: 'tenant-1' };
const PATIENT_CPF = '52998224725';
const RESPONSIBLE_CPF = '39053344705';
const OTHER_CPF = '11144477735';

function mockFile(csvContent, filename = 'test.csv') {
  return { name: filename, text: () => Promise.resolve(csvContent) };
}

function seedTenant() {
  withDb((db) => {
    db.tenants = [{ id: 'tenant-1', name: 'Clínica Teste', status: 'active' }];
    return db;
  });
}

describe('PHASE_PATIENT_IMPORT_RECOVERY_05A — CPF placeholder identity', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedTenant();
  });

  it('CASO 1 — CPF paciente e CPF responsável preenchidos', () => {
    const headers = ['Nome Completo', 'CPF', 'CPF Responsável'];
    const map = getCanonicalHeaderMap(headers);
    const rows = normalizeParsedRows(
      [{ 'Nome Completo': 'Maria Silva Teste', CPF: PATIENT_CPF, 'CPF Responsável': RESPONSIBLE_CPF }],
      map,
    );
    expect(rows[0].cpf).toBe(PATIENT_CPF);
    expect(rows[0].cpf_responsavel).toBe(RESPONSIBLE_CPF);
  });

  it('CASO 2 — CPF paciente vazio não recebe CPF do responsável', () => {
    const headers = ['Nome Completo', 'CPF', 'CPF Responsável'];
    const map = getCanonicalHeaderMap(headers);
    const rows = normalizeParsedRows(
      [{ 'Nome Completo': 'Maria Silva Teste', CPF: '', 'CPF Responsável': RESPONSIBLE_CPF }],
      map,
    );
    expect(rows[0].cpf || '').toBe('');
    expect(rows[0].cpf_responsavel).toBe(RESPONSIBLE_CPF);
    expect(isRealPatientCpf(rows[0].cpf)).toBe(false);
  });

  it('CASO 3 — CPF vazio persiste estado sem identidade fiscal', () => {
    const created = createPatientFromImport(admin, {
      full_name: 'Paciente Sem Cpf Teste',
      sex: 'F',
      birth_date: '1990-01-01',
      cpf: '',
    }, ['cpf']);
    const persisted = loadDb().patients.find((p) => p.id === created.patientId);
    expect(persisted.cpf).toBe('');
    expect(isPlaceholderCpf(persisted.cpf)).toBe(true);
    expect(isRealPatientCpf(persisted.cpf)).toBe(false);
    expect(isCpfValid(persisted.cpf)).toBe(false);
    expect(formatCivilCpf(persisted.cpf)).toBe('');
    expect(formatCpf(persisted.cpf)).not.toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
  });

  it('CASO 4 — placeholder técnico não é CPF real', () => {
    const placeholder = generatePlaceholderCpf();
    const token = `${NO_CPF_TOKEN_PREFIX}patient-abc`;
    expect(placeholder).toBe(allocateMissingPatientCpf());
    expect(isPlaceholderCpf(placeholder)).toBe(true);
    expect(isRealPatientCpf(placeholder)).toBe(false);
    expect(isCpfValid(placeholder)).toBe(false);
    expect(isRealPatientCpf(token)).toBe(false);
    expect(isCpfValid(token)).toBe(false);
    expect(formatCivilCpf(token)).toBe('');
    expect(formatCpf(token)).toBe('');
    expect(formatCpf(token)).not.toBe('000.000.000-00');
    expect(isRealPatientCpf(PATIENT_CPF)).toBe(true);
    expect(hasRealPatientCpf({ cpf: PATIENT_CPF })).toBe(true);
    expect(hasRealPatientCpf({ cpf: placeholder })).toBe(false);
  });

  it('CASO 5 — documento/contrato não apresenta placeholder como CPF civil', () => {
    const html = buildProfessionalContractHtml({
      meta: {
        contractNumber: 'CTR-1',
        issueDate: '13/08/2026',
        issueDateExtenso: '13 de agosto de 2026',
        budgetNumber: 'ORC-1',
        city: 'Belo Horizonte - MG',
        clinicForumCity: 'Belo Horizonte - MG',
      },
      clinic: {
        name: 'Clínica Teste',
        legalName: 'Clínica Teste Ltda',
        cnpj: '12.345.678/0001-90',
        address: 'Rua A, 1',
        clinicForumCity: 'Belo Horizonte - MG',
        technicalResponsible: 'Dr. Teste',
        technicalResponsibleCro: 'CRO-MG 1',
      },
      patient: {
        name: 'Paciente Sem Cpf Teste',
        cpf: formatCivilCpf(''),
        rg: '',
        address: '',
      },
      professional: { name: 'Dr. Teste', cro: 'CRO-MG 1', specialty: '' },
      treatment: { planName: 'Avaliação', typeLabel: 'Clínico', startDate: '', endDate: '', notes: '' },
      procedures: [],
      financial: {
        originalValue: 0,
        originalValueFormatted: 'R$ 0,00',
        discount: 0,
        discountFormatted: 'R$ 0,00',
        finalValue: 0,
        finalValueFormatted: 'R$ 0,00',
        finalValueWords: '',
        paymentTitle: '',
        paymentMethodLabel: '',
        paymentType: 'a_vista',
        summaryLines: [],
        schedule: [],
      },
      legal: { jurisdiction: 'Belo Horizonte' },
      legalTexts: LEGAL_CONTRACT_TEXTS,
      treatmentWarranties: [],
    });
    expect(html).toContain('Paciente Sem Cpf Teste');
    expect(html).not.toMatch(/inscrito no CPF nº\s+\d/);
    expect(html).not.toContain('000.000.000-00');
    expect(formatCivilCpf(generatePlaceholderCpf())).toBe('');
  });

  it('CASO 6 — paciente sem CPF continua pesquisável por nome', async () => {
    const csv = 'nome_completo,cpf,data_nascimento,sexo\nHelena Sem Cpf Teste,,1990-01-01,F\n';
    const result = await importFromCsvOrXlsx(mockFile(csv), admin, 'create', {
      getCancelRequested: () => false,
    });
    expect(result.created).toBe(1);
    const persisted = loadDb().patients.find((p) => p.full_name === 'Helena Sem Cpf Teste');
    expect(persisted).toBeTruthy();
    expect(isRealPatientCpf(persisted.cpf)).toBe(false);
    const { results } = searchPatients('name', 'Helena Sem Cpf', 'tenant-1');
    expect(results.some((p) => p.id === persisted.id)).toBe(true);
    const suggested = suggestPatients('name', 'Helena', 10, 'tenant-1');
    expect(suggested.results.some((p) => p.id === persisted.id)).toBe(true);
  });

  it('CASO 7 — duplicidade real de CPF continua detectada', async () => {
    const csv = [
      'nome_completo,cpf,data_nascimento,sexo',
      `Ana Dup Teste,${PATIENT_CPF},1990-01-01,F`,
      `Ana Dup Dois Teste,${PATIENT_CPF},1991-01-01,F`,
    ].join('\n');
    const result = await importFromCsvOrXlsx(mockFile(csv), admin, 'create', {
      getCancelRequested: () => false,
    });
    expect(result.created).toBe(1);
    expect(result.duplicateSkipped).toBe(1);
    expect(result.reportRows.filter((r) => r.status === IMPORT_ROW_STATUS.DUPLICATE_SKIPPED)).toHaveLength(1);
  });

  it('CASO 8 — dois pacientes sem CPF não colidem tecnicamente', () => {
    const { patientIds } = createPatientsFromImportBatch(admin, [
      { payload: { full_name: 'Sem Cpf Um Teste', sex: 'F', birth_date: '1990-01-01', cpf: '' }, pendingFields: ['cpf'] },
      { payload: { full_name: 'Sem Cpf Dois Teste', sex: 'M', birth_date: '1991-01-01', cpf: '' }, pendingFields: ['cpf'] },
    ]);
    expect(patientIds).toHaveLength(2);
    expect(patientIds[0]).not.toBe(patientIds[1]);
    const patients = loadDb().patients.filter((p) => patientIds.includes(p.id));
    expect(patients).toHaveLength(2);
    expect(patients.every((p) => p.cpf === '')).toBe(true);
    expect(patients.every((p) => !isRealPatientCpf(p.cpf))).toBe(true);
  });

  it('CASO 9 — CPF Responsável nunca participa da deduplicação do paciente', async () => {
    const csv = [
      'Nome Completo,CPF,CPF Responsável,data_nascimento,sexo',
      `Filho Sem Cpf Teste,,${RESPONSIBLE_CPF},2010-01-01,M`,
      `Responsavel Civil Teste,${RESPONSIBLE_CPF},,1980-01-01,F`,
    ].join('\n');
    const result = await importFromCsvOrXlsx(mockFile(csv), admin, 'create', {
      getCancelRequested: () => false,
    });
    expect(result.created).toBe(2);
    expect(result.duplicateSkipped).toBe(0);
    const db = loadDb();
    const child = db.patients.find((p) => p.full_name === 'Filho Sem Cpf Teste');
    const responsible = db.patients.find((p) => p.full_name === 'Responsavel Civil Teste');
    expect(child.cpf).toBe('');
    expect(responsible.cpf).toBe(RESPONSIBLE_CPF);
    const childDocs = db.patientDocuments.find((d) => d.patient_id === child.id);
    expect(String(childDocs.responsible_cpf || '').replace(/\D/g, '')).toBe(RESPONSIBLE_CPF);
  });

  it('CASO 10 — metadata da planilha nunca vira paciente', async () => {
    const scope = 'Escopo: Todos os pacientes (sem filtro)';
    expect(isPatientMetadataName(scope)).toBe(true);
    const csv = [
      'Pacientes Exportados',
      'Filtros aplicados',
      scope,
      'Unidade de Origem',
      'nome_completo,cpf,data_nascimento,sexo',
      `Maria Civil Teste,${OTHER_CPF},1990-01-01,F`,
    ].join('\n');
    const result = await importFromCsvOrXlsx(mockFile(csv), admin, 'create', {
      getCancelRequested: () => false,
    });
    const names = loadDb().patients.map((p) => p.full_name);
    expect(names).toContain('Maria Civil Teste');
    expect(names.some((n) => isPatientMetadataName(n))).toBe(false);
    expect(names.some((n) => String(n).includes('Escopo'))).toBe(false);
    expect(names.some((n) => String(n).includes('Unidade de Origem'))).toBe(false);
    expect(result.created).toBe(1);
  });
});
