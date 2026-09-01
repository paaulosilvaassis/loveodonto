/**
 * POST-10.23 PATCH B — patient identity integrity.
 * Fixtures only. Sem mutar CTR-2026-00008 nem paciente de produção.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, loadDb, withDb } from '../db/index.js';
import {
  createPatientQuick,
  getPatient,
  updatePatientProfile,
} from '../services/patientService.js';
import { commitPatientCadastroProfile } from '../services/patientCadastroIdentityCommit.js';
import {
  LEGAL_IDENTITY_INCONSISTENT,
  PATIENT_IDENTITY_SAVE_BLOCKED,
  assertCadastroIdentitySaveAllowed,
  assertLegalPatientIdentityConsistency,
  listDirtyIdentityFields,
} from '../services/patientIdentityIntegrity.js';
import {
  createContractDraft,
  ensureContractsModuleSeeded,
} from '../services/contractModuleService.js';
import { buildSignatureSendFormDefaults } from '../services/contractSignatureFlowService.js';
import {
  buildBudgetPrintContext,
  buildBudgetPrintHtml,
} from '../components/clinical/budget/budgetPrintTemplate.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-patch-b-identity';
const PATIENT_A_NAME = 'Adilson Julio Xavier';
const PATIENT_A_RENAMED = 'Adilson Julio Xavier Filho';
const OPERATOR_NAME = 'Paulo Henrique Silva de Assis';
const OPERATOR_SURNAME = 'de Assis';
const OPERATOR_NICK = 'Paulo';

const admin = {
  id: 'user-operator-patch-b',
  role: 'admin',
  tenant_id: TENANT,
  tenantId: TENANT,
  name: OPERATOR_NAME,
  full_name: OPERATOR_NAME,
};

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function expectCode(fn, code) {
  try {
    fn();
    throw new Error(`expected ${code}`);
  } catch (err) {
    expect(err.code).toBe(code);
  }
}

function boundDraft(patientId, profile, { ready = true } = {}) {
  return {
    __patientId: patientId,
    __identityReady: ready,
    profile: { ...profile },
  };
}

function seedPatientAddress(patientId) {
  withDb((db) => {
    db.patientAddresses = [
      ...(db.patientAddresses || []).filter((row) => row.patient_id !== patientId),
      {
        patient_id: patientId,
        principal: true,
        logradouro: 'Rua Paciente',
        numero: '10',
        bairro: 'Savassi',
        cidade: 'Belo Horizonte',
        uf: 'MG',
        cep: '30130100',
      },
    ];
    return db;
  });
}

function latestProfileAudit(patientId) {
  return (loadDb().auditLogs || []).find((entry) => (
    entry.action === 'patients:update-profile' && entry.data?.patientId === patientId
  ));
}

describe('POST-10.23 PATCH B patient identity integrity', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [{ id: TENANT, name: 'Clinica Patch B', status: 'active' }];
      db.clinicProfile = { id: 'clinic-patch-b', razaoSocial: 'Clinica Patch B', tenant_id: TENANT };
      db.clinicDocumentation = {
        cnpj: '12345678000199',
        responsavelTecnico: 'Dr. Responsavel Teste',
        conselhoRegionalNumero: 'CRO-MG 12345',
      };
      db.clinicAddresses = [{
        principal: true,
        logradouro: 'Rua Clinica',
        numero: '1',
        bairro: 'Centro',
        cidade: 'Belo Horizonte',
        uf: 'MG',
        cep: '30100000',
      }];
      return db;
    });
  });

  it('incident class: unrelated cadastro save does not copy operator identity', () => {
    const created = createPatientQuick(admin, {
      full_name: PATIENT_A_NAME,
      nickname: '',
      social_name: '',
      sex: 'M',
      birth_date: '1985-02-25',
      cpf: '52998224725',
    });
    const live = getPatient(created.patientId);
    const original = { ...live.profile };
    const draft = boundDraft(created.patientId, {
      ...original,
      lead_source: 'agenda',
    });

    commitPatientCadastroProfile(admin, {
      routePatientId: created.patientId,
      draft,
      originalProfile: original,
    });

    const after = getPatient(created.patientId).profile;
    expect(after.full_name).toBe(PATIENT_A_NAME);
    expect(after.nickname || '').toBe('');
    expect(after.social_name || '').toBe('');
    expect(after.full_name).not.toBe(OPERATOR_SURNAME);
    expect(after.nickname).not.toBe(OPERATOR_NICK);
    expect(after.social_name).not.toBe(OPERATOR_NICK);
  });

  it('incident class: dirty=[] ignores foreign identity in generic payload', () => {
    const created = createPatientQuick(admin, {
      full_name: PATIENT_A_NAME,
      sex: 'M',
      birth_date: '1985-02-25',
      cpf: '16203944645',
    });
    updatePatientProfile(admin, created.patientId, {
      full_name: OPERATOR_SURNAME,
      nickname: OPERATOR_NICK,
      social_name: OPERATOR_NICK,
      sex: 'M',
      birth_date: '1985-02-25',
      cpf: '16203944645',
    }, {
      source: 'patient-cadastro',
      dirtyIdentityFields: [],
    });
    const after = getPatient(created.patientId).profile;
    expect(after.full_name).toBe(PATIENT_A_NAME);
    expect(after.nickname || '').toBe('');
    expect(after.social_name || '').toBe('');
  });

  it('incident class: budget PDF, snapshot and recipient keep canonical name', () => {
    const created = createPatientQuick(admin, {
      full_name: PATIENT_A_NAME,
      sex: 'M',
      birth_date: '1985-02-25',
      cpf: '39053344705',
    });
    commitPatientCadastroProfile(admin, {
      routePatientId: created.patientId,
      draft: boundDraft(created.patientId, getPatient(created.patientId).profile),
      originalProfile: getPatient(created.patientId).profile,
    });
    seedPatientAddress(created.patientId);

    withDb((db) => {
      db.crmBudgets = [{
        id: 'budget-patch-b',
        title: 'Restauracao',
        patientId: created.patientId,
        leadId: 'lead-patch-b',
        status: 'APROVADO',
        totalValue: 1000,
        paymentMethod: 'A vista',
        itemsJson: [{ description: 'Restauracao', value: 1000 }],
        createdAt: new Date().toISOString(),
      }];
      return db;
    });
    ensureContractsModuleSeeded();
    const tpl = loadDb().contractTemplates.find((row) => row.type === 'system_default');
    const contract = createContractDraft(admin, {
      quoteSource: 'crm_budget',
      quoteId: 'budget-patch-b',
      patientId: created.patientId,
      templateId: tpl.id,
    });

    const print = buildBudgetPrintContext({
      db: loadDb(),
      patient: getPatient(created.patientId).profile,
      professional: { nomeCompleto: 'Dra. Juliana de Oliveira Freire' },
      appointment: { id: 'appt-patch-b' },
      budget: { budgetNumber: 'ORC-PATCH-B', procedures: [], totalValue: 1000 },
      financials: { total: 1000 },
    });
    const html = buildBudgetPrintHtml(print);
    const defaults = buildSignatureSendFormDefaults({
      patientId: created.patientId,
      professional: {},
      settings: {},
    });

    expect(print.patient.name).toBe(PATIENT_A_NAME);
    expect(html).toContain(`<span class="chip-value">${PATIENT_A_NAME}</span>`);
    expect(html).not.toContain(`<span class="chip-value">${OPERATOR_SURNAME}</span>`);
    expect(contract.patientSnapshotJson.full_name).toBe(PATIENT_A_NAME);
    expect(defaults.patientName).toBe(PATIENT_A_NAME);
  });

  it('stale / race: draft bound to another patientId blocks save', () => {
    const patientA = createPatientQuick(admin, {
      full_name: PATIENT_A_NAME,
      sex: 'M',
      birth_date: '1985-02-25',
      cpf: '52998224725',
    });
    const patientB = createPatientQuick(admin, {
      full_name: 'Bruno Outro Paciente',
      sex: 'M',
      birth_date: '1990-01-01',
      cpf: '16203944645',
    });
    const staleDraft = boundDraft(patientB.patientId, {
      ...getPatient(patientB.patientId).profile,
      full_name: OPERATOR_SURNAME,
      nickname: OPERATOR_NICK,
      social_name: OPERATOR_NICK,
    });
    expectCode(() => commitPatientCadastroProfile(admin, {
      routePatientId: patientA.patientId,
      draft: staleDraft,
      originalProfile: getPatient(patientA.patientId).profile,
    }), PATIENT_IDENTITY_SAVE_BLOCKED);
    expect(getPatient(patientA.patientId).profile.full_name).toBe(PATIENT_A_NAME);
  });

  it('stale / race: save before identity load is blocked', () => {
    const patientA = createPatientQuick(admin, {
      full_name: PATIENT_A_NAME,
      sex: 'M',
      birth_date: '1985-02-25',
      cpf: '52998224725',
    });
    expectCode(() => assertCadastroIdentitySaveAllowed({
      routePatientId: patientA.patientId,
      draft: boundDraft(patientA.patientId, { full_name: OPERATOR_SURNAME }, { ready: false }),
      livePatient: getPatient(patientA.patientId),
    }), PATIENT_IDENTITY_SAVE_BLOCKED);
  });

  it('legitimate name change succeeds and records before/after audit', () => {
    const created = createPatientQuick(admin, {
      full_name: PATIENT_A_NAME,
      sex: 'M',
      birth_date: '1985-02-25',
      cpf: '52998224725',
    });
    const original = { ...getPatient(created.patientId).profile };
    const draft = boundDraft(created.patientId, {
      ...original,
      full_name: PATIENT_A_RENAMED,
    });
    expect(listDirtyIdentityFields(original, draft.profile)).toEqual(['full_name']);
    commitPatientCadastroProfile(admin, {
      routePatientId: created.patientId,
      draft,
      originalProfile: original,
    });
    expect(getPatient(created.patientId).profile.full_name).toBe(PATIENT_A_RENAMED);

    const audit = latestProfileAudit(created.patientId);
    expect(audit.data.patientId).toBe(created.patientId);
    expect(audit.data.actorId).toBe(admin.id);
    expect(audit.data.changedFields).toEqual(['full_name']);
    expect(audit.data.before).toEqual({ full_name: PATIENT_A_NAME });
    expect(audit.data.after).toEqual({ full_name: PATIENT_A_RENAMED });
    expect(audit.data.reason).toBeNull();
    expect(audit.data).not.toHaveProperty('cpf');
    expect(JSON.stringify(audit.data)).not.toMatch(/password|token|prontuario/i);

    seedPatientAddress(created.patientId);
    withDb((db) => {
      db.crmBudgets = [{
        id: 'budget-rename',
        title: 'Restauracao',
        patientId: created.patientId,
        leadId: 'lead-rename',
        status: 'APROVADO',
        totalValue: 500,
        paymentMethod: 'A vista',
        itemsJson: [{ description: 'Restauracao', value: 500 }],
        createdAt: new Date().toISOString(),
      }];
      return db;
    });
    ensureContractsModuleSeeded();
    const tpl = loadDb().contractTemplates.find((row) => row.type === 'system_default');
    const contract = createContractDraft(admin, {
      quoteSource: 'crm_budget',
      quoteId: 'budget-rename',
      patientId: created.patientId,
      templateId: tpl.id,
    });
    expect(contract.patientSnapshotJson.full_name).toBe(PATIENT_A_RENAMED);
  });

  it('legal freeze fail-closed when live, snapshot and recipient diverge', () => {
    expectCode(() => assertLegalPatientIdentityConsistency({
      patientId: 'patient-a',
      liveFullName: PATIENT_A_NAME,
      snapshotFullName: OPERATOR_SURNAME,
      requireLiveAndSnapshot: true,
    }), LEGAL_IDENTITY_INCONSISTENT);
    expectCode(() => assertLegalPatientIdentityConsistency({
      patientId: 'patient-a',
      liveFullName: PATIENT_A_NAME,
      snapshotFullName: PATIENT_A_NAME,
      recipientPatientName: OPERATOR_NAME,
    }), LEGAL_IDENTITY_INCONSISTENT);
  });

  it('ceremony policy records divergence and does not auto-normalize typed name', () => {
    const moduleSrc = readSrc('src/services/contractModuleService.js');
    expect(moduleSrc).toContain('namesDiverged: namesDiverge(registeredSignerName, typedName)');
    expect(moduleSrc).not.toMatch(/patientSnapshotJson\.full_name\s*=\s*typed/);
    expect(moduleSrc).not.toMatch(/registeredSignerName\s*=\s*typedName/);
    const evidenceSrc = readSrc('src/contracts/remoteSignatureEvidence.js');
    expect(evidenceSrc).toContain('typedSignerName');
    expect(evidenceSrc).toContain('registeredSignerName');
  });

  it('audit reason: incident recovery persists trimmed reason on the same update-profile event', () => {
    const created = createPatientQuick(admin, {
      full_name: PATIENT_A_NAME,
      sex: 'M',
      birth_date: '1985-02-25',
      cpf: '52998224725',
    });
    updatePatientProfile(admin, created.patientId, {
      full_name: PATIENT_A_RENAMED,
    }, {
      source: 'patient-identity-incident-recovery',
      dirtyIdentityFields: ['full_name'],
      reason: 'Controlled remediation test',
    });

    const after = getPatient(created.patientId).profile;
    expect(after.full_name).toBe(PATIENT_A_RENAMED);
    expect(after.nickname || '').toBe('');
    expect(after.social_name || '').toBe('');

    const audit = latestProfileAudit(created.patientId);
    expect(audit.action).toBe('patients:update-profile');
    expect(audit.data.source).toBe('patient-identity-incident-recovery');
    expect(audit.data.changedFields).toEqual(['full_name']);
    expect(audit.data.before).toEqual({ full_name: PATIENT_A_NAME });
    expect(audit.data.after).toEqual({ full_name: PATIENT_A_RENAMED });
    expect(audit.data.reason).toBe('Controlled remediation test');
  });

  it('audit reason: omitted reason stays compatible as null', () => {
    const created = createPatientQuick(admin, {
      full_name: PATIENT_A_NAME,
      sex: 'M',
      birth_date: '1985-02-25',
      cpf: '16203944645',
    });
    updatePatientProfile(admin, created.patientId, {
      full_name: PATIENT_A_RENAMED,
    }, {
      source: 'patient-cadastro',
      dirtyIdentityFields: ['full_name'],
    });
    const audit = latestProfileAudit(created.patientId);
    expect(audit.data.source).toBe('patient-cadastro');
    expect(audit.data.changedFields).toEqual(['full_name']);
    expect(audit.data.reason).toBeNull();
  });

  it('audit reason: whitespace-only reason normalizes to null', () => {
    const created = createPatientQuick(admin, {
      full_name: PATIENT_A_NAME,
      sex: 'M',
      birth_date: '1985-02-25',
      cpf: '39053344705',
    });
    updatePatientProfile(admin, created.patientId, {
      full_name: PATIENT_A_RENAMED,
    }, {
      source: 'patient-identity-incident-recovery',
      dirtyIdentityFields: ['full_name'],
      reason: '   ',
    });
    const audit = latestProfileAudit(created.patientId);
    expect(audit.data.reason).toBeNull();
    expect(audit.data.source).toBe('patient-identity-incident-recovery');
  });

  it('audit reason: surrounding whitespace is trimmed without other transforms', () => {
    const created = createPatientQuick(admin, {
      full_name: PATIENT_A_NAME,
      sex: 'M',
      birth_date: '1985-02-25',
      cpf: '11144477735',
    });
    updatePatientProfile(admin, created.patientId, {
      full_name: PATIENT_A_RENAMED,
    }, {
      source: 'patient-identity-incident-recovery',
      dirtyIdentityFields: ['full_name'],
      reason: '  Incident recovery  ',
    });
    const audit = latestProfileAudit(created.patientId);
    expect(audit.data.reason).toBe('Incident recovery');
  });

  it('cadastro writer initializes identity only from target patient, with load/bind gates', () => {
    const page = readSrc('src/pages/PatientCadastroPage.jsx');
    expect(page).toContain('commitPatientCadastroProfile');
    expect(page).toContain('__patientId');
    expect(page).toContain('__identityReady');
    expect(page).toContain('autoComplete="off"');
    expect(page).toContain('patient-identity-full-name-');
    expect(page).not.toMatch(/draft\.profile\.full_name\s*=\s*.*user/);
    expect(page).not.toMatch(/currentUser/);
    expect(page).toMatch(/if \(!patient\) \{[\s\S]*__identityReady = false/);
    const snapshots = readSrc('src/services/contractModuleService.js');
    expect(snapshots).toContain('full_name: patientBundle?.profile?.full_name');
    expect(snapshots).toContain('assertLegalPatientIdentityConsistency');
  });
});
